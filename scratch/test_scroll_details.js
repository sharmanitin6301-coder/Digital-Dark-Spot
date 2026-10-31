const { spawn } = require('child_process');
const http = require('http');

async function testScroll() {
  const port = 9366;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--user-data-dir=/tmp/test-scroll-' + Date.now()
  ]);

  try {
    await new Promise(r => setTimeout(r, 1000));
    const pagesData = await new Promise(res => {
      http.get(`http://127.0.0.1:${port}/json/list`, resp => {
        let buf = ''; resp.on('data', d => buf += d); resp.on('end', () => res(buf));
      });
    });
    const pages = JSON.parse(pagesData);
    const ws = new global.WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let id = 1;
    function send(method, params = {}) {
      return new Promise(res => {
        const msgId = id++;
        const handler = e => {
          const m = JSON.parse(e.data);
          if (m.id === msgId) {
            ws.removeEventListener('message', handler);
            res(m.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 4000));

    const before = await send('Runtime.evaluate', {
      expression: `({
        scrollY: window.scrollY,
        docScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight
      })`,
      returnByValue: true
    });
    console.log('Before scroll:', before.result.value);

    await send('Runtime.evaluate', {
      expression: `window.scrollTo(0, 1500)`
    });
    await new Promise(r => setTimeout(r, 500));

    const after = await send('Runtime.evaluate', {
      expression: `({
        scrollY: window.scrollY,
        docScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop
      })`,
      returnByValue: true
    });
    console.log('After window.scrollTo(0, 1500):', after.result.value);

    // Try scrolling documentElement
    await send('Runtime.evaluate', {
      expression: `document.documentElement.scrollTop = 2500; window.dispatchEvent(new Event('scroll'));`
    });
    await new Promise(r => setTimeout(r, 500));

    const afterDoc = await send('Runtime.evaluate', {
      expression: `({
        scrollY: window.scrollY,
        docScrollTop: document.documentElement.scrollTop,
        scrollProgress: typeof scrollProgress === 'function' ? scrollProgress() : 'not defined'
      })`,
      returnByValue: true
    });
    console.log('After docElement.scrollTop = 2500:', afterDoc.result.value);

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

testScroll();
