const http = require('http');
const fs = require('fs');

async function testHealth() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.status === 'ok');
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function testIndexHtml() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/', (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        const checks = {
          status200: res.statusCode === 200,
          noKindleOverlay: !html.includes('<div id="kindle">'),
          noKindleGl: !html.includes('id="kindle-gl"'),
          noKindleProgress: !html.includes('class="kindle-label"'),
          hasStageAndCanvas: html.includes('<div id="stage"><canvas id="gl"></canvas></div>'),
          hasKbEdgeGlsl: html.includes('window.__kbEdge = `'),
          hasKbIntroBurn: html.includes('window.__kbIntroBurn = x =>'),
          hasInstantKbLoad: html.includes('window.__kbLoad = {'),
          hasWebGLFallback: html.includes('window.showWebGLFallback = function'),
          hasDirectBoot: html.includes('S.reveal = 1.0;'),
          hasAll8Chapters: [0, 1, 2, 3, 4, 5, 6, 7].every(i => html.includes(`id="ch${i}"`)),
          hasLockupHero: html.includes('id="lockup"') && html.includes('What is missing from what you found?'),
          hasWashiFoot: html.includes('id="foot"'),
          hasAppJs: html.includes('<script src="/app.js"></script>')
        };
        resolve(checks);
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("Testing server health...");
  const healthOk = await testHealth();
  console.log("Health endpoint ok:", healthOk);

  console.log("Testing served index.html...");
  const checks = await testIndexHtml();
  console.log("Index HTML checks:", JSON.stringify(checks, null, 2));

  const allPassed = healthOk && Object.values(checks).every(Boolean);
  console.log("ALL CHECKS PASSED:", allPassed);
  if (!allPassed) process.exit(1);
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
