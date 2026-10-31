const cheerio = require('cheerio');

const MAX_TEXT_LENGTH = 12000;

/**
 * Parses and validates a raw date string into an ISO 8601 string.
 * Returns null if the date is invalid, incomplete, or out of reasonable range.
 *
 * @param {string|undefined|null} rawDate
 * @returns {string|null}
 */
function parseAndValidateDate(rawDate) {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (trimmed.length < 4 || !/\d/.test(trimmed)) return null;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  // Valid publication dates fall between 1990 and current year + 1
  if (year < 1990 || year > currentYear + 1) return null;

  return parsed.toISOString();
}

/**
 * Searches a JSON-LD object/array recursively for publication or modification dates.
 *
 * @param {any} node
 * @returns {string|null}
 */
function extractDateFromJsonLd(node) {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractDateFromJsonLd(item);
      if (found) return found;
    }
    return null;
  }

  // Check direct date fields
  if (typeof node.datePublished === 'string' && node.datePublished) {
    const valid = parseAndValidateDate(node.datePublished);
    if (valid) return valid;
  }
  if (typeof node.dateModified === 'string' && node.dateModified) {
    const valid = parseAndValidateDate(node.dateModified);
    if (valid) return valid;
  }
  if (typeof node.dateCreated === 'string' && node.dateCreated) {
    const valid = parseAndValidateDate(node.dateCreated);
    if (valid) return valid;
  }

  // Check @graph or nested items
  if (node['@graph']) {
    const found = extractDateFromJsonLd(node['@graph']);
    if (found) return found;
  }

  return null;
}

/**
 * Detects publication or modification dates using meta tags, OG tags,
 * JSON-LD structured data, and visible date elements.
 *
 * @param {cheerio.CheerioAPI} $
 * @returns {string|null} ISO 8601 date string or null
 */
function extractDate($) {
  // 1. Meta tags and Open Graph metadata
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="datePublished"]',
    'meta[itemprop="datePublished"]',
    'meta[property="article:modified_time"]',
    'meta[name="article:modified_time"]',
    'meta[property="og:updated_time"]',
    'meta[name="dateModified"]',
    'meta[itemprop="dateModified"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[name="date"]',
    'meta[name="dc.date"]',
    'meta[name="dc.date.issued"]',
    'meta[name="dc.date.created"]',
    'meta[name="dcterms.date"]',
    'meta[name="dcterms.created"]',
    'meta[name="dcterms.issued"]',
    'meta[name="sailthru.date"]',
    'meta[name="parsely-pub-date"]',
    'meta[name="cxenseparse:recs:publishtime"]'
  ];

  for (const selector of metaSelectors) {
    const content = $(selector).attr('content');
    const validDate = parseAndValidateDate(content);
    if (validDate) return validDate;
  }

  // 2. JSON-LD structured data
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const rawText = $(jsonLdScripts[i]).html();
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const validDate = extractDateFromJsonLd(parsed);
        if (validDate) return validDate;
      }
    } catch {
      // Ignore JSON parse errors in malformed structured data
    }
  }

  // 3. Visible date metadata (<time> tag datetime attribute or text)
  const timeElements = $('time');
  for (let i = 0; i < timeElements.length; i++) {
    const el = $(timeElements[i]);
    const dtAttr = el.attr('datetime') || el.attr('content');
    const validDate = parseAndValidateDate(dtAttr) || parseAndValidateDate(el.text());
    if (validDate) return validDate;
  }

  // 4. Visible elements with common date classes/attributes
  const visibleDateSelectors = [
    '[itemprop="datePublished"]',
    '[itemprop="dateModified"]',
    '.published',
    '.post-date',
    '.article-date',
    '.entry-date',
    '.published-date',
    '.meta-date'
  ];

  for (const selector of visibleDateSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const val = el.attr('datetime') || el.attr('content') || el.text();
      const validDate = parseAndValidateDate(val);
      if (validDate) return validDate;
    }
  }

  return null;
}

/**
 * Elements that are never meaningful main content and should always be purged.
 */
const JUNK_SELECTORS = [
  // Scripts and styling
  'script',
  'style',
  'noscript',
  'link',
  'template',

  // Structural navigation, headers and footers
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.nav',
  '.navbar',
  '.navigation',
  '.footer',
  '.header',
  '.site-header',
  '.site-footer',
  '.sidebar',
  '.menu',
  '.breadcrumbs',
  '.breadcrumb',
  '#mw-navigation',
  '.vector-header',
  '.vector-page-toolbar',

  // Donation banners, fundraising and notices
  '#siteNotice',
  '#centralNotice',
  '.fundraising',
  '.donate',
  '.donation',
  '.frb',
  '.frb-inline',
  '.cn-banner',
  '[id*="donation"]',
  '[class*="donation"]',
  '[id*="donate"]',
  '[class*="donate"]',
  '[id*="fundrais"]',
  '[class*="fundrais"]',
  '.site-notice',
  '.alert-banner',

  // Cookie banners, popups, modals and overlays
  '.cookie-banner',
  '.cookie-notice',
  '.cookie-consent',
  '#cookie-banner',
  '#cookie-consent',
  '#onetrust-banner-sdk',
  '.qc-cmp2-container',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[id*="consent"]',
  '.modal',
  '.popup',
  '.dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.overlay',
  '.backdrop',

  // Advertisements and promotional content
  '.ad',
  '.advertisement',
  '.ad-banner',
  '.adsbygoogle',
  '[class*="sponsored"]',
  '[id*="sponsored"]',
  '.promo',
  '.promotional',
  '[class*="ad-box"]',
  '[class*="ad-container"]',
  '[id*="google_ads"]',
  '.newsletter',
  '.subscribe',
  '[class*="newsletter"]',
  '[class*="subscribe"]',

  // Hidden and visually suppressed elements
  '[aria-hidden="true"]',
  '[hidden]',
  '.hidden',
  '.hide',
  '.invisible',
  '.d-none',
  '.mw-empty-elt',
  '[style*="display: none"]',
  '[style*="display:none"]',
  '[style*="visibility: hidden"]',
  '[style*="visibility:hidden"]',

  // MediaWiki / Wikipedia specific non-content boilerplate
  '.hatnote',
  '.ambox',
  '.cmbox',
  '.tmbox',
  '.imbox',
  '.navbox',
  '.vertical-navbox',
  '.reflist',
  '.references',
  'ol.references',
  '.reference',
  '.mw-editsection',
  '.sistersitebox',
  '.catlinks',
  '.printfooter',
  '#toc',
  '.toc',

  // Social sharing, comments and image captions
  '.social-share',
  '.share-buttons',
  '.share-box',
  '.comments',
  '#comments',
  'figure',
  'figcaption',
  '.thumb',
  '.thumbcaption',
  '.infobox',

  // Interactive, media, and form elements
  'svg',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'input',
  'textarea',
  'select'
];

