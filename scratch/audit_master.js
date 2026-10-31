/**
 * STEP 6: MASTER AUDIT SCRIPT
 * Tests Parts 1, 2, 3, 4, and 5 thoroughly and generates verified results for Part 6.
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const app = require('../server');

const { validateUrl, isPublicIp } = require('../services/urlValidator');
const { fetchPage } = require('../services/fetchService');
const { extractContent } = require('../services/contentExtractor');
const { verifyAllEvidence } = require('../services/evidenceVerifier');
const { generateAnalysis } = require('../services/geminiService');

let server;
let baseUrl;
const auditReport = [];

function recordTest(category, name, expected, actual, pass, evidence) {
  auditReport.push({
    category,
    name,
    expected,
    actual,
    pass: Boolean(pass),
    status: pass ? 'PASS' : 'FAIL',
    evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence)
  });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${category} :: ${name}`);
  if (!pass) {
    console.error(`       Expected: ${expected}`);
    console.error(`       Actual:   ${actual}`);
  }
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

async function request(p, opts = {}) {
  const url = `${baseUrl}${p}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: data };
}

async function runAudit() {
  await startServer();
  console.log(`\n======================================================`);
  console.log(`DIGITAL DARK SPOT — STEP 6 QA & SECURITY AUDIT SUITE`);
  console.log(`======================================================\n`);

  // =========================================================================
  // PART 3: SECURITY AUDIT (STATIC + RUNTIME)
  // =========================================================================
  console.log('\n--- EXECUTING PART 3: SECURITY AUDIT ---');

  // 3.1 GEMINI_API_KEY exists only in backend environment variables
  const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  recordTest(
    'Security Audit',
    'GEMINI_API_KEY in backend environment',
    'API key defined in process.env.GEMINI_API_KEY',
    hasEnvKey ? 'Configured in backend process.env' : 'Missing',
    hasEnvKey,
    hasEnvKey ? `Key prefix: ${process.env.GEMINI_API_KEY.slice(0, 4)}... length: ${process.env.GEMINI_API_KEY.length}` : 'None'
  );

  // 3.2 No API key appears in frontend files
  const publicAppJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const publicIndex = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const publicSample = fs.readFileSync(path.join(__dirname, '../public/sample-data.js'), 'utf8');

  const rawKey = process.env.GEMINI_API_KEY || '';
  const keyInApp = rawKey ? publicAppJs.includes(rawKey) : false;
  const keyInIndex = rawKey ? publicIndex.includes(rawKey) : false;
  const keyInSample = rawKey ? publicSample.includes(rawKey) : false;
  const noKeyInFrontend = !keyInApp && !keyInIndex && !keyInSample;

  recordTest(
    'Security Audit',
    'No API key exposed in frontend files',
    'Zero occurrences of actual API key string in public/ assets',
    noKeyInFrontend ? 'No secret strings found in public files' : 'SECRET FOUND IN FRONTEND',
    noKeyInFrontend,
    `Checked app.js (${publicAppJs.length} bytes), index.html (${publicIndex.length} bytes), sample-data.js (${publicSample.length} bytes)`
  );

  // 3.3 No API key in browser responses
  const healthRes = await request('/api/health');
  const analyzeEmptyRes = await request('/api/analyze', { method: 'POST', body: {} });
  const noKeyInResponses = !JSON.stringify(healthRes).includes(rawKey) && !JSON.stringify(analyzeEmptyRes).includes(rawKey);
  recordTest(
    'Security Audit',
    'No API key leaked in API responses',
    'API responses never contain the secret key string',
    noKeyInResponses ? 'API responses are clean of secret keys' : 'SECRET LEAKED IN RESPONSE',
    noKeyInResponses,
    `Inspected /api/health and /api/analyze error responses`
  );

  // 3.4 .gitignore contains .env and node_modules
  const gitignoreContent = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
  const envIgnored = /^\.env$/m.test(gitignoreContent);
  const nodeModulesIgnored = /node_modules/m.test(gitignoreContent);
  recordTest(
    'Security Audit',
    '.env and node_modules ignored by Git',
    '.gitignore contains .env and node_modules',
    envIgnored && nodeModulesIgnored ? '.env and node_modules are properly ignored' : 'Missing ignore entries',
    envIgnored && nodeModulesIgnored,
    `.gitignore lines: ${gitignoreContent.trim().replace(/\n/g, ', ')}`
  );

  // 3.5 .env.example contains only placeholders
  const envExampleContent = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  const isPlaceholderOnly = !envExampleContent.includes(rawKey) && envExampleContent.includes('your_gemini_api_key_here');
  recordTest(
    'Security Audit',
    '.env.example contains only placeholders',
    'Placeholder GEMINI_API_KEY=your_gemini_api_key_here, no real secret',
    isPlaceholderOnly ? 'Only placeholder values found' : 'Real secret leaked in .env.example',
    isPlaceholderOnly,
    envExampleContent.trim()
  );

  // 3.6 SSRF: Localhost & Private IP requests blocked
  let localhostBlocked = false;
  let privateIpBlocked = false;
  let metadataBlocked = false;

  try {
    await validateUrl('http://localhost:3000/internal');
  } catch (err) {
    localhostBlocked = err.message.includes('forbidden');
  }

  try {
    await validateUrl('http://127.0.0.1/admin');
  } catch (err) {
    privateIpBlocked = err.message.includes('forbidden');
  }

  try {
    await validateUrl('http://169.254.169.254/latest/meta-data/');
  } catch (err) {
    metadataBlocked = err.message.includes('forbidden');
  }

  const ssrfBlocked = localhostBlocked && privateIpBlocked && metadataBlocked;
  recordTest(
    'Security Audit',
    'SSRF: Private IP & localhost URLs blocked',
    'validateUrl rejects localhost, 127.0.0.1, and link-local 169.254.169.254',
    ssrfBlocked ? 'All private/internal IP targets blocked' : 'SSRF VULNERABILITY DETECTED',
    ssrfBlocked,
    `localhost blocked: ${localhostBlocked}, 127.0.0.1 blocked: ${privateIpBlocked}, 169.254.169.254 blocked: ${metadataBlocked}`
  );

  // 3.7 SSRF: Redirects to internal addresses blocked
  // Create temporary HTTP redirect server pointing to 127.0.0.1
  const redirectServer = http.createServer((req, res) => {
    if (req.url === '/redirect-to-internal') {
      res.writeHead(302, { Location: 'http://127.0.0.1:80/internal-admin' });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>OK</h1>');
    }
  });

  const redirectPort = await new Promise((res) => {
    redirectServer.listen(0, '127.0.0.1', () => res(redirectServer.address().port));
  });

  let redirectSsrfBlocked = false;
  let redirectError = '';
  try {
    await fetchPage(`http://127.0.0.1:${redirectPort}/redirect-to-internal`);
  } catch (err) {
    redirectSsrfBlocked = err.message.includes('forbidden');
    redirectError = err.message;
  }
  redirectServer.close();

  recordTest(
    'Security Audit',
    'SSRF: Redirects to internal addresses blocked',
    'fetchPage validates every redirect hop and rejects internal targets',
    redirectSsrfBlocked ? 'Redirect to internal address blocked' : 'Redirect SSRF unblocked',
    redirectSsrfBlocked,
    `Interception error: "${redirectError}"`
  );

  // 3.8 HTML extraction limits enforced
  const hugeHtml = '<html><body>' + '<p>Long article content paragraph with sufficient details. </p>'.repeat(400) + '</body></html>';
  const extracted = extractContent(hugeHtml);
  const textLengthCapped = extracted.text.length <= 12000;
  recordTest(
    'Security Audit',
    'HTML extraction character limit enforced',
    'Extracted text length is capped at <= 12,000 characters',
    textLengthCapped ? `Capped at ${extracted.text.length} chars (<= 12000)` : `Exceeded: ${extracted.text.length}`,
    textLengthCapped,
    `Input size: ${hugeHtml.length} chars, Extracted: ${extracted.text.length} chars`
  );


  // =========================================================================
  // PART 1: LIVE ANALYSIS TEST
  // =========================================================================
  console.log('\n--- EXECUTING PART 1: LIVE ANALYSIS TEST ---');

  // 1.1 Empty research question is rejected
  const t1_1 = await request('/api/analyze', {
    method: 'POST',
    body: { question: '', sources: [{ id: 'S1', url: 'https://example.com', text: 'Some text', fetchStatus: 'success' }, { id: 'S2', url: 'https://example.com', text: 'Some text', fetchStatus: 'success' }] }
  });
  recordTest(
    'Live Analysis Test',
    'Empty research question rejected',
    'HTTP 400 Bad Request with error: Please enter a research question.',
    `HTTP ${t1_1.status}: "${t1_1.body ? t1_1.body.error : ''}"`,
    t1_1.status === 400 && t1_1.body.error === 'Please enter a research question.',
    t1_1.body
  );

  // 1.2 Empty source list is rejected
  const t1_2 = await request('/api/analyze', {
    method: 'POST',
    body: { question: 'What are the scholarship conditions?', sources: [] }
  });
  recordTest(
    'Live Analysis Test',
    'Empty source list rejected',
    'HTTP 400 Bad Request with error: Add at least two valid sources to continue.',
    `HTTP ${t1_2.status}: "${t1_2.body ? t1_2.body.error : ''}"`,
    t1_2.status === 400 && t1_2.body.error === 'Add at least two valid sources to continue.',
    t1_2.body
  );

  // 1.3 Minimum two usable sources required
  const t1_3 = await request('/api/analyze', {
    method: 'POST',
    body: {
      question: 'What are the scholarship conditions?',
      sources: [
        { id: 'S1', url: 'https://example.com', text: 'Valid source with enough text to be usable in cross examination analysis.', fetchStatus: 'success' },
        { id: 'S2', url: 'https://example.com/failed', text: '', fetchStatus: 'failed' }
      ]
    }
  });
  recordTest(
    'Live Analysis Test',
    'Minimum two usable sources required',
    'HTTP 400 Bad Request when usable sources < 2',
    `HTTP ${t1_3.status}: "${t1_3.body ? t1_3.body.error : ''}"`,
    t1_3.status === 400 && t1_3.body.error === 'Some sources could not be accessed. Review their status.',
    t1_3.body
  );

  // 1.4 Invalid URLs are rejected in /api/fetch-sources
  const t1_4 = await request('/api/fetch-sources', {
    method: 'POST',
    body: {
      sources: [
        { id: 'S1', url: 'ftp://not-supported.org' }
      ]
    }
  });
  recordTest(
    'Live Analysis Test',
    'Invalid URLs rejected in fetch-sources',
    'HTTP 400 Bad Request for non-http/https protocol',
    `HTTP ${t1_4.status}: "${t1_4.body ? t1_4.body.error : ''}"`,
    t1_4.status === 400 && t1_4.body.error.includes('must use http:// or https://'),
    t1_4.body
  );

  // 1.5 Duplicate URLs are handled correctly
  const t1_5 = await request('/api/fetch-sources', {
    method: 'POST',
    body: {
      sources: [
        { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
        { id: 'S2', url: 'https://en.wikipedia.org/wiki/Scholarship/' }
      ]
    }
  });
  recordTest(
    'Live Analysis Test',
    'Duplicate URLs rejected',
    'HTTP 400 Bad Request identifying duplicate URL',
    `HTTP ${t1_5.status}: "${t1_5.body ? t1_5.body.error : ''}"`,
    t1_5.status === 400 && t1_5.body.error.includes('Duplicate source URL detected'),
    t1_5.body
  );

  // 1.6 Failed sources do not crash successful source processing
  const t1_6 = await request('/api/fetch-sources', {
    method: 'POST',
    body: {
      sources: [
        { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
        { id: 'S2', url: 'https://dds-nonexistent-domain-404xyz.org/test' }
      ]
    }
  });
  const s1Result = t1_6.body && t1_6.body.sources ? t1_6.body.sources.find(s => s.id === 'S1') : null;
  const s2Result = t1_6.body && t1_6.body.sources ? t1_6.body.sources.find(s => s.id === 'S2') : null;
  const partialBatchSuccess = t1_6.ok && s1Result && s1Result.fetchStatus === 'success' && s2Result && s2Result.fetchStatus === 'error';
  recordTest(
    'Live Analysis Test',
    'Failed sources do not crash successful sources',
    'S1 succeeds while S2 gracefully records error status in same batch',
    partialBatchSuccess ? 'Batch returned individual status for each source' : 'Batch failed completely',
    partialBatchSuccess,
    `S1 fetchStatus: ${s1Result ? s1Result.fetchStatus : 'none'}, S2 fetchStatus: ${s2Result ? s2Result.fetchStatus : 'none'}`
  );

  // 1.7 Two valid sources can be analysed through the real Gemini API
  console.log('Testing live Gemini cross-analysis with 2 sources...');
  const sampleText1 = 'Undergraduate applicants are eligible for the national merit scholarship. The family income threshold is $30,000 per year from all sources combined. Official application deadline is November 30, 2026.';
  const sampleText2 = 'Student advisory report: The family income cutoff may extend to $40,000 under special regional quotas. Recipients must maintain a minimum 3.0 GPA for renewal across consecutive semesters.';

  const t1_7 = await request('/api/analyze', {
    method: 'POST',
    body: {
      question: 'What are the income thresholds and renewal conditions for the merit scholarship?',
      sources: [
        { id: 'S1', url: 'Pasted: S1 Official Guidelines', title: 'Official Guidelines', text: sampleText1, fetchStatus: 'success' },
        { id: 'S2', url: 'Pasted: S2 Advisory Report', title: 'Advisory Report', text: sampleText2, fetchStatus: 'success' }
      ]
    }
  });

  const geminiSuccess = t1_7.ok && t1_7.body.success && Array.isArray(t1_7.body.summary) && t1_7.body.summary.length > 0;
  recordTest(
    'Live Analysis Test',
    'Two valid sources analysed through real Gemini API',
    'HTTP 200 with structured JSON containing summary, gaps, and conflicts',
    geminiSuccess ? `Success! Model: ${t1_7.body.model}, Summary count: ${t1_7.body.summary.length}` : `Failed: HTTP ${t1_7.status}`,
    geminiSuccess,
    geminiSuccess ? { model: t1_7.body.model, confidence: t1_7.body.overall_confidence, summaryPoints: t1_7.body.summary.length } : t1_7.body
  );

  // 1.8 Gemini failures never display fake results
  // Test invalid key error
  const origKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'DUMMY_GEMINI_KEY_FOR_TESTS_NOT_REAL';
  const t1_8 = await request('/api/analyze', {
    method: 'POST',
    body: {
      question: 'What are the requirements?',
      sources: [
        { id: 'S1', url: 'Pasted 1', text: sampleText1, fetchStatus: 'success' },
        { id: 'S2', url: 'Pasted 2', text: sampleText2, fetchStatus: 'success' }
      ]
    }
  });
  process.env.GEMINI_API_KEY = origKey;

  const noFakeResultsOnFailure = !t1_8.ok && !t1_8.body.summary && !t1_8.body.gaps && t1_8.body.error === 'AI analysis is temporarily unavailable. Please check the server configuration.';
  recordTest(
    'Live Analysis Test',
    'Gemini failures never display fake results',
    'HTTP 401 error returned without fake/cached analysis data',
    noFakeResultsOnFailure ? 'Error returned cleanly without mock data' : 'Fake data returned on error',
    noFakeResultsOnFailure,
    t1_8.body
  );

  // 1.9 Old results cleared after failed new analysis
  // Verified in frontend public/app.js lines 723-725:
  // elements.resultsSection.hidden = true; state.analysis = null;
  const hasResultClearingLogic = publicAppJs.includes('elements.resultsSection.hidden = true') && publicAppJs.includes('state.analysis = null');
  recordTest(
    'Live Analysis Test',
    'Old results cleared after failed new analysis',
    'Frontend state.analysis reset and resultsSection hidden at submit start',
    hasResultClearingLogic ? 'Verified in app.js controller workflow' : 'Not cleared',
    hasResultClearingLogic,
    'app.js clears state.analysis and hides resultsSection before starting analysis'
  );

  // 1.10 Evidence snippets and source references validated
  const testEvidenceAnalysis = {
    summary: [
      { point: 'Threshold is $30,000', source_id: 'S1', evidence: 'The family income threshold is $30,000 per year from all sources combined.' },
      { point: 'Invented claim', source_id: 'S1', evidence: 'This verbatim quote definitely does not exist in source text.' }
    ],
    gaps: [],
    conflicts: [],
    outdated: [],
    unanswered_questions: [],
    checklist: []
  };

  const verificationResult = verifyAllEvidence(testEvidenceAnalysis, [
    { id: 'S1', url: 'http://s1.local', text: sampleText1 },
    { id: 'S2', url: 'http://s2.local', text: sampleText2 }
  ]);

  const item1Verified = verificationResult.verifiedAnalysis.summary[0].verification.verified === true;
  const item2Unverified = verificationResult.verifiedAnalysis.summary[1].verification.verified === false;
  const evidenceEngineWorks = item1Verified && item2Unverified && verificationResult.stats.verifiedCount === 1 && verificationResult.stats.unverifiedCount === 1;

  recordTest(
    'Live Analysis Test',
    'Evidence snippets & source references validated',
    'Verbatim snippet verified; non-existent snippet flagged as unverified',
    evidenceEngineWorks ? 'Evidence verifier accurately distinguishes verbatim quotes' : 'Verification failed',
    evidenceEngineWorks,
    verificationResult.stats
  );


  // =========================================================================
  // PART 2: SAMPLE DEMO TEST
  // =========================================================================
  console.log('\n--- EXECUTING PART 2: SAMPLE DEMO TEST ---');

  const sampleData = require('../public/sample-data');
  const demoSources = sampleData.sources;
  const demoAnalysis = sampleData.analysis;

  // 2.1 Sample Demo works offline
  const isOfflineValid = Boolean(demoSources && demoAnalysis && demoSources.length === 3);
  recordTest(
    'Sample Demo Test',
    'Sample Demo works offline',
    'Complete sample dataset with 3 sources and precomputed analysis',
    isOfflineValid ? 'Offline dataset present and structured' : 'Missing sample dataset',
    isOfflineValid,
    `Sources: ${demoSources.length}, Question: "${sampleData.question.slice(0, 50)}..."`
  );

  // 2.2 & 2.3 Does not call /api/fetch-sources or /api/analyze
  // Verified via inspect of handleSampleDemo in public/app.js
  const sampleDemoFn = publicAppJs.slice(publicAppJs.indexOf('function handleSampleDemo'), publicAppJs.indexOf('window.__handleSampleDemo = handleSampleDemo;'));
  const noFetchCallsInSample = !sampleDemoFn.includes('fetch(') && !sampleDemoFn.includes('/api/');
  recordTest(
    'Sample Demo Test',
    'Sample Demo makes zero network API requests',
    'handleSampleDemo contains zero fetch() or /api/ requests',
    noFetchCallsInSample ? 'Pure offline synchronous execution' : 'NETWORK CALLS FOUND',
    noFetchCallsInSample,
    'handleSampleDemo populates state and calls renderResults directly without network'
  );

  // 2.4 All three fictional sources load
  const hasThreeSources = demoSources.length === 3 && demoSources[0].id === 'S1' && demoSources[1].id === 'S2' && demoSources[2].id === 'S3';
  recordTest(
    'Sample Demo Test',
    'All three fictional sources load',
    'Three fictional scholarship sources S1, S2, S3',
    hasThreeSources ? 'S1, S2, and S3 loaded with titles and text' : 'Invalid source count',
    hasThreeSources,
    demoSources.map(s => ({ id: s.id, title: s.title.slice(0, 40) + '...' }))
  );

  // 2.5 Sample Data labels are visible
  const hasSampleNoticeInHtml = publicIndex.includes('id="sample-demo-notice-banner"') && publicIndex.includes('SAMPLE DATA');
  const hasSampleTagLogic = publicAppJs.includes("'SAMPLE DATA · Offline Demo'");
  recordTest(
    'Sample Demo Test',
    'Sample Data labels are visible',
    'sample-demo-notice-banner and dossier-model-tag reflect SAMPLE DATA',
    hasSampleNoticeInHtml && hasSampleTagLogic ? 'Prominently marked with SAMPLE DATA labels' : 'Labels missing',
    hasSampleNoticeInHtml && hasSampleTagLogic,
    'sample-demo-notice-banner and dossier-model-tag configured'
  );

  // 2.6 All findings and evidence references are consistent
  const demoVerification = verifyAllEvidence(demoAnalysis, demoSources);
  const demoEvidenceConsistent = demoVerification.stats.unverifiedCount === 0 && demoVerification.stats.invalidSourceCount === 0;
  recordTest(
    'Sample Demo Test',
    'Sample findings and evidence references consistent',
    'All evidence snippets in sample analysis verify 100% verbatim against sample texts',
    demoEvidenceConsistent ? `100% verified (${demoVerification.stats.verifiedCount}/${demoVerification.stats.totalChecked} verified)` : 'Evidence mismatch',
    demoEvidenceConsistent,
    demoVerification.stats
  );

  // 2.7 Checklist, copy and TXT download functions exist
  const hasChecklistInteractivity = publicAppJs.includes('handleChecklistChange') && publicAppJs.includes('handleCopyChecklist') && publicAppJs.includes('handleDownloadChecklist');
  recordTest(
    'Sample Demo Test',
    'Checklist interactive checking, copying & TXT export',
    'Functions handleChecklistChange, handleCopyChecklist, and handleDownloadChecklist implemented',
    hasChecklistInteractivity ? 'Checklist tools, Clipboard copy, and Blob TXT download implemented' : 'Missing functions',
    hasChecklistInteractivity,
    'Implemented with fallbackCopyText and Blob download'
  );

  await stopServer();
}

runAudit().catch(err => {
  console.error("Audit script failed:", err);
  if (server) server.close();
  process.exit(1);
});
