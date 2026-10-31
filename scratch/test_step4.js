const { spawn } = require('child_process');
const http = require('http');

async function run() {
  const port = 9346;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now()
  ]);

  try {
    await new Promise(r => setTimeout(r, 1000));
    const pagesData = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${port}/json/list`, resp => {
        let buf = '';
        resp.on('data', d => buf += d);
        resp.on('end', () => res(buf));
      }).on('error', rej);
    });
    const pages = JSON.parse(pagesData);
    const ws = new global.WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let id = 1;
    const callbacks = new Map();
    const networkRequests = [];
    const errors = [];
    const logs = [];

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result);
        callbacks.delete(msg.id);
      }
      if (msg.method === 'Network.requestWillBeSent') {
        networkRequests.push(msg.params.request.url);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        logs.push(`[${type}] ${text}`);
        if (type === 'error') errors.push(text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text;
        errors.push(`EXCEPTION: ${desc}`);
      }
    });

    function send(method, params = {}) {
      return new Promise(resolve => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    console.log("Navigating to http://localhost:3000/ ...");
    await send('Page.navigate', { url: 'http://localhost:3000/' });

    // Wait 7.5 seconds for complete workshop boot
    await new Promise(r => setTimeout(r, 7500));

    // CHECK 1: Three.js 3D workshop alive
    const t1 = await send('Runtime.evaluate', {
      expression: `({
        state: window.__kb ? window.__kb.state() : null,
        lockupVis: window.getComputedStyle(document.getElementById('lockup')).visibility
      })`,
      returnByValue: true
    });
    console.log("Check 1 (3D Workshop Alive):", t1.result.value);

    // Record network requests count before sample demo click
    const netCountBefore = networkRequests.length;

    // CHECK 2: Click Sample Demo Button
    console.log("Clicking #sample-demo-btn...");
    const clickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('sample-demo-btn');
        if (!btn) return { error: 'Button not found' };
        btn.click();
        return { clicked: true };
      })()`,
      returnByValue: true
    });
    console.log("Click result:", clickRes.result.value);

    // Wait 1.5 seconds for demo loading transition
    await new Promise(r => setTimeout(r, 1500));

    // CHECK 3: Verify NO API calls made during sample demo
    const apiCalls = networkRequests.slice(netCountBefore).filter(url => url.includes('/api/'));
    console.log("API calls during sample demo:", apiCalls);
    const zeroApiCalls = apiCalls.length === 0;
    console.log("Check 3 (Zero API calls during Sample Demo):", zeroApiCalls);

    // CHECK 4: Check Results Dashboard rendering and Sample Data labels
    const t4 = await send('Runtime.evaluate', {
      expression: `(() => {
        const results = document.getElementById('results-section');
        const banner = document.getElementById('sample-demo-notice-banner');
        const modelTag = document.getElementById('dossier-model-tag');
        const q = document.getElementById('dossier-question');
        const summaryCards = document.querySelectorAll('#summary-container .summary-card');
        const gapCards = document.querySelectorAll('#gaps-container .gap-card');
        const conflictCards = document.querySelectorAll('#conflicts-container .conflict-card');
        const outdatedCards = document.querySelectorAll('#outdated-container .outdated-card');
        const unansweredCards = document.querySelectorAll('#unanswered-container .unanswered-card');
        const checklistItems = document.querySelectorAll('#checklist-container .checklist-item-card');
        const manifestCards = document.querySelectorAll('#sources-manifest-container .manifest-card');

        return {
          resultsVisible: !results.hidden,
          bannerVisible: banner ? !banner.hidden : false,
          bannerText: banner ? banner.textContent.trim().slice(0, 80) : '',
          modelTagText: modelTag ? modelTag.textContent : '',
          questionText: q ? q.textContent : '',
          summaryCount: summaryCards.length,
          gapCount: gapCards.length,
          conflictCount: conflictCards.length,
          outdatedCount: outdatedCards.length,
          unansweredCount: unansweredCards.length,
          checklistCount: checklistItems.length,
          manifestCount: manifestCards.length
        };
      })()`,
      returnByValue: true
    });
    console.log("Check 4 (Dashboard & Counts):", t4.result.value);

    // CHECK 5: Test Checklist interactivity (checking an item)
    const t5 = await send('Runtime.evaluate', {
      expression: `(() => {
        const checkbox = document.querySelector('.checklist-checkbox');
        const pillBefore = document.getElementById('checklist-progress-pill').textContent;
        if (checkbox) {
          checkbox.click();
        }
        const pillAfter = document.getElementById('checklist-progress-pill').textContent;
        return { pillBefore, pillAfter };
      })()`,
      returnByValue: true
    });
    console.log("Check 5 (Checklist Interactivity):", t5.result.value);

    // CHECK 6: Test Evidence Drawer with S1 Citation
    const t6 = await send('Runtime.evaluate', {
      expression: `(() => {
        const citeBtn = document.querySelector('[data-action="open-drawer"][data-source-id="S1"]');
        if (citeBtn) citeBtn.click();
        const drawer = document.getElementById('evidence-drawer');
        const badge = document.getElementById('drawer-source-badge').textContent;
        const text = document.getElementById('drawer-source-text').textContent;
        const hasHighlight = !!document.getElementById('drawer-source-text').querySelector('mark');
        return {
          drawerVisible: drawer ? !drawer.hidden : false,
          badgeText: badge,
          textSnippet: text.slice(0, 100),
          hasHighlight
        };
      })()`,
      returnByValue: true
    });
    console.log("Check 6 (Evidence Drawer S1):", t6.result.value);

    // CHECK 7: Close Evidence Drawer
    const t7 = await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.getElementById('drawer-close-btn');
        if (closeBtn) closeBtn.click();
        const drawer = document.getElementById('evidence-drawer');
        return { drawerHidden: drawer ? drawer.hidden : true };
      })()`,
      returnByValue: true
    });
    console.log("Check 7 (Close Evidence Drawer):", t7.result.value);

    // CHECK 8: Test Back to Query and verify input state
    const t8 = await send('Runtime.evaluate', {
      expression: `(() => {
        const backBtn = document.getElementById('back-to-input-btn');
        if (backBtn) backBtn.click();
        const inputSec = document.getElementById('input-section');
        const qVal = document.getElementById('research-question').value;
        const sourceCards = document.querySelectorAll('.source-item-card');
        return {
          inputSectionVisible: !inputSec.hidden,
          questionValLength: qVal.length,
          sourceCardsCount: sourceCards.length
        };
      })()`,
      returnByValue: true
    });
    console.log("Check 8 (Back to Input & State Retention):", t8.result.value);

    // CHECK 9: Animation regression check (Station scroll)
    const t9 = await send('Runtime.evaluate', {
      expression: `(() => {
        if (window.__kb) {
          window.__kb.jump(1, 0.35);
          return {
            kbState: window.__kb.state(),
            glExists: !!document.getElementById('gl')
          };
        }
        return { error: 'window.__kb not ready' };
      })()`,
      returnByValue: true
    });
    console.log("Check 9 (Animation Jump Station 3):", t9.result.value);

    // Total uncaught errors check
    console.log("Total errors captured:", errors.length);
    if (errors.length > 0) {
      errors.forEach(e => console.error("Error:", e));
      process.exit(1);
    }

    const allPassed = zeroApiCalls &&
      t1.result.value.state &&
      t1.result.value.state.tris > 0 &&
      t4.result.value.resultsVisible &&
      t4.result.value.bannerVisible &&
      t4.result.value.summaryCount === 5 &&
      t4.result.value.gapCount === 3 &&
      t4.result.value.conflictCount === 2 &&
      t4.result.value.outdatedCount === 1 &&
      t4.result.value.unansweredCount === 3 &&
      t4.result.value.checklistCount === 5 &&
      t4.result.value.manifestCount === 3 &&
      t5.result.value.pillAfter === '1 of 5 verified' &&
      t6.result.value.drawerVisible &&
      t6.result.value.badgeText.includes('SAMPLE DATA') &&
      t6.result.value.hasHighlight &&
      t7.result.value.drawerHidden &&
      t8.result.value.inputSectionVisible &&
      t8.result.value.sourceCardsCount === 3 &&
      t9.result.value.kbState &&
      t9.result.value.kbState.tris > 0;

    console.log("\n=================================");
    console.log("ALL STEP 4 CHECKS PASSED:", allPassed);
    console.log("=================================");

    ws.close();
    if (!allPassed) process.exit(1);
  } finally {
    chrome.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
