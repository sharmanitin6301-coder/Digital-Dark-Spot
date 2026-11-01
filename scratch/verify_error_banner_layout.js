const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const QUOTA_ERROR_MSG = 'The Gemini API daily quota has been reached for this project and tier. Quota limits depend on your Google AI Studio plan, model allocation, and billing tier. Please check your Google AI Studio quota settings or explore the offline Sample Demo.';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json();
      if (data && data.webSocketDebuggerUrl) {
        return data.webSocketDebuggerUrl;
      }
    } catch {
      await delay(200);
    }
  }
  throw new Error('Failed to connect to Chrome debugging endpoint');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.id && this.callbacks.has(parsed.id)) {
        const { resolve, reject } = this.callbacks.get(parsed.id);
        this.callbacks.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function verifyLayout() {
  console.log('Spawning headless Chrome...');
  const port = 9333;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900'
  ]);

  try {
    const wsUrl = await getDebuggerUrl(port);
    console.log('Connected to Chrome DevTools Protocol at:', wsUrl);

    // Get pages from /json/list
    await delay(500);
    const pagesRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await pagesRes.json();
    const page = pages.find(p => p.type === 'page') || pages[0];
    console.log('Attaching to page:', page.title, page.webSocketDebuggerUrl);

    const client = new CDPClient(page.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('CSS.enable');

    console.log('Navigating to http://127.0.0.1:3000...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:3000' });
    await delay(2000);

    const viewports = [
      { name: 'Desktop', width: 1440, height: 900 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 812 }
    ];

    const results = [];

    for (const vp of viewports) {
      console.log(`\n============================================================`);
      console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`============================================================`);

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.name === 'Mobile'
      });
      await delay(300);

      // Trigger the Gemini 429 quota error message in the DOM
      const evalRes = await client.send('Runtime.evaluate', {
        expression: `
          (function() {
            // Scroll to footer so elements are in DOM viewport
            const foot = document.getElementById('foot');
            if (foot) foot.classList.add('up');
            
            const banner = document.getElementById('form-error-banner');
            banner.textContent = ${JSON.stringify(QUOTA_ERROR_MSG)};
            banner.hidden = false;

            const actions = document.querySelector('.form-actions-row');
            const artwork = document.querySelector('.workshop-art');
            const form = document.getElementById('analysis-form');

            const bannerRect = banner.getBoundingClientRect();
            const actionsRect = actions ? actions.getBoundingClientRect() : null;
            const artworkRect = artwork ? artwork.getBoundingClientRect() : null;
            const formRect = form ? form.getBoundingClientRect() : null;

            const cs = window.getComputedStyle(banner);

            // Check if banner overlaps artwork
            let overlapsArtwork = false;
            if (artworkRect) {
              const xOverlap = Math.max(0, Math.min(bannerRect.right, artworkRect.right) - Math.max(bannerRect.left, artworkRect.left));
              const yOverlap = Math.max(0, Math.min(bannerRect.bottom, artworkRect.bottom) - Math.max(bannerRect.top, artworkRect.top));
              overlapsArtwork = (xOverlap > 0 && yOverlap > 0);
            }

            // Check if banner is below action buttons
            const isBelowButtons = actionsRect ? (bannerRect.top >= actionsRect.bottom - 2) : false;

            return {
              viewport: '${vp.name}',
              bannerWidth: bannerRect.width,
              bannerHeight: bannerRect.height,
              bannerTop: bannerRect.top,
              bannerLeft: bannerRect.left,
              actionsBottom: actionsRect ? actionsRect.bottom : null,
              artworkLeft: artworkRect ? artworkRect.left : null,
              artworkRight: artworkRect ? artworkRect.right : null,
              isBelowButtons,
              overlapsArtwork,
              computedStyles: {
                display: cs.display,
                width: cs.width,
                maxWidth: cs.maxWidth,
                minWidth: cs.minWidth,
                boxSizing: cs.boxSizing,
                overflowWrap: cs.overflowWrap,
                lineHeight: cs.lineHeight,
                fontSize: cs.fontSize,
                borderLeftColor: cs.borderLeftColor
              }
            };
          })()
        `,
        returnByValue: true
      });

      const data = evalRes.result.value;
      console.log(`- Banner dimensions: width=${data.bannerWidth}px, height=${data.bannerHeight}px`);
      console.log(`- Positioned below action buttons: ${data.isBelowButtons} (bannerTop=${data.bannerTop.toFixed(1)}px vs actionsBottom=${data.actionsBottom.toFixed(1)}px)`);
      console.log(`- Overlaps logo / illustration: ${data.overlapsArtwork} (bannerLeft=${data.bannerLeft.toFixed(1)}px, artworkLeft=${data.artworkLeft ? data.artworkLeft.toFixed(1) : 'N/A'}px)`);
      console.log(`- Computed CSS: display=${data.computedStyles.display}, overflowWrap=${data.computedStyles.overflowWrap}, boxSizing=${data.computedStyles.boxSizing}`);

      const pass = data.isBelowButtons && !data.overlapsArtwork && data.bannerWidth > 200;
      results.push({
        viewport: vp.name,
        width: vp.width,
        pass,
        data
      });
      console.log(`-> VIEWPORT ${vp.name}: ${pass ? 'PASS' : 'FAIL'}`);

      // Capture screenshot
      const ssRes = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(__dirname, `screenshot_error_${vp.name.toLowerCase()}.png`), Buffer.from(ssRes.data, 'base64'));
    }

    client.close();

    console.log('\n============================================================');
    console.log('FINAL RESPONSIVE VERIFICATION SUMMARY');
    console.log('============================================================');
    console.table(results.map(r => ({
      Viewport: r.viewport,
      Width: `${r.width}px`,
      BannerWidth: `${r.data.bannerWidth.toFixed(1)}px`,
      BannerHeight: `${r.data.bannerHeight.toFixed(1)}px`,
      BelowButtons: r.data.isBelowButtons ? 'YES' : 'NO',
      OverlapsArtwork: r.data.overlapsArtwork ? 'YES (OVERLAP)' : 'NO (CLEAR)',
      Result: r.pass ? 'PASS' : 'FAIL'
    })));

    const allPassed = results.every(r => r.pass);
    console.log(`\nOVERALL STATUS: ${allPassed ? 'ALL VIEWPORTS PASSED (3/3)' : 'SOME VIEWPORTS FAILED'}`);

  } finally {
    chromeProc.kill('SIGKILL');
  }
}

verifyLayout().catch(console.error);
