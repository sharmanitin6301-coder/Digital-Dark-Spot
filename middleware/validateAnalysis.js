const MAX_TEXT_LENGTH = 12000;

/**
 * Middleware to validate POST /api/analyze requests.
 * Validates:
 * - Question is non-empty.
 * - Sources array has 2 to 5 records.
 * - Each source has a valid ID and URL.
 * - At least one source has fetchStatus === 'success' with text content.
 * - Text does not exceed 12,000 characters (truncates if slightly over).
 */
function validateAnalysisMiddleware(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body. Expected JSON object with "question" and "sources".'
    });
  }

  const { question, sources } = req.body;

  // 1. Validate question
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a research question.'
    });
  }

  if (question.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      error: 'Question exceeds maximum allowed length of 1,000 characters.'
    });
  }

  // 2. Validate sources array structure
  if (!Array.isArray(sources)) {
    return res.status(400).json({
      success: false,
      error: 'Add at least two valid sources to continue.'
    });
  }

  if (sources.length < 2 || sources.length > 5) {
    return res.status(400).json({
      success: false,
      error: 'Add at least two valid sources to continue.'
    });
  }

  // 3. Validate each source record
  let successfulSourceCount = 0;
  const failedSources = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const pos = i + 1;

    if (!src || typeof src !== 'object') {
      return res.status(400).json({
        success: false,
        error: `Source record at index ${i} (position ${pos}) must be an object.`
      });
    }

    if (typeof src.id !== 'string' || !src.id.trim()) {
      return res.status(400).json({
        success: false,
        error: `Source record at index ${i} (position ${pos}) must include a non-empty "id" string (e.g. "S${pos}").`
      });
    }

    if (typeof src.url !== 'string' || !src.url.trim()) {
      return res.status(400).json({
        success: false,
        error: `Source record at index ${i} (position ${pos}) must include a valid "url" string.`
      });
    }

    if (src.fetchStatus === 'success') {
      if (typeof src.text === 'string' && src.text.trim().length >= 50) {
        successfulSourceCount++;
        // Respect per-source text limit
        if (src.text.length > MAX_TEXT_LENGTH) {
          src.text = src.text.slice(0, MAX_TEXT_LENGTH).trim();
        }
      } else {
        failedSources.push(src.id || `S${pos}`);
      }
    } else {
      failedSources.push(src.id || `S${pos}`);
    }
  }

  // 4. Require at least two usable sources before cross-examination
  if (successfulSourceCount < 2) {
    return res.status(400).json({
      success: false,
      error: 'Some sources could not be accessed. Review their status.',
      failedSources,
      successfulCount: successfulSourceCount
    });
  }

  next();
}

module.exports = {
  validateAnalysisMiddleware
};
