const { validateUrl } = require('./urlValidator');

const TIMEOUT_MS = 10000; // 10 seconds per source
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB maximum response size

/**
 * Safely reads the response body with an upper byte limit to prevent oversized downloads.
 *
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  let totalBytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Response size exceeded limit of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      }

      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode(); // Flush any trailing bytes
    return text;
  } catch (err) {
    if (err.message && err.message.includes('exceeded limit')) {
      throw err;
    }
    throw new Error(`Failed while reading response stream: ${err.message}`);
  }
}

/**
 * Fetches an HTML page securely, with SSRF protection, DNS validation,
 * redirect limits, content-type checks, size limits, and a 10s timeout.
 *
 * @param {string} initialUrl
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
async function fetchPage(initialUrl) {
  let currentUrl = initialUrl.trim();
  let redirectCount = 0;

  while (true) {
    // 1. SSRF and DNS-resolved IP validation for the current URL
    await validateUrl(currentUrl);

    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DigitalDarkSpot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Request timed out after ${TIMEOUT_MS / 1000} seconds.`);
      }
      if (err.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused by host at ${currentUrl}.`);
      }
      if (err.code === 'ENOTFOUND') {
        throw new Error(`Hostname not found for ${currentUrl}.`);
      }
      throw new Error(`Network error while fetching ${currentUrl}: ${err.message}`);
    }

    // 2. Handle HTTP Redirects manually to prevent redirect-based SSRF
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (exceeded limit of ${MAX_REDIRECTS}).`);
      }

      const locationHeader = response.headers.get('location');
      if (!locationHeader) {
        throw new Error(`Redirect response (HTTP ${response.status}) was missing a Location header.`);
      }

      try {
        // Resolve relative redirects against the current URL
        currentUrl = new URL(locationHeader, currentUrl).href;
      } catch {
        throw new Error(`Invalid redirect Location URL: "${locationHeader}".`);
      }

      continue;
    }

    // 3. Check HTTP Status
    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : '';
      throw new Error(`Website returned HTTP ${response.status}${statusText}.`);
    }

    // 4. Validate Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') ||
                   contentType.includes('application/xhtml+xml');

    if (!isHtml) {
      throw new Error(
        `Unsupported content type "${contentType || 'unknown'}". Only HTML web pages can be processed.`
      );
    }

    // 5. Check Content-Length header if present
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BYTES) {
      throw new Error(
        `Response size (${Math.round(contentLength / (1024 * 1024))} MB) exceeds maximum allowed limit of ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`
      );
    }

    // 6. Read body with stream size limit
    const html = await readBodyWithLimit(response, MAX_BYTES);
    return {
      html,
      finalUrl: currentUrl
    };
  }
}

module.exports = {
  fetchPage,
  TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_BYTES
};