/**
 * Candidate containers prioritized from most specific article body to general wrappers.
 */
const CONTENT_CONTAINER_SELECTORS = [
  // MediaWiki / Wikipedia article body container
  '.mw-parser-output',

  // Standard semantic article elements
  'article',
  '.article-body',
  '.article-content',
  '.entry-content',
  '.post-content',
  '.story-body',
  '.post-body',
  '.article__body',
  '.article__content',
  '.c-article-body',

  // Main content elements
  'main article',
  'main',
  '[role="main"]',
  '#main-content',
  '#content',
  '.main-content',

  // Reasonable fallback
  'body'
];

/**
 * Extracts clean, human-readable main text content from the parsed DOM.
 * Prioritizes meaningful content containers, purges irrelevant elements,
 * removes duplicate paragraphs, and normalizes whitespace while preserving paragraph boundaries.
 *
 * @param {cheerio.CheerioAPI} $
 * @returns {string} Clean readable text capped at ~12,000 characters
 */
function extractReadableContent($) {
  // 1. Remove all known irrelevant elements globally
  $(JUNK_SELECTORS.join(', ')).remove();

  // 2. Locate the most meaningful article container with substantial content
  let $target = null;
  for (const selector of CONTENT_CONTAINER_SELECTORS) {
    const el = $(selector);
    if (el.length) {
      const candidate = el.first();
      // Ensure candidate has substantial text content (at least 50 characters)
      if (candidate.text().trim().length >= 50) {
        $target = candidate;
        break;
      }
    }
  }

  // Fallback to body if no container matched criteria
  if (!$target || !$target.length) {
    $target = $('body');
  }

  // Secondary sweep inside target in case any nested junk was missed
  $target.find(JUNK_SELECTORS.join(', ')).remove();

  // 3. Format spacing: replace <br> with newlines, append spacing to block elements
  $target.find('br').replaceWith('\n');
  $target.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, section').each((_, el) => {
    $(el).prepend('\n').append('\n');
  });

  // 4. Split into distinct paragraphs, trim and normalize
  const rawText = $target.text();
  const rawParagraphs = rawText
    .split(/\n+/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0);

  // 5. Remove duplicate paragraphs and repeated text
  const seenExact = new Set();
  const seenNormalized = new Set();
  const uniqueParagraphs = [];

  for (const para of rawParagraphs) {
    // Check exact duplicate
    if (seenExact.has(para)) {
      continue;
    }
    seenExact.add(para);

    // For longer paragraphs, check normalized duplicate (ignoring punctuation/case)
    const normalized = para.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length >= 20) {
      if (seenNormalized.has(normalized)) {
        continue;
      }
      seenNormalized.add(normalized);
    }

    uniqueParagraphs.push(para);
  }

  // 6. Join preserving clean paragraph boundaries
  let text = uniqueParagraphs.join('\n\n').trim();

  // 7. Cap text at ~12,000 characters cleanly
  if (text.length > MAX_TEXT_LENGTH) {
    const truncated = text.slice(0, MAX_TEXT_LENGTH);
    const lastBoundary = Math.max(
      truncated.lastIndexOf('\n\n'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf(' ')
    );
    text = (lastBoundary > MAX_TEXT_LENGTH * 0.8 ? truncated.slice(0, lastBoundary) : truncated).trim();
  }

  return text;
}

/**
 * Extracts title from <title>, OG tags, Twitter tags, or <h1>.
 *
 * @param {cheerio.CheerioAPI} $
 * @returns {string} Clean title or fallback
 */
function extractTitle($) {
  let title = $('title').first().text().trim();

  if (!title) {
    title = $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') ||
            $('h1').first().text().trim() ||
            'Untitled Page';
  }

  // Clean title: collapse extra spaces and newlines
  title = title.replace(/\s+/g, ' ').trim();
  return title || 'Untitled Page';
}

/**
 * Main extraction function for an HTML document.
 *
 * @param {string} html
 * @returns {{ title: string, text: string, detectedDate: string|null }}
 */
function extractContent(html) {
  const $ = cheerio.load(html);

  // Extract date before removing any metadata or time elements
  const detectedDate = extractDate($);
  const title = extractTitle($);
  const text = extractReadableContent($);

  return {
    title,
    text,
    detectedDate
  };
}

module.exports = {
  extractContent,
  extractTitle,
  extractDate,
  extractReadableContent,
  parseAndValidateDate
};
