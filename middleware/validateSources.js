/**
 * Middleware to validate incoming POST /api/fetch-sources request bodies.
 * Ensures the payload has 2 to 5 sources, each having a valid URL string.
 */
function validateSourcesMiddleware(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body. Expected JSON object with a "sources" array.'
    });
  }

  const { sources } = req.body;

  if (!Array.isArray(sources)) {
    return res.status(400).json({
      success: false,
      error: 'Field "sources" must be an array of objects containing a "url" property.'
    });
  }

  if (sources.length < 1 || sources.length > 5) {
    return res.status(400).json({
      success: false,
      error: `Invalid number of sources. Expected between 1 and 5 sources, but received ${sources.length}.`
    });
  }

  const seenUrls = new Set();

  for (let i = 0; i < sources.length; i++) {
    const item = sources[i];
    const pos = i + 1;

    if (!item || typeof item !== 'object') {
      return res.status(400).json({
        success: false,
        error: `Source at index ${i} (position ${pos}) must be an object.`
      });
    }

    if (typeof item.url !== 'string' || !item.url.trim()) {
      return res.status(400).json({
        success: false,
        error: `Source at index ${i} (position ${pos}) is missing a valid 'url' string.`
      });
    }

    const trimmedUrl = item.url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        error: `Source at index ${i} (position ${pos}) must use http:// or https:// protocol.`
      });
    }

    try {
      new URL(trimmedUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: `Source at index ${i} (position ${pos}) has an invalid URL format.`
      });
    }

    const normalized = trimmedUrl.toLowerCase().replace(/\/+$/, '');
    if (seenUrls.has(normalized)) {
      return res.status(400).json({
        success: false,
        error: `Duplicate source URL detected: "${trimmedUrl}". Each source URL must be unique.`
      });
    }
    seenUrls.add(normalized);
  }

  next();
}

module.exports = {
  validateSourcesMiddleware
};
