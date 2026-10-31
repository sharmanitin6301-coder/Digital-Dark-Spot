/**
 * Targeted Test Suite for Gemini Quota & Rate Limit Review
 */
require('dotenv').config();
const {
  getGeminiClient,
  generateAnalysis,
  classifyGeminiError,
  executeWithBackoff,
  formatGeminiError,
  PRIMARY_MODEL,
  FALLBACK_MODEL
} = require('../services/geminiService');

const testResults = [];

function record(name, expected, actual, pass, detail) {
  testResults.push({ name, expected, actual, pass: Boolean(pass), detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}`);
  if (!pass) {
    console.error(`       Expected: ${expected}`);
    console.error(`       Actual:   ${actual}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('DIGITAL DARK SPOT — GEMINI QUOTA & RATE LIMIT REVIEW TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Model Configurations & SDK Compatibility
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Model Configuration & Stable Fallback Verification ---');
  record(
    'Primary model is gemini-3.8-flash',
    'gemini-3.8-flash',
    PRIMARY_MODEL,
    PRIMARY_MODEL === 'gemini-3.8-flash',
    `PRIMARY_MODEL: ${PRIMARY_MODEL}`
  );

  record(
    'Fallback model is gemini-3.6-flash',
    'gemini-3.6-flash',
    FALLBACK_MODEL,
    FALLBACK_MODEL === 'gemini-3.6-flash',
    `FALLBACK_MODEL: ${FALLBACK_MODEL}`
  );

  // Test live compatibility of gemini-3.6-flash with SDK
  let sdk36Compatible = false;
  let test36Text = '';
  try {
    const ai = getGeminiClient();
    const res = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: 'Respond with the word "VERIFIED" only.'
    });
    test36Text = (res.text || '').trim();
    sdk36Compatible = test36Text.includes('VERIFIED');
  } catch (err) {
    test36Text = err.message;
  }
  record(
    'gemini-3.6-flash SDK & API key compatibility',
    'Successful response containing VERIFIED',
    test36Text,
    sdk36Compatible,
    `Response: "${test36Text}"`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Error Classification (No Universal 20 Limit Claim)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Error Classification & Tier-Aware Messaging ---');

  // 2a. Daily quota error classification
  const mockDailyQuotaErr = {
    status: 429,
    message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash, description: Generate content requests per day limit exceeded on Free Tier.',
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      details: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }]
    }
  };
  const classifiedDaily = classifyGeminiError(mockDailyQuotaErr);
  const dailyNoHardcode =
    classifiedDaily.type === 'QUOTA_EXHAUSTED' &&
    !classifiedDaily.message.includes('universal 20') &&
    classifiedDaily.message.includes('tier') &&
    classifiedDaily.message.includes('Google AI Studio');

  record(
    'Daily quota error correctly classified as QUOTA_EXHAUSTED without universal 20 claim',
    'Type QUOTA_EXHAUSTED, mentions project/tier without universal claim',
    `Type: ${classifiedDaily.type}; Message: "${classifiedDaily.message}"`,
    dailyNoHardcode,
    classifiedDaily
  );

  // 2b. Temporary burst rate limit (RPM) classification
  const mockRpmErr = {
    status: 429,
    message: 'Resource has been exhausted (e.g. check quota). Rate limit exceeded.',
    error: { code: 429, status: 'RESOURCE_EXHAUSTED' }
  };
  const classifiedRpm = classifyGeminiError(mockRpmErr);
  record(
    'Temporary burst rate limit classified as RATE_LIMIT_TEMPORARY',
    'Type RATE_LIMIT_TEMPORARY with wait message',
    `Type: ${classifiedRpm.type}; Message: "${classifiedRpm.message}"`,
    classifiedRpm.type === 'RATE_LIMIT_TEMPORARY' && classifiedRpm.message.includes('moment and try again'),
    classifiedRpm
  );

  // 2c. Service Unavailable 503 classification
  const mock503Err = {
    status: 503,
    message: 'The model is overloaded. Please try again later.'
  };
  const classified503 = classifyGeminiError(mock503Err);
  record(
    '503 High demand classified as SERVICE_UNAVAILABLE',
    'Type SERVICE_UNAVAILABLE with busy message',
    `Type: ${classified503.type}; Message: "${classified503.message}"`,
    classified503.type === 'SERVICE_UNAVAILABLE',
    classified503
  );

  // 2d. Auth error 401/403 classification
  const mockAuthErr = {
    status: 401,
    message: 'API_KEY_INVALID'
  };
  const classifiedAuth = classifyGeminiError(mockAuthErr);
  record(
    '401 Auth error classified as AUTH',
    'Type AUTH with config verification message',
    `Type: ${classifiedAuth.type}; Message: "${classifiedAuth.message}"`,
    classifiedAuth.type === 'AUTH',
    classifiedAuth
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Controlled Exponential Backoff Behavior
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Controlled Exponential Backoff & Retry Logic ---');

  // 3a. Transient 429 retry succeeds after backoff
  let callCount429 = 0;
  const timestamps429 = [];
  const testBackoff429 = async () => {
    timestamps429.push(Date.now());
    callCount429++;
    if (callCount429 < 2) {
      const err = new Error('Rate limit exceeded');
      err.status = 429;
      throw err;
    }
    return 'SUCCESS_AFTER_RETRY';
  };

  const backoffResult = await executeWithBackoff(testBackoff429, 'test-model');
  const delayObserved = timestamps429[1] - timestamps429[0];
  const backoffPassed = backoffResult === 'SUCCESS_AFTER_RETRY' && callCount429 === 2 && delayObserved >= 1000;
  record(
    'Temporary 429 triggers controlled exponential backoff and succeeds on retry',
    'Calls: 2, delay >= 1000ms, result: SUCCESS_AFTER_RETRY',
    `Calls: ${callCount429}, delay: ${delayObserved}ms, result: ${backoffResult}`,
    backoffPassed,
    { callCount: callCount429, delayObserved }
  );

  // 3b. Daily quota exhaustion stops retrying IMMEDIATELY (0 retries wasted)
  let callCountDaily = 0;
  let dailyStoppedImmediately = false;
  let dailyCaughtError = null;
  const testImmediateStop = async () => {
    callCountDaily++;
    const err = new Error('Generate content requests per day limit exceeded on Free Tier');
    err.status = 429;
    throw err;
  };

  try {
    await executeWithBackoff(testImmediateStop, 'test-model');
  } catch (err) {
    dailyCaughtError = err;
    dailyStoppedImmediately = callCountDaily === 1 && err.errorType === 'QUOTA_EXHAUSTED';
  }

  record(
    'Daily quota exhaustion stops retrying immediately (zero retries wasted)',
    '1 call only, errorType: QUOTA_EXHAUSTED',
    `Calls: ${callCountDaily}, errorType: ${dailyCaughtError ? dailyCaughtError.errorType : 'none'}`,
    dailyStoppedImmediately,
    { callCount: callCountDaily, message: dailyCaughtError ? dailyCaughtError.message : '' }
  );

  // 3c. Auth errors (401/403) stop retrying IMMEDIATELY
  let callCountAuth = 0;
  let authStoppedImmediately = false;
  let authCaughtError = null;
  const testAuthStop = async () => {
    callCountAuth++;
    const err = new Error('API key not valid');
    err.status = 401;
    throw err;
  };

  try {
    await executeWithBackoff(testAuthStop, 'test-model');
  } catch (err) {
    authCaughtError = err;
    authStoppedImmediately = callCountAuth === 1 && err.errorType === 'AUTH';
  }

  record(
    '401 Auth error stops retrying immediately without fallback',
    '1 call only, errorType: AUTH, status: 401',
    `Calls: ${callCountAuth}, status: ${authCaughtError ? authCaughtError.status : 'none'}`,
    authStoppedImmediately,
    { callCount: callCountAuth, status: authCaughtError ? authCaughtError.status : null }
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Live Gemini Analysis Execution with Fallback & model_used Exposure
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Live Analysis Execution & Transparent Model Labeling ---');

  const testSources = [
    {
      id: 'S1',
      url: 'https://archive.org/terms/guidelines',
      title: 'Institutional Guidelines',
      text: 'Institutional grant policy requires full-time enrollment and minimum 3.2 cumulative GPA. The maximum household income threshold is $45,000 annually. Applications close on October 15, 2026.',
      detectedDate: '2026-09-01'
    },
    {
      id: 'S2',
      url: 'https://archive.org/terms/updates',
      title: 'Advisory Updates',
      text: 'Advisory bulletin: First-generation college attendees receive priority review regardless of GPA if family income is under $50,000. Renewal requires 30 earned credit hours per academic year.',
      detectedDate: '2026-10-01'
    }
  ];

  console.log('Executing live analysis with valid sources...');
  let liveResult;
  let liveSuccess = false;
  try {
    liveResult = await generateAnalysis('What are the GPA and income requirements?', testSources);
    liveSuccess = Boolean(
      liveResult &&
      liveResult.rawAnalysis &&
      liveResult.modelUsed &&
      liveResult.rawAnalysis.summary &&
      liveResult.rawAnalysis.summary.length > 0
    );
  } catch (err) {
    console.error('Live analysis failed:', err);
  }

  record(
    'Normal Gemini analysis completes successfully',
    'Structured JSON with summary points, confidence, and valid modelUsed',
    liveSuccess ? `Model used: ${liveResult.modelUsed}, isFallback: ${liveResult.isFallback}, summary count: ${liveResult.rawAnalysis.summary.length}` : 'Failed',
    liveSuccess,
    liveSuccess ? { modelUsed: liveResult.modelUsed, isFallback: liveResult.isFallback } : null
  );

  record(
    'Response exposes model_used and transparent fallback indicator',
    'modelUsed is either gemini-3.8-flash or gemini-3.6-flash with isFallback flag',
    liveResult ? `modelUsed: ${liveResult.modelUsed}, isFallback: ${liveResult.isFallback}` : 'No result',
    Boolean(liveResult && (liveResult.modelUsed === 'gemini-3.8-flash' || liveResult.modelUsed === 'gemini-3.6-flash') && typeof liveResult.isFallback === 'boolean'),
    liveResult ? { modelUsed: liveResult.modelUsed, isFallback: liveResult.isFallback } : null
  );

  // ---------------------------------------------------------------------------
  // TEST 5: No Silent Sample Demo Substitution
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: No Silent Sample Demo Substitution on Live Failure ---');
  const appJsCode = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8');

  // Verify that handleFormSubmit catch block does NOT call handleSampleDemo or renderResults with sample data
  const formSubmitCatch = appJsCode.slice(
    appJsCode.indexOf('async function handleFormSubmit'),
    appJsCode.indexOf('// SCREEN 3: RESULTS DASHBOARD')
  );
  const doesNotSubstituteSample =
    !formSubmitCatch.includes('handleSampleDemo()') &&
    !formSubmitCatch.includes('state.isSampleDemo = true') &&
    formSubmitCatch.includes('elements.resultsSection.hidden = true') &&
    formSubmitCatch.includes('showError(');

  record(
    'Never silently substitute Sample Demo results for failed Live Analysis',
    'Failed submit hides results, sets state.analysis = null, shows error banner, 0 sample calls',
    doesNotSubstituteSample ? 'Verified: catch block strictly hides results and displays error banner' : 'Silent substitution found',
    doesNotSubstituteSample,
    'catch block strictly calls showError() and leaves results hidden'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Zero Secret Leakage in Logs and Responses
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Zero Secret Leakage Verification ---');
  const apiKey = process.env.GEMINI_API_KEY || '';
  const formattedAuth = formatGeminiError(new Error(`API key ${apiKey} invalid`));
  const noKeyInError = !formattedAuth.message.includes(apiKey) && apiKey.length > 10;

  record(
    'API keys stripped and never exposed in error responses or logs',
    'Secret key string absent from formatted client messages',
    noKeyInError ? 'Clean: zero secret key leakage' : 'KEY LEAK DETECTED',
    noKeyInError,
    `Error message: "${formattedAuth.message}"`
  );

  console.log('\n================================================================');
  console.log('AUDIT SUMMARY:');
  console.log('================================================================');
  console.table(
    testResults.map(r => ({
      Test: r.name,
      Status: r.pass ? 'PASS' : 'FAIL',
      Details: r.actual
    }))
  );

  const allPassed = testResults.every(r => r.pass);
  console.log(`\nOverall Review Status: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'FAILURES DETECTED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
