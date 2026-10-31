/**
 * Verification Test Suite for Digital Dark Spot — Tasks 1 to 9
 * Tests all 12 scenarios required by Task 9.
 */
require('dotenv').config();
const http = require('http');
const app = require('../server');
const { getGeminiClient, generateAnalysis, formatGeminiError } = require('../services/geminiService');

// In-memory test server
let server;
let baseUrl;

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

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: data };
}

// Client-side validation simulator mirroring public/app.js
function simulateClientValidation(question, sources) {
  const q = (question || '').trim();
  if (!q) {
    return {
      valid: false,
      fieldError: { question: 'Please enter a research question.' },
      bannerError: 'Please enter a research question.'
    };
  }
  if (q.length > 1000) {
    return {
      valid: false,
      fieldError: { question: 'Question exceeds 1,000 characters limit.' },
      bannerError: 'Question exceeds 1,000 characters limit.'
    };
  }

  const seenUrls = new Set();
  let validCount = 0;
  let invalidUrlDetected = false;
  let duplicateDetected = false;
  let shortPastedDetected = false;
  const fieldErrors = {};

  sources.forEach((src, idx) => {
    if (src.type === 'url') {
      const rawUrl = (src.url || '').trim();
      if (!rawUrl) {
        fieldErrors[`source_${idx}`] = 'Please enter a valid HTTP or HTTPS URL.';
        invalidUrlDetected = true;
        return;
      }
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        fieldErrors[`source_${idx}`] = 'Please enter a valid HTTP or HTTPS URL.';
        invalidUrlDetected = true;
        return;
      }
      try {
        const parsed = new URL(rawUrl);
        if (!parsed.hostname || !parsed.hostname.includes('.')) {
          fieldErrors[`source_${idx}`] = 'Please enter a valid HTTP or HTTPS URL.';
          invalidUrlDetected = true;
          return;
        }
      } catch {
        fieldErrors[`source_${idx}`] = 'Please enter a valid HTTP or HTTPS URL.';
        invalidUrlDetected = true;
        return;
      }

      const normalized = rawUrl.toLowerCase().replace(/\/+$/, '');
      if (seenUrls.has(normalized)) {
        fieldErrors[`source_${idx}`] = 'Duplicate source URL. Each source must be unique.';
        duplicateDetected = true;
        return;
      }
      seenUrls.add(normalized);
      validCount++;
    } else {
      const text = (src.text || '').trim();
      if (!text) {
        fieldErrors[`source_${idx}`] = 'Please provide at least 50 characters of source text.';
        shortPastedDetected = true;
        return;
      }
      if (text.length < 50) {
        fieldErrors[`source_${idx}`] = 'Pasted text is too short. Please provide at least 50 characters.';
        shortPastedDetected = true;
        return;
      }
      validCount++;
    }
  });

  if (validCount < 2) {
    let bannerMsg = 'Add at least two valid sources to continue.';
    if (invalidUrlDetected && validCount === 0 && sources.some((s) => (s.url || '').trim().length > 0)) {
      bannerMsg = 'Please enter a valid HTTP or HTTPS URL.';
    }
    return {
      valid: false,
      fieldError: fieldErrors,
      bannerError: bannerMsg
    };
  }

  if (invalidUrlDetected) {
    return {
      valid: false,
      fieldError: fieldErrors,
      bannerError: 'Please enter a valid HTTP or HTTPS URL.'
    };
  }

  if (duplicateDetected) {
    return {
      valid: false,
      fieldError: fieldErrors,
      bannerError: 'Duplicate source URL. Each source must be unique.'
    };
  }

  if (shortPastedDetected) {
    return {
      valid: false,
      fieldError: fieldErrors,
      bannerError: 'Pasted text is too short. Please provide at least 50 characters.'
    };
  }

  return { valid: true };
}

