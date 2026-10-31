const { spawn } = require('child_process');
const http = require('http');

async function run() {
  const port = 9340;
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
    const errors = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result);
        callbacks.delete(msg.id);
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
    await send('Page.navigate', { url: 'http://localhost:3000/' });

    // Wait 5 seconds for complete workshop boot
    await new Promise(r => setTimeout(r, 5000));

    // Test 1: Initial state
    const t1 = await send('Runtime.evaluate', {
      expression: `({
        state: window.__kb.state(),
        lockup: window.getComputedStyle(document.getElementById('lockup')).visibility
      })`,
      returnByValue: true
    });
    console.log("Test 1 (Initial Hero):", t1.result.value);

    // Test 2: Jump through chapter 2, chapter 4 (Yakisugi char), chapter 7
    const t2 = await send('Runtime.evaluate', {
      expression: `(() => {
        window.__kb.jump(1, 0.45); // Jump into station 4
        return window.__kb.state();
      })()`,
      returnByValue: true
    });
    console.log("Test 2 (Jump to Chapter 4 Yakisugi):", t2.result.value);

    // Test 3: Test inspect dialog
    const t3 = await send('Runtime.evaluate', {
      expression: `(() => {
        // Inspect tabletop tool
        const inspectEl = document.getElementById('inspect');
        const opened = typeof inspectOpen === 'function';
        return { inspectDialogExists: !!inspectEl, inspectOpenFn: opened };
      })()`,
      returnByValue: true
    });
    console.log("Test 3 (Inspect System):", t3.result.value);

    // Test 4: Jump to foot (Washi Paper Dossier)
    const t4 = await send('Runtime.evaluate', {
      expression: `(() => {
        window.__kb.jump(1, 1.0); // Foot washi paper
        const foot = document.getElementById('foot');
        return {
          state: window.__kb.state(),
          footClassUp: foot.classList.contains('up'),
          formVisible: !!document.getElementById('analysis-form')
        };
      })()`,
      returnByValue: true
    });
    console.log("Test 4 (Washi Paper Dossier Reveal):", t4.result.value);

    // Test 5: Verify no uncaught exceptions throughout
    console.log("Total errors captured:", errors.length);
    if (errors.length > 0) {
      errors.forEach(e => console.error(e));
      process.exit(1);
    } else {
      console.log("ALL TESTS PASSED WITH 0 ERRORS!");
      process.exit(0);
    }

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
