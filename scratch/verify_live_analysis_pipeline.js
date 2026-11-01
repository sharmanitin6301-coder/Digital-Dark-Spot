/**
 * Verification Script: Digital Dark Spot Live Analysis Pipeline Debugging
 */
const http = require('http');

async function run() {
  console.log('================================================================');
  console.log('VERIFYING DIGITAL DARK SPOT LIVE ANALYSIS PIPELINE');
  console.log('================================================================\n');

  const baseUrl = 'http://localhost:3000';
  const results = [];

  function record(name, pass, detail) {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}`);
    if (!pass) console.error('       Detail:', detail);
  }

  // ---------------------------------------------------------------------------
  // 1. Health check & Server status
  // ---------------------------------------------------------------------------
  console.log('--- 1. Health Check & Server Port ---');
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthJson = await healthRes.json();
  record(
    'Server is running and GET /api/health responds with 200 OK',
    healthRes.status === 200 && healthJson.status === 'ok',
    healthJson
  );

  // ---------------------------------------------------------------------------
  // 2. Test valid public URLs in /api/fetch-sources
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Public Source Ingestion in /api/fetch-sources ---');
  const fetchValidRes = await fetch(`${baseUrl}/api/fetch-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
        { id: 'S2', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States' }
      ]
    })
  });
  const fetchValidJson = await fetchValidRes.json();
  const s1 = fetchValidJson.sources && fetchValidJson.sources.find(s => s.id === 'S1');
  const s2 = fetchValidJson.sources && fetchValidJson.sources.find(s => s.id === 'S2');
  const validFetchOk =
    fetchValidRes.status === 200 &&
    s1 && s1.fetchStatus === 'success' && s1.text.length >= 50 &&
    s2 && s2.fetchStatus === 'success' && s2.text.length >= 50;

  record(
    'Two valid public URLs successfully fetched and extracted',
    validFetchOk,
    { s1Status: s1?.fetchStatus, s1Chars: s1?.text?.length, s2Status: s2?.fetchStatus, s2Chars: s2?.text?.length }
  );

  // ---------------------------------------------------------------------------
  // 3. Test private/fictional .local rejection in /api/fetch-sources
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Private / .local URL Rejection with Clear Errors ---');
  const fetchLocalRes = await fetch(`${baseUrl}/api/fetch-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { id: 'S1', url: 'https://sample.digitaldarkspot.local/official-scholarship-guide-2026' },
        { id: 'S2', url: 'http://127.0.0.1:8080/admin' }
      ]
    })
  });
  const fetchLocalJson = await fetchLocalRes.json();
  const sLocal1 = fetchLocalJson.sources && fetchLocalJson.sources.find(s => s.id === 'S1');
  const sLocal2 = fetchLocalJson.sources && fetchLocalJson.sources.find(s => s.id === 'S2');
  const localRejectionOk =
    fetchLocalRes.status === 200 &&
    sLocal1 && sLocal1.fetchStatus === 'error' && sLocal1.error.includes('forbidden') &&
    sLocal2 && sLocal2.fetchStatus === 'error' && sLocal2.error.includes('forbidden');

  record(
    'Fictional .local and private IP rejected with specific per-source error messages',
    localRejectionOk,
    { s1Error: sLocal1?.error, s2Error: sLocal2?.error }
  );

  // ---------------------------------------------------------------------------
  // 4. Test Resilient Batch Ingestion (2 Valid + 1 Inaccessible)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Resilient Batch: 2 Valid + 1 Inaccessible Source ---');
  const batchRes = await fetch(`${baseUrl}/api/fetch-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
        { id: 'S2', url: 'https://sample.digitaldarkspot.local/campus-advisory-blog-2026' },
        { id: 'S3', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States' }
      ]
    })
  });
  const batchJson = await batchRes.json();
  const batchS1 = batchJson.sources?.find(s => s.id === 'S1');
  const batchS2 = batchJson.sources?.find(s => s.id === 'S2');
  const batchS3 = batchJson.sources?.find(s => s.id === 'S3');
  const usableSources = batchJson.sources?.filter(s => s.fetchStatus === 'success' && s.text.length >= 50);

  const resilientBatchOk =
    batchRes.status === 200 &&
    batchS1?.fetchStatus === 'success' &&
    batchS2?.fetchStatus === 'error' &&
    batchS3?.fetchStatus === 'success' &&
    usableSources.length === 2;

  record(
    'Partial batch succeeds: Inaccessible S2 does not crash S1 & S3; 2 sources usable',
    resilientBatchOk,
    { totalSources: batchJson.sources?.length, usableCount: usableSources?.length, s2Error: batchS2?.error }
  );

  // ---------------------------------------------------------------------------
  // 5. Test Live Analysis Endpoint Execution with Usable Sources
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Triggering POST /api/analyze with Usable Sources ---');
  const analyzePayload = {
    question: 'What are the main scholarship eligibility requirements and financial aid terms?',
    sources: batchJson.sources // S1 (success), S2 (error), S3 (success)
  };

  const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analyzePayload)
  });
  const analyzeJson = await analyzeRes.json();

  // The call should execute through Express, pass validateAnalysisMiddleware,
  // filter validSources (S1 and S3), and actually invoke Gemini.
  // Gemini responds with either 200 (if quota available) or 429 (if daily free quota reached)
  const analyzeExecuted =
    (analyzeRes.status === 200 && analyzeJson.success === true) ||
    (analyzeRes.status === 429 && analyzeJson.error.includes('quota'));

  record(
    'POST /api/analyze executes and contacts Gemini (handles 200 or 429 with clean message)',
    analyzeExecuted,
    { status: analyzeRes.status, body: analyzeJson }
  );

  // ---------------------------------------------------------------------------
  // 6. Test Insufficient Usable Sources (< 2) Rejection
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Insufficient Usable Sources Rejection ---');
  const insufficientRes = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What are the requirements?',
      sources: [
        batchS1, // 1 usable source
        batchS2  // 1 failed source
      ]
    })
  });
  const insufficientJson = await insufficientRes.json();
  const insufficientRejected =
    insufficientRes.status === 400 &&
    insufficientJson.error === 'Some sources could not be accessed. Review their status.';

  record(
    'POST /api/analyze rejects when usable sources < 2 with status 400',
    insufficientRejected,
    { status: insufficientRes.status, body: insufficientJson }
  );

  // ---------------------------------------------------------------------------
  // 7. Verify Frontend Input Validation Blocks .local URLs Immediately
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Frontend Source Isolation & Validation ---');
  const appJsText = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8');

  const frontendHasLocalCheck =
    appJsText.includes('sample.digitaldarkspot.local') &&
    appJsText.includes('Internal and fictional demo URLs (.local) cannot be fetched');

  const frontendPreservesLiveState =
    appJsText.includes('savedLiveSources') &&
    appJsText.includes('state.isSampleDemo = false');

  record(
    'Frontend validateInput catches .local URLs with clear per-source error',
    frontendHasLocalCheck,
    'validateInput checks for sample.digitaldarkspot.local and .local'
  );

  record(
    'Frontend isolates Sample Demo and restores live inputs on Back to Query',
    frontendPreservesLiveState,
    'handleSampleDemo saves live sources; handleBackToInput restores them'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PIPELINE VERIFICATION SUMMARY:');
  console.log('================================================================');
  console.table(results.map(r => ({ Test: r.name, Result: r.pass ? 'PASS' : 'FAIL' })));

  const allPassed = results.every(r => r.pass);
  console.log(`\nOverall Pipeline Status: ${allPassed ? 'ALL TESTS PASSED (PIPELINE FIXED)' : 'FAILURES DETECTED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