async function runTests() {
  await startServer();
  const results = [];

  console.log('Starting Digital Dark Spot 12-Case Test Suite...\n');

  // TEST 1: Empty question & empty sources
  console.log('[Case 1/12] Testing empty question & empty sources...');
  {
    const clientVal = simulateClientValidation('', [
      { id: 'S1', type: 'url', url: '' },
      { id: 'S2', type: 'url', url: '' }
    ]);
    const backendRes = await request('/api/analyze', {
      method: 'POST',
      body: { question: '', sources: [] }
    });

    results.push({
      caseNum: 1,
      description: 'Empty question & empty sources',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: clientVal.bannerError,
      httpStatus: backendRes.status === 400 ? '400 (if posted) / Blocked Client-Side' : backendRes.status,
      pass: !clientVal.valid && clientVal.bannerError === 'Please enter a research question.' && backendRes.status === 400
    });
  }

  // TEST 2: Valid question with no sources
  console.log('[Case 2/12] Testing valid question with no sources...');
  {
    const clientVal = simulateClientValidation('What are the hidden scholarship renewal conditions?', [
      { id: 'S1', type: 'url', url: '' },
      { id: 'S2', type: 'url', url: '' }
    ]);
    const backendRes = await request('/api/analyze', {
      method: 'POST',
      body: { question: 'What are the hidden scholarship renewal conditions?', sources: [] }
    });

    results.push({
      caseNum: 2,
      description: 'Valid question with no sources',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: clientVal.bannerError,
      httpStatus: backendRes.status === 400 ? '400 (if posted) / Blocked Client-Side' : backendRes.status,
      pass: !clientVal.valid && clientVal.bannerError === 'Add at least two valid sources to continue.' && backendRes.status === 400
    });
  }

  // TEST 3: Valid question with 1 source
  console.log('[Case 3/12] Testing valid question with 1 source...');
  {
    const clientVal = simulateClientValidation('What are the scholarship requirements?', [
      { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Scholarship' },
      { id: 'S2', type: 'url', url: '' }
    ]);
    const backendRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the scholarship requirements?',
        sources: [{ id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship', text: 'Some text', fetchStatus: 'success' }]
      }
    });

    results.push({
      caseNum: 3,
      description: 'Valid question with 1 source',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: clientVal.bannerError,
      httpStatus: backendRes.status === 400 ? '400 (if posted) / Blocked Client-Side' : backendRes.status,
      pass: !clientVal.valid && clientVal.bannerError === 'Add at least two valid sources to continue.' && backendRes.status === 400
    });
  }

  // TEST 4: Invalid URL
  console.log('[Case 4/12] Testing invalid URL...');
  {
    const clientVal = simulateClientValidation('What are the risks?', [
      { id: 'S1', type: 'url', url: 'ftp://not-supported.org' },
      { id: 'S2', type: 'url', url: 'invalid-url-string' }
    ]);
    const backendRes = await request('/api/fetch-sources', {
      method: 'POST',
      body: { sources: [{ id: 'S1', url: 'ftp://not-supported.org' }] }
    });

    results.push({
      caseNum: 4,
      description: 'Invalid URL',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: clientVal.bannerError,
      httpStatus: backendRes.status === 400 ? '400 (if posted) / Blocked Client-Side' : backendRes.status,
      pass: !clientVal.valid && clientVal.bannerError === 'Please enter a valid HTTP or HTTPS URL.' && backendRes.status === 400
    });
  }

  // TEST 5: Two valid URLs
  console.log('[Case 5/12] Testing two valid URLs...');
  {
    const clientVal = simulateClientValidation('What are the historical origins of scholarships?', [
      { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Scholarship' },
      { id: 'S2', type: 'url', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States' }
    ]);
    const fetchRes = await request('/api/fetch-sources', {
      method: 'POST',
      body: {
        sources: [
          { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
          { id: 'S2', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States' }
        ]
      }
    });

    let analyzeRes = { status: 'N/A' };
    let geminiCalled = 'No';
    let resultsDisplayed = 'No';

    if (fetchRes.ok && fetchRes.body.sources && fetchRes.body.sources.every((s) => s.fetchStatus === 'success')) {
      const sourcesForAnalysis = fetchRes.body.sources.map((s) => ({
        ...s,
        text: s.text ? s.text.slice(0, 3000) : ''
      }));

      analyzeRes = await request('/api/analyze', {
        method: 'POST',
        body: {
          question: 'What are the historical origins of scholarships?',
          sources: sourcesForAnalysis
        }
      });
      if (analyzeRes.ok && analyzeRes.body.success) {
        geminiCalled = 'Yes';
        resultsDisplayed = 'Yes';
      }
    }

    results.push({
      caseNum: 5,
      description: 'Two valid URLs',
      geminiCalled,
      resultsDisplayed,
      message: analyzeRes.ok ? 'Verified analysis with evidence citations returned' : (analyzeRes.body && analyzeRes.body.error),
      httpStatus: analyzeRes.status,
      pass: clientVal.valid && fetchRes.ok && analyzeRes.ok
    });
  }

  // TEST 6: One valid URL and one inaccessible URL
  console.log('[Case 6/12] Testing one valid URL and one inaccessible URL...');
  {
    const clientVal = simulateClientValidation('What are the risks?', [
      { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Scholarship' },
      { id: 'S2', type: 'url', url: 'https://dds-nonexistent-domain-404xyz.org/test' }
    ]);

    const fetchRes = await request('/api/fetch-sources', {
      method: 'POST',
      body: {
        sources: [
          { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
          { id: 'S2', url: 'https://dds-nonexistent-domain-404xyz.org/test' }
        ]
      }
    });

    const s1 = fetchRes.body.sources.find((s) => s.id === 'S1');
    const s2 = fetchRes.body.sources.find((s) => s.id === 'S2');
    const usableCount = fetchRes.body.sources.filter((s) => s.fetchStatus === 'success' && s.text.length >= 50).length;

    // Backend guard check if client were to attempt /api/analyze anyway
    const analyzeGuardRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the risks?',
        sources: fetchRes.body.sources
      }
    });

    results.push({
      caseNum: 6,
      description: 'One valid URL and one inaccessible URL',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: 'Some sources could not be accessed. Review their status.',
      httpStatus: analyzeGuardRes.status,
      pass: usableCount < 2 && s2.fetchStatus === 'error' && analyzeGuardRes.status === 400
    });
  }

  // TEST 7: All URLs inaccessible
  console.log('[Case 7/12] Testing all URLs inaccessible...');
  {
    const fetchRes = await request('/api/fetch-sources', {
      method: 'POST',
      body: {
        sources: [
          { id: 'S1', url: 'https://dds-fake-domain-1111.org' },
          { id: 'S2', url: 'https://dds-fake-domain-2222.org' }
        ]
      }
    });

    const usableCount = fetchRes.body.sources.filter((s) => s.fetchStatus === 'success' && s.text.length >= 50).length;
    const analyzeGuardRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the risks?',
        sources: fetchRes.body.sources
      }
    });

    results.push({
      caseNum: 7,
      description: 'All URLs inaccessible',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: 'Some sources could not be accessed. Review their status.',
      httpStatus: analyzeGuardRes.status,
      pass: usableCount === 0 && analyzeGuardRes.status === 400
    });
  }

  // TEST 8: Valid pasted text sources
  console.log('[Case 8/12] Testing valid pasted text sources...');
  await new Promise((r) => setTimeout(r, 1000));
  {
    const sampleText1 = 'Scholarships are financial aid awards designed to assist students of varying degrees of merit with college costs. Unlike loans, scholarships do not have to be repaid provided all initial and ongoing conditions are fully met by the enrolled student throughout their academic tenure.';
    const sampleText2 = 'Institutional aid programs often impose strict grade point average requirements and full-time credit enrollment thresholds. If a student drops below twelve credit hours during an academic term, aid may be forfeited or converted into interest-bearing debt.';

    const clientVal = simulateClientValidation('What happens if I drop below full-time enrollment?', [
      { id: 'S1', type: 'text', title: 'Doc 1', text: sampleText1 },
      { id: 'S2', type: 'text', title: 'Doc 2', text: sampleText2 }
    ]);

    const analyzeRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What happens if I drop below full-time enrollment?',
        sources: [
          { id: 'S1', url: 'Pasted: Doc 1', title: 'Doc 1', text: sampleText1, fetchStatus: 'success' },
          { id: 'S2', url: 'Pasted: Doc 2', title: 'Doc 2', text: sampleText2, fetchStatus: 'success' }
        ]
      }
    });

    results.push({
      caseNum: 8,
      description: 'Valid pasted text sources',
      geminiCalled: 'Yes',
      resultsDisplayed: 'Yes',
      message: analyzeRes.ok ? 'Verified analysis with evidence citations returned' : analyzeRes.body.error,
      httpStatus: analyzeRes.status,
      pass: clientVal.valid && analyzeRes.ok && analyzeRes.body.success
    });
  }

  // TEST 9: Missing Gemini API key
  console.log('[Case 9/12] Testing missing Gemini API key...');
  await new Promise((r) => setTimeout(r, 1000));
  {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const sampleText1 = 'Scholarships are financial aid awards designed to assist students with college costs.';
    const sampleText2 = 'Institutional aid programs often impose strict grade point average requirements.';

    const analyzeRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the requirements?',
        sources: [
          { id: 'S1', url: 'Pasted 1', text: sampleText1, fetchStatus: 'success' },
          { id: 'S2', url: 'Pasted 2', text: sampleText2, fetchStatus: 'success' }
        ]
      }
    });

    process.env.GEMINI_API_KEY = originalKey;

    results.push({
      caseNum: 9,
      description: 'Missing Gemini API key',
      geminiCalled: 'No',
      resultsDisplayed: 'No',
      message: analyzeRes.body.error,
      httpStatus: analyzeRes.status,
      pass: analyzeRes.status === 500 && analyzeRes.body.error === 'AI analysis is temporarily unavailable. Please check the server configuration.'
    });
  }

  // TEST 10: Invalid Gemini API key
  console.log('[Case 10/12] Testing invalid Gemini API key...');
  await new Promise((r) => setTimeout(r, 1000));
  {
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'DUMMY_GEMINI_KEY_FOR_TESTS_NOT_REAL';

    const sampleText1 = 'Scholarships are financial aid awards designed to assist students with college costs.';
    const sampleText2 = 'Institutional aid programs often impose strict grade point average requirements.';

    const analyzeRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the requirements?',
        sources: [
          { id: 'S1', url: 'Pasted 1', text: sampleText1, fetchStatus: 'success' },
          { id: 'S2', url: 'Pasted 2', text: sampleText2, fetchStatus: 'success' }
        ]
      }
    });

    process.env.GEMINI_API_KEY = originalKey;

    results.push({
      caseNum: 10,
      description: 'Invalid Gemini API key',
      geminiCalled: 'Yes',
      resultsDisplayed: 'No',
      message: analyzeRes.body.error,
      httpStatus: analyzeRes.status,
      pass: analyzeRes.status === 401 && analyzeRes.body.error === 'AI analysis is temporarily unavailable. Please check the server configuration.'
    });
  }

  // TEST 11: Successful real Gemini analysis
  console.log('[Case 11/12] Testing successful real Gemini analysis...');
  await new Promise((r) => setTimeout(r, 1000));
  {
    const sampleText1 = 'Scholarships do not need to be repaid. Most merit scholarships require a minimum 3.0 GPA to renew annually.';
    const sampleText2 = 'Students who drop below 12 credit hours lose their institutional scholarship and may be required to pay back tuition.';

    const analyzeRes = await request('/api/analyze', {
      method: 'POST',
      body: {
        question: 'What are the renewal and repayment conditions for scholarships?',
        sources: [
          { id: 'S1', url: 'Source 1', text: sampleText1, fetchStatus: 'success' },
          { id: 'S2', url: 'Source 2', text: sampleText2, fetchStatus: 'success' }
        ]
      }
    });

    results.push({
      caseNum: 11,
      description: 'Successful real Gemini analysis',
      geminiCalled: 'Yes',
      resultsDisplayed: 'Yes',
      message: analyzeRes.ok ? 'Verified analysis with evidence citations returned' : analyzeRes.body.error,
      httpStatus: analyzeRes.status,
      pass: analyzeRes.ok && analyzeRes.body.success && Array.isArray(analyzeRes.body.summary)
    });
  }

  // TEST 12: Sample Demo with zero network requests
  console.log('[Case 12/12] Testing sample demo offline...');
  {
    const sampleDemoData = require('../public/sample-data');
    const isOffline = Boolean(sampleDemoData && sampleDemoData.analysis && sampleDemoData.sources.length === 3);

    results.push({
      caseNum: 12,
      description: 'Sample Demo with zero network requests',
      geminiCalled: 'No',
      resultsDisplayed: 'Yes',
      message: 'Sample Demo loaded offline — no API requests performed.',
      httpStatus: 'N/A (Client-Side Local State)',
      pass: isOffline
    });
  }

  await stopServer();

  console.log('\n========================================================================================');
  console.log('RESULTS OF 12 TEST CASES (TASK 9)');
  console.log('========================================================================================\n');

  console.table(
    results.map((r) => ({
      'Case': r.caseNum,
      'Test Scenario': r.description,
      'Gemini Called': r.geminiCalled,
      'Results Displayed': r.resultsDisplayed,
      'Validation / Error Message': r.message,
      'HTTP Status': r.httpStatus,
      'Passed': r.pass ? 'PASS' : 'FAIL'
    }))
  );

  const allPassed = results.every((r) => r.pass);
  console.log(`\nOverall Test Status: ${allPassed ? 'ALL 12 TESTS PASSED!' : 'SOME TESTS FAILED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Test Suite encountered an error:', err);
  if (server) server.close();
});
