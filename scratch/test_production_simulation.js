/**
 * Production Deployment Simulation Test for Render
 * Tests server startup with dynamic PORT and NODE_ENV=production
 */
const http = require('http');
const app = require('../server');

async function testProduction() {
  console.log('================================================================');
  console.log('DIGITAL DARK SPOT — RENDER PRODUCTION SIMULATION AUDIT');
  console.log('================================================================\n');

  const testPort = 10000; // Standard Render default port
  process.env.PORT = testPort;
  process.env.NODE_ENV = 'production';

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(testPort, '127.0.0.1', resolve));
  console.log(`[PASS] Server successfully bound to dynamic production PORT ${testPort}`);

  const baseUrl = `http://127.0.0.1:${testPort}`;

  // 1. Health check endpoint test
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthJson = await healthRes.json();
  const healthOk = healthRes.status === 200 && healthJson.status === 'ok' && healthJson.project === 'Digital Dark Spot';
  console.log(`[${healthOk ? 'PASS' : 'FAIL'}] GET /api/health: HTTP ${healthRes.status} ->`, healthJson);

  // 2. Static root index.html serving test
  const indexRes = await fetch(`${baseUrl}/`);
  const indexText = await indexRes.text();
  const indexOk = indexRes.status === 200 && indexText.includes('DIGITAL DARK SPOT') && indexText.includes('canvas#gl');
  console.log(`[${indexOk ? 'PASS' : 'FAIL'}] GET / serves public/index.html: HTTP ${indexRes.status} (Length: ${indexText.length} bytes)`);

  // 3. Static scripts serving test
  const appJsRes = await fetch(`${baseUrl}/app.js`);
  const sampleJsRes = await fetch(`${baseUrl}/sample-data.js`);
  const scriptsOk = appJsRes.status === 200 && sampleJsRes.status === 200;
  console.log(`[${scriptsOk ? 'PASS' : 'FAIL'}] GET /app.js (${appJsRes.status}) & GET /sample-data.js (${sampleJsRes.status}) served`);

  // 4. POST /api/fetch-sources endpoint test
  const fetchSourcesRes = await fetch(`${baseUrl}/api/fetch-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [{ id: 'S1', url: 'https://archive.org' }]
    })
  });
  const fetchJson = await fetchSourcesRes.json();
  const fetchOk = fetchSourcesRes.status === 200 && Array.isArray(fetchJson.sources);
  console.log(`[${fetchOk ? 'PASS' : 'FAIL'}] POST /api/fetch-sources: HTTP ${fetchSourcesRes.status}`);

  // 5. POST /api/analyze input validation test
  const analyzeValidationRes = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '',
      sources: []
    })
  });
  const analyzeValJson = await analyzeValidationRes.json();
  const analyzeValOk = analyzeValidationRes.status === 400 && analyzeValJson.error === 'Please enter a research question.';
  console.log(`[${analyzeValOk ? 'PASS' : 'FAIL'}] POST /api/analyze validation: HTTP ${analyzeValidationRes.status} -> "${analyzeValJson.error}"`);

  // 6. Gemini Authentication from Environment Variables
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  console.log(`[${hasGeminiKey ? 'PASS' : 'FAIL'}] GEMINI_API_KEY detected in environment variables (Length: ${(process.env.GEMINI_API_KEY || '').length})`);

  await new Promise((resolve) => server.close(resolve));

  const allPassed = healthOk && indexOk && scriptsOk && fetchOk && analyzeValOk && hasGeminiKey;
  console.log(`\nProduction Simulation Result: ${allPassed ? 'ALL CHECKS PASSED (READY FOR RENDER)' : 'FAILURES DETECTED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

testProduction().catch((err) => {
  console.error('Production simulation test crashed:', err);
  process.exit(1);
});
