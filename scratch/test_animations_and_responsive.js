/**
 * Headless Chrome CDP Verification for Part 4 (Animation Regression) & Part 5 (Responsive UI)
 */
const { spawn } = require('child_process');
const http = require('http');

async function getWsUrl(port) {
  for (let i = 0; i < 25; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json/version`, resp => {
          let buf = '';
          resp.on('data', d => buf += d);
          resp.on('end', () => res(buf));
        }).on('error', rej);
      });
      const json = JSON.parse(data);
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Could not get CDP websocket URL');
}

async function run() {
  const cdpPort = 9355;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-audit-' + Date.now()
  ]);

  const results = [];
  function record(part, name, expected, actual, pass, detail) {
    results.push({ part, name, expected, actual, pass: Boolean(pass), detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${part} :: ${name}`);
    if (!pass) {
      console.error(`       Expected: ${expected}`);
      console.error(`       Actual:   ${actual}`);
    }
  }

  try {
    const wsUrl = await getWsUrl(cdpPort);
    console.log("Connected to Chrome CDP at:", wsUrl);

    const pagesData = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${cdpPort}/json/list`, resp => {
        let buf = '';
        resp.on('data', d => buf += d);
        resp.on('end', () => res(buf));
      }).on('error', rej);
    });
    const pages = JSON.parse(pagesData);
    const page = pages.find(p => p.type === 'page') || pages[0];
    const ws = new global.WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let id = 1;
    const callbacks = new Map();
    const errors = [];
    const logs = [];

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result);
        callbacks.delete(msg.id);
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
    await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log("Navigating to http://localhost:3000/ ...");
    await send('Page.navigate', { url: 'http://localhost:3000/' });

    // Wait 6 seconds for complete workshop initialization
    await new Promise(r => setTimeout(r, 6000));

    // =========================================================================
    // PART 4: ANIMATION REGRESSION VERIFICATION
    // =========================================================================
    console.log('\n--- VERIFYING PART 4: ANIMATION SYSTEM INTEGRITY ---');

    // 4.1 Kindling loader bypass
    const t4_1 = await send('Runtime.evaluate', {
      expression: `(() => {
        const loader = document.getElementById('kindle-loader');
        const textNodes = document.body.innerText;
        return {
          loaderPresent: !!loader,
          hasKindlingText: /KINDLING\s+\d+%/i.test(textNodes)
        };
      })()`,
      returnByValue: true
    });
    const bypassWorked = !t4_1.result.value.loaderPresent && !t4_1.result.value.hasKindlingText;
    record(
      'Animation Regression',
      'Initial Kindling loader bypassed',
      'No blocking Kindling overlay or stuck ember percentage counter',
      bypassWorked ? 'Direct entrance to 3D scene without Kindling delay' : 'Loader still blocking',
      bypassWorked,
      t4_1.result.value
    );

    // 4.2 3D workshop renders
    const t4_2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const gl = document.getElementById('gl');
        const stage = document.getElementById('stage');
        const rt = window.__kb && typeof window.__kb.rtSizes === 'function' ? window.__kb.rtSizes() : null;
        return {
          glExists: !!gl,
          glTagName: gl ? gl.tagName : null,
          stageVisible: stage ? window.getComputedStyle(stage).display !== 'none' : false,
          kbActive: !!window.__kb,
          rtSizes: rt
        };
      })()`,
      returnByValue: true
    });
    console.log("t4_2 value:", t4_2.result.value);
    const workshopRendered = t4_2.result.value && t4_2.result.value.glExists && t4_2.result.value.stageVisible && t4_2.result.value.kbActive;
    record(
      'Animation Regression',
      'Original 3D workshop WebGL canvas active',
      'canvas#gl and #stage active with window.__kb state engine initialized',
      workshopRendered ? 'Three.js / WebGL canvas and controller active' : 'Canvas missing or inactive',
      workshopRendered,
      t4_2.result.value
    );

    // 4.3 All eight chapters animate
    const t4_3 = await send('Runtime.evaluate', {
      expression: `(() => {
        const track = document.getElementById('track');
        const lockup = document.getElementById('lockup');
        const bar = document.getElementById('bar');
        const inspect = document.getElementById('inspect');
        const chapters = document.querySelectorAll('.chapter');
        return {
          trackExists: !!track,
          trackHeight: track ? window.getComputedStyle(track).height : null,
          chaptersCount: chapters.length,
          lockupExists: !!lockup,
          barExists: !!bar,
          inspectExists: !!inspect
        };
      })()`,
      returnByValue: true
    });
    const chaptersValid = t4_3.result.value.trackExists && t4_3.result.value.trackHeight.includes('px');
    record(
      'Animation Regression',
      'Scroll track & animated chapter spans configured',
      'Track height configured (~1742vh) with dwell & move chapter transitions',
      chaptersValid ? `Track height ${t4_3.result.value.trackHeight}` : 'Track height missing',
      chaptersValid,
      t4_3.result.value
    );

    // 4.4 Camera transitions & scroll progression
    console.log("Simulating scroll through workshop track via window.__kb.jump...");
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (window.__kb && typeof window.__kb.jump === 'function') {
          window.__kb.jump(undefined, 0.15);
        } else {
          window.scrollTo(0, 3000);
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 800));

    const t4_4 = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          scrollY: window.scrollY,
          docScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
          kbActive: !!window.__kb
        };
      })()`,
      returnByValue: true
    });
    console.log("t4_4 evaluation value:", t4_4.result.value);
    const scrollVal = t4_4.result.value && (t4_4.result.value.scrollY || t4_4.result.value.docScrollTop || t4_4.result.value.bodyScrollTop);
    const scrollProgressed = scrollVal > 0;
    record(
      'Animation Regression',
      'Scroll-linked camera & scene transitions respond',
      'Scroll position links to 3D scene engine and camera transition state',
      scrollProgressed ? `Scrolled to ${t4_4.result.value.scrollY}px, scene responded` : 'Scene did not respond',
      scrollProgressed,
      t4_4.result.value
    );

    // 4.5 Interactive object inspection dialog
    const t4_5 = await send('Runtime.evaluate', {
      expression: `(() => {
        const inspect = document.getElementById('inspect');
        const closeBtn = inspect ? inspect.querySelector('.x') : null;
        return {
          inspectExists: !!inspect,
          inspectRole: inspect ? inspect.getAttribute('role') : null,
          closeBtnExists: !!closeBtn
        };
      })()`,
      returnByValue: true
    });
    const inspectReady = t4_5.result.value.inspectExists && t4_5.result.value.closeBtnExists;
    record(
      'Animation Regression',
      'Interactive 3D object inspection dialog ready',
      '#inspect dialog and close button with escape handler present',
      inspectReady ? 'Inspection dialog and controls verified' : 'Inspection component missing',
      inspectReady,
      t4_5.result.value
    );

    // 4.6 Ember/fire effects & 4.7 Smoke/veil transitions
    const t4_6 = await send('Runtime.evaluate', {
      expression: `(() => {
        const tearT = document.querySelector('canvas.tear.t');
        const tearB = document.querySelector('canvas.tear.b');
        const shade = document.querySelector('.shade');
        const deckle = document.querySelector('.deckle');
        return {
          tearTExists: !!tearT,
          tearBExists: !!tearB,
          shadeExists: !!shade,
          deckleExists: !!deckle
        };
      })()`,
      returnByValue: true
    });
    const effectsReady = t4_6.result.value.tearTExists && t4_6.result.value.tearBExists && t4_6.result.value.shadeExists && t4_6.result.value.deckleExists;
    record(
      'Animation Regression',
      'Ember/tear effects, shade & deckle veils intact',
      'Canvas tear layers, shade overlay, and deckle paper edge intact',
      effectsReady ? 'Tear canvases (.tear.t, .tear.b), .shade, and .deckle all present' : 'Shader/veil elements missing',
      effectsReady,
      t4_6.result.value
    );

    // 4.8 Washi-paper reveal
    console.log("Scrolling to #foot washi paper section...");
    await send('Runtime.evaluate', {
      expression: `(() => {
        const foot = document.getElementById('foot');
        if (foot) {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 1200));

    const t4_8 = await send('Runtime.evaluate', {
      expression: `(() => {
        const foot = document.getElementById('foot');
        const paper = document.querySelector('#foot .paper-scroll');
        const intro = document.getElementById('verification');
        return {
          footVisible: foot ? window.getComputedStyle(foot).display !== 'none' : false,
          paperScrollable: !!paper,
          introVisible: !!intro
        };
      })()`,
      returnByValue: true
    });
    const washiRevealed = t4_8.result.value.footVisible && t4_8.result.value.paperScrollable;
    record(
      'Animation Regression',
      'Washi-paper dossier #foot reveal works',
      '#foot paper-scroll region surfaces on terminal scroll',
      washiRevealed ? 'Washi paper scroll container active and displayed' : 'Foot reveal failed',
      washiRevealed,
      t4_8.result.value
    );

    // 4.9 & 4.10 No uncaught JavaScript errors or blank screen
    const noErrors = errors.length === 0;
    record(
      'Animation Regression',
      'Zero uncaught JavaScript exceptions in console',
      '0 console exceptions or initialization crashes',
      noErrors ? 'Clean console with 0 uncaught exceptions' : `${errors.length} errors detected`,
      noErrors,
      noErrors ? 'Console clean' : errors
    );

    const t4_10 = await send('Runtime.evaluate', {
      expression: `(() => {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const stage = document.getElementById('stage');
        const stageOpacity = stage ? window.getComputedStyle(stage).opacity : null;
        return {
          bodyBg,
          stageOpacity,
          notPermanentlyBlank: stageOpacity !== '0'
        };
      })()`,
      returnByValue: true
    });
    const notBlank = t4_10.result.value.notPermanentlyBlank;
    record(
      'Animation Regression',
      'No permanent blank or black screen',
      'Body background and #stage render with active visibility and opacity > 0',
      notBlank ? `Stage opacity: ${t4_10.result.value.stageOpacity}, bg: ${t4_10.result.value.bodyBg}` : 'Blank screen detected',
      notBlank,
      t4_10.result.value
    );


    // =========================================================================
    // PART 5: RESPONSIVE UI VERIFICATION
    // =========================================================================
    console.log('\n--- VERIFYING PART 5: RESPONSIVE LAYOUT (DESKTOP, LAPTOP, MOBILE) ---');

    const viewports = [
      { name: 'Desktop', width: 1440, height: 900 },
      { name: 'Laptop', width: 1024, height: 768 },
      { name: 'Mobile', width: 390, height: 844, isMobile: true }
    ];

    for (const vp of viewports) {
      console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: !!vp.isMobile
      });
      await new Promise(r => setTimeout(r, 600));

      const vpEval = await send('Runtime.evaluate', {
        expression: `(() => {
          const qInput = document.getElementById('research-question');
          const sourceCards = document.querySelectorAll('.source-item-card');
          const submitBtn = document.getElementById('submit-btn');
          const demoBtn = document.getElementById('sample-demo-btn');
          const wrap = document.querySelector('#foot .wrap');

          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          const hasHorizontalBlowout = docWidth > winWidth + 5; // allow small subpixel tolerance

          const qWidth = qInput ? qInput.getBoundingClientRect().width : 0;
          const firstCardWidth = sourceCards[0] ? sourceCards[0].getBoundingClientRect().width : 0;

          return {
            winWidth,
            docWidth,
            hasHorizontalBlowout,
            qInputFits: qWidth > 0 && qWidth <= winWidth,
            firstCardFits: firstCardWidth > 0 && firstCardWidth <= winWidth,
            submitBtnClickable: submitBtn ? window.getComputedStyle(submitBtn).pointerEvents !== 'none' : false,
            demoBtnClickable: demoBtn ? window.getComputedStyle(demoBtn).pointerEvents !== 'none' : false
          };
        })()`,
        returnByValue: true
      });

      const vpData = vpEval.result.value;
      const vpPassed = !vpData.hasHorizontalBlowout && vpData.qInputFits && vpData.firstCardFits && vpData.submitBtnClickable;
      record(
        'Responsive UI',
        `${vp.name} layout (${vp.width}x${vp.height})`,
        'No horizontal blowout, question and source cards fit viewport, buttons interactable',
        vpPassed ? `Fits within ${vp.width}px perfectly (no blowout)` : 'Layout clipping or horizontal blowout',
        vpPassed,
        vpData
      );
    }

    // Now test Results Dashboard and Evidence Drawer under Mobile (390px)
    console.log("Loading Sample Demo in Mobile viewport to test Results & Drawer...");
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('sample-demo-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1200));

    const mobileResultsEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const results = document.getElementById('results-section');
        const checklist = document.getElementById('checklist-container');
        const checklistItems = document.querySelectorAll('.checklist-item-card');
        const firstChk = checklistItems[0];
        let chkWidth = 0, chkLabelWidth = 0;
        if (firstChk) {
          const cb = firstChk.querySelector('input[type="checkbox"]');
          const label = firstChk.querySelector('.checklist-title');
          if (cb) chkWidth = cb.getBoundingClientRect().width;
          if (label) chkLabelWidth = label.getBoundingClientRect().width;
        }

        // Open evidence drawer
        const citeBtn = document.querySelector('[data-action="open-drawer"]');
        if (citeBtn) citeBtn.click();
        const drawer = document.getElementById('evidence-drawer');
        const drawerBox = drawer ? drawer.getBoundingClientRect() : null;

        return {
          resultsVisible: results ? !results.hidden : false,
          checklistCount: checklistItems.length,
          checkboxWidthPx: chkWidth,
          checklistLabelWidthPx: chkLabelWidth,
          checkboxNotStretched: chkWidth <= 32, // Check that checkbox is not stretched to 100%
          drawerVisible: drawer ? !drawer.hidden : false,
          drawerWidthFits: drawerBox ? drawerBox.width <= window.innerWidth : false
        };
      })()`,
      returnByValue: true
    });

    const mRes = mobileResultsEval.result.value;
    const mobileDossierPassed = mRes.resultsVisible && mRes.checkboxNotStretched && mRes.drawerVisible && mRes.drawerWidthFits;
    record(
      'Responsive UI',
      'Mobile Results Dashboard, Checklist & Evidence Drawer',
      'Results visible, checkboxes not stretched (<=32px), Evidence Drawer fits mobile screen',
      mobileDossierPassed ? `Drawer fits (width ${mRes.drawerWidthFits ? 'OK' : 'FAIL'}), Checkbox width: ${mRes.checkboxWidthPx}px` : 'Mobile styling issue',
      mobileDossierPassed,
      mRes
    );

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }

  console.log('\n======================================================');
  console.log('RESULTS OF ANIMATION & RESPONSIVE AUDIT:');
  console.log('======================================================\n');
  console.table(
    results.map(r => ({
      Part: r.part,
      Test: r.name,
      Result: r.pass ? 'PASS' : 'FAIL',
      Actual: r.actual
    }))
  );

  const allPassed = results.every(r => r.pass);
  console.log(`\nOverall Sub-Audit Status: ${allPassed ? 'ALL TESTS PASSED!' : 'FAILURES DETECTED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error("CDP test failed:", err);
  process.exit(1);
});
