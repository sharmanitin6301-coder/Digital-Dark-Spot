const { spawn } = require('child_process');
const http = require('http');

async function getWsUrl(port) {
  for (let i = 0; i < 20; i++) {
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
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Could not get CDP websocket URL');
}

async function run() {
  const port = 9334;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now()
  ]);

  try {
    const wsUrl = await getWsUrl(port);
    console.log("Connected to Chrome CDP at:", wsUrl);

    // Get pages list
    const pagesData = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${port}/json/list`, resp => {
        let buf = '';
        resp.on('data', d => buf += d);
        resp.on('end', () => res(buf));
      }).on('error', rej);
    });
    const pages = JSON.parse(pagesData);
    const pageTarget = pages.find(p => p.type === 'page') || pages[0];
    const pageWsUrl = pageTarget.webSocketDebuggerUrl;

    const ws = new global.WebSocket(pageWsUrl);

    const errors = [];
    const logs = [];

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    let id = 1;
    const callbacks = new Map();

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
      } else if (msg.method === 'Runtime.exceptionThrown') {
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
    await send('Log.enable');

    console.log("Navigating to http://localhost:3000/ ...");
    await send('Page.navigate', { url: 'http://localhost:3000/' });

    // Wait 3.5 seconds for scripts and Three.js initialization
    await new Promise(r => setTimeout(r, 3500));

    // Check DOM state
    const evalResult = await send('Runtime.evaluate', {
      expression: `({
        glExists: !!document.getElementById('gl'),
        lockupVis: window.getComputedStyle(document.getElementById('lockup')).visibility,
        lockupOp: window.getComputedStyle(document.getElementById('lockup')).opacity,
        barVis: window.getComputedStyle(document.getElementById('bar')).visibility,
        footUp: document.getElementById('foot').classList.contains('up'),
        title: document.title
      })`,
      returnByValue: true
    });

    console.log("=== DOM EVALUATION RESULT ===");
    console.log(evalResult.result.value);

    console.log("=== BROWSER CONSOLE LOGS ===");
    logs.forEach(l => console.log(l));

    console.log("=== BROWSER ERRORS ===");
    console.log("Total errors:", errors.length);
    errors.forEach(e => console.error(e));

    ws.close();

    if (errors.length > 0) {
      console.log("TEST FAILED: Uncaught browser errors detected!");
      process.exit(1);
    } else {
      console.log("TEST PASSED: Clean console, no uncaught exceptions!");
      process.exit(0);
    }
  } finally {
    chrome.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
