const { GoogleGenAI, Type } = require('@google/genai');

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.6-flash';

// Controlled backoff configuration for transient rate limits and temporary service unavailability.
// Note: Actual rate limits (RPM, RPD, TPM) depend on the project's Google AI Studio
// tier (e.g. Free Tier vs Pay-as-you-go), model ID, and region.
const BACKOFF_CONFIG = {
  maxRetries: 2,          // Up to 2 retries (total 3 attempts)
  initialDelayMs: 1200,   // Initial backoff delay
  backoffFactor: 2.0      // Exponential factor (1.2s, 2.4s)
};

const SYSTEM_INSTRUCTION = `You are an information gap detection analyst.

Use ONLY the source contents supplied in the request.

Never invent facts, sources, quotations, dates, statistics or claims.

Distinguish explicitly between:
1. Information directly supported by sources.
2. Potential information gaps.
3. Potential contradictions.
4. Possible outdated information.
5. AI-generated suggestions.
6. Uncertainty.

Every factual claim must reference a valid source ID and contain a short verbatim evidence snippet of at most 25 words.

For missing information, do not invent evidence. Explain which sources were reviewed and what information appears to be missing.

If sources do not provide sufficient evidence, explicitly communicate uncertainty.

Do not treat a missing detail as proof that the information does not exist elsewhere.

Never describe a potential gap or conflict as a confirmed fact.`;

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.ARRAY,
      description: 'Key factual points directly supported by the sources',
      items: {
        type: Type.OBJECT,
        properties: {
          point: { type: Type.STRING, description: 'Summary statement' },
          source_id: { type: Type.STRING, description: 'Source ID such as S1 or S2' },
          evidence: { type: Type.STRING, description: 'Verbatim evidence snippet of at most 25 words' }
        },
        required: ['point', 'source_id', 'evidence']
      }
    },
    gaps: {
      type: Type.ARRAY,
      description: 'Potential missing information or coverage gaps',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title describing the potential gap' },
          why_it_matters: { type: Type.STRING, description: 'Why this missing information matters to the user' },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          sources_reviewed: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of source IDs reviewed for this topic'
          },
          evidence: {
            type: Type.ARRAY,
            description: 'Related snippets found in sources showing what was covered or absent',
            items: {
              type: Type.OBJECT,
              properties: {
                source_id: { type: Type.STRING },
                snippet: { type: Type.STRING, description: 'Verbatim relevant snippet of at most 25 words' }
              },
              required: ['source_id', 'snippet']
            }
          }
        },
        required: ['title', 'why_it_matters', 'priority', 'sources_reviewed', 'evidence']
      }
    },
    conflicts: {
      type: Type.ARRAY,
      description: 'Potential contradictions or discrepancies between sources',
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: 'Topic where the conflict arises' },
          claim_a: {
            type: Type.OBJECT,
            properties: {
              claim: { type: Type.STRING, description: 'First claim' },
              source_id: { type: Type.STRING, description: 'Source ID for claim A' },
              evidence: { type: Type.STRING, description: 'Verbatim evidence snippet of at most 25 words' }
            },
            required: ['claim', 'source_id', 'evidence']
          },
          claim_b: {
            type: Type.OBJECT,
            properties: {
              claim: { type: Type.STRING, description: 'Second claim' },
              source_id: { type: Type.STRING, description: 'Source ID for claim B' },
              evidence: { type: Type.STRING, description: 'Verbatim evidence snippet of at most 25 words' }
            },
            required: ['claim', 'source_id', 'evidence']
          }
        },
        required: ['topic', 'claim_a', 'claim_b']
      }
    },
    outdated: {
      type: Type.ARRAY,
      description: 'Potentially outdated claims based on dates or timeline discrepancies',
      items: {
        type: Type.OBJECT,
        properties: {
          signal: { type: Type.STRING, description: 'Signal or indicator that information may be outdated' },
          source_id: { type: Type.STRING, description: 'Source ID' },
          detected_date: { type: Type.STRING, description: 'Publication or update date, or null/empty if none' },
          reason: { type: Type.STRING, description: 'Why this information needs freshness verification' },
          evidence: { type: Type.STRING, description: 'Verbatim evidence or empty string' }
        },
        required: ['signal', 'source_id', 'reason', 'evidence']
      }
    },
    unanswered_questions: {
      type: Type.ARRAY,
      description: 'Relevant questions left unanswered by the supplied sources',
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: 'Question that remains unanswered' },
          why_it_matters: { type: Type.STRING, description: 'Why this question matters' },
          related_sources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Related source IDs'
          }
        },
        required: ['question', 'why_it_matters', 'related_sources']
      }
    },
    checklist: {
      type: Type.ARRAY,
      description: 'Next steps and verification checklist',
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING, description: 'What to verify next' },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          reason: { type: Type.STRING, description: 'Why verification is important' },
          verify_at: { type: Type.STRING, description: 'Suggested authority or primary source to verify with' },
          related_sources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Related source IDs'
          }
        },
        required: ['item', 'priority', 'reason', 'verify_at', 'related_sources']
      }
    },
    overall_confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
      description: 'Overall confidence assessment'
    },
    confidence_note: {
      type: Type.STRING,
      description: 'Explanation of limitations, coverage, and uncertainty'
    }
  },
  required: [
    'summary',
    'gaps',
    'conflicts',
    'outdated',
    'unanswered_questions',
    'checklist',
    'overall_confidence',
    'confidence_note'
  ]
};

/**
 * Returns a configured GoogleGenAI instance or throws a friendly configuration error.
 *
 * @returns {GoogleGenAI}
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const error = new Error('AI analysis is temporarily unavailable. Please check the server configuration.');
    error.status = 500;
    error.isConfigError = true;
    throw error;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Builds user prompt string containing the user question and sanitized source text.
 *
 * @param {string} question
 * @param {Array<{ id: string, url: string, title?: string, text: string, detectedDate?: string|null }>} sources
 * @returns {string}
 */
function buildUserPrompt(question, sources) {
  const formattedSources = sources.map((src) => {
    return [
      `[Source ID: ${src.id}]`,
      `Title: ${src.title || 'Untitled'}`,
      `URL: ${src.url}`,
      `Publication/Update Date: ${src.detectedDate || 'Not detected'}`,
      `Content:`,
      src.text.trim()
    ].join('\n');
  }).join('\n\n---\n\n');

  return [
    `User Question:`,
    question.trim(),
    ``,
    `Supplied Sources for Analysis:`,
    `==============================`,
    formattedSources,
    `==============================`,
    ``,
    `Instructions:`,
    `Analyze ONLY the supplied sources above to answer the user question.`,
    `Identify verified points, potential gaps, contradictions, outdated signals, unanswered questions, and a prioritized verification checklist.`,
    `Every claim must reference an exact source ID (e.g. S1, S2) and provide a verbatim evidence snippet of at most 25 words.`,
    `Return the findings strictly in the specified JSON schema.`
  ].join('\n');
}

/**
 * Classifies Gemini SDK errors into categorized descriptors.
 * Note: Actual rate limits (RPM, RPD, TPM) depend on the project's Google AI Studio
 * tier (e.g. Free Tier vs Pay-as-you-go), model ID, and region. There is no universal 20 requests/day limit.
 *
 * @param {Error|any} err
 * @returns {{ type: string, status: number, message: string }}
 */
function classifyGeminiError(err) {
  if (err && err.isConfigError) {
    return { type: 'CONFIG', status: err.status || 500, message: err.message };
  }

  const status = err.status || (err.error && err.error.code);
  const msg = (err.message || '').toLowerCase();
  const rawDetails = JSON.stringify(err.error || err.details || '').toLowerCase();

  // 1. Authentication & Permission Errors (401 / 403)
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied') ||
    msg.includes('unregistered')
  ) {
    return {
      type: 'AUTH',
      status: 401,
      message: 'AI analysis is temporarily unavailable. Please check the server configuration.'
    };
  }

  // 2. Quota & Rate Limit Errors (429 / RESOURCE_EXHAUSTED)
  if (status === 429 || msg.includes('resource_exhausted') || msg.includes('quota')) {
    // Check if error specifies daily or project quota exhaustion (e.g. requests per day limit reached)
    const isDailyOrProjectQuota =
      msg.includes('per day') ||
      msg.includes('requests per day') ||
      msg.includes('generaterequestsperday') ||
      msg.includes('daily limit') ||
      rawDetails.includes('generaterequestsperday') ||
      rawDetails.includes('free_tier_requests') ||
      rawDetails.includes('quota exceeded for metric') ||
      (msg.includes('exceeded your current quota') && msg.includes('retry in') && !msg.includes('retry in 0.'));

    if (isDailyOrProjectQuota) {
      return {
        type: 'QUOTA_EXHAUSTED',
        status: 429,
        message: 'The Gemini API daily quota has been reached for this project and tier. Quota limits depend on your Google AI Studio plan, model allocation, and billing tier. Please check your Google AI Studio quota settings or explore the offline Sample Demo.'
      };
    }

    // Otherwise it is a temporary burst / RPM rate limit
    return {
      type: 'RATE_LIMIT_TEMPORARY',
      status: 429,
      message: 'The AI service is experiencing high request volume. Please wait a moment and try again.'
    };
  }

  // 3. Service Unavailable / Overloaded (503)
  if (status === 503 || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('overloaded')) {
    return {
      type: 'SERVICE_UNAVAILABLE',
      status: 503,
      message: 'The Gemini service is temporarily busy due to high demand. Please try again in a few moments.'
    };
  }

  // 4. Timeout
  if (err.name === 'TimeoutError' || msg.includes('timeout') || err.code === 'ECONNRESET') {
    return {
      type: 'TIMEOUT',
      status: 504,
      message: 'Network timeout occurred while communicating with the Gemini API.'
    };
  }

  // 5. Invalid JSON structure from model
  if (err.status === 502 || msg.includes('invalid json')) {
    return {
      type: 'INVALID_JSON',
      status: 502,
      message: 'Gemini returned an invalid JSON response structure.'
    };
  }

  return {
    type: 'UNKNOWN',
    status: 500,
    message: 'An error occurred while generating analysis with Google Gemini.'
  };
}

/**
 * Executes a Gemini model call with controlled exponential backoff for transient errors
 * (temporary rate limiting and 503 service unavailable).
 * Stops immediately on 401/403 auth errors and 429 daily quota exhaustion.
 *
 * @param {Function} fn
 * @param {string} modelName
 * @returns {Promise<any>}
 */
async function executeWithBackoff(fn, modelName) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const errInfo = classifyGeminiError(err);

      // Stop immediately on Auth or Daily Quota Exhaustion - no point retrying the same condition
      if (errInfo.type === 'AUTH' || errInfo.type === 'QUOTA_EXHAUSTED') {
        const error = new Error(errInfo.message);
        error.status = errInfo.status;
        error.errorType = errInfo.type;
        throw error;
      }

      // Retry on temporary rate limit or 503 service unavailable
      const isRetryable =
        errInfo.type === 'RATE_LIMIT_TEMPORARY' ||
        errInfo.type === 'SERVICE_UNAVAILABLE';

      if (isRetryable && attempt < BACKOFF_CONFIG.maxRetries) {
        const delay = BACKOFF_CONFIG.initialDelayMs * Math.pow(BACKOFF_CONFIG.backoffFactor, attempt);
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Exceeded max retries or non-retryable error
      const error = new Error(errInfo.message);
      error.status = errInfo.status;
      error.errorType = errInfo.type;
      throw error;
    }
  }
}

/**
 * Calls Gemini with schema constraints. Attempts primary model first (gemini-3.8-flash).
 * If primary model encounters quota exhaustion, persistent 503 high demand after backoff,
 * or model unavailability (404), seamlessly falls back to the verified stable model (gemini-3.6-flash).
 * Stops immediately without retrying or fallback if an authentication error (401/403) occurs.
 *
 * @param {string} question
 * @param {Array<{ id: string, url: string, title?: string, text: string, detectedDate?: string|null }>} validSources
 * @returns {Promise<{ rawAnalysis: object, modelUsed: string, isFallback: boolean }>}
 */
async function generateAnalysis(question, validSources) {
  const ai = getGeminiClient();
  const prompt = buildUserPrompt(question, validSources);

  const callModel = async (modelName) => {
    return await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA,
        temperature: 0.2 // Low temperature for high factual precision
      }
    });
  };

  let response;
  let modelUsed = PRIMARY_MODEL;
  let isFallback = false;

  try {
    response = await executeWithBackoff(() => callModel(PRIMARY_MODEL), PRIMARY_MODEL);
  } catch (primaryErr) {
    // 401/403 Authentication/permission error: Never retry another model automatically
    if (primaryErr.status === 401 || primaryErr.errorType === 'AUTH') {
      throw primaryErr;
    }

    // If primary model failed due to Quota Exhaustion (RPD limit reached on primary model)
    // or persisted 503 high demand after retries, or 404:
    // Fallback to gemini-3.6-flash
    const shouldFallback =
      primaryErr.errorType === 'QUOTA_EXHAUSTED' ||
      primaryErr.errorType === 'SERVICE_UNAVAILABLE' ||
      primaryErr.status === 404;

    if (shouldFallback) {
      try {
        response = await executeWithBackoff(() => callModel(FALLBACK_MODEL), FALLBACK_MODEL);
        modelUsed = FALLBACK_MODEL;
        isFallback = true;
      } catch (fallbackErr) {
        // Fallback model also failed - throw clear categorized error
        throw fallbackErr;
      }
    } else {
      // Primary model failed with temporary rate limit after retries, timeout, etc.
      throw primaryErr;
    }
  }

  // Parse JSON response with single retry for malformed output
  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch (parseErr) {
    // Retry once only
    try {
      const retryResponse = await callModel(modelUsed);
      parsed = JSON.parse(retryResponse.text);
    } catch {
      const error = new Error('Gemini returned an invalid JSON response structure.');
      error.status = 502;
      throw error;
    }
  }

  return {
    rawAnalysis: parsed,
    modelUsed,
    isFallback
  };
}

/**
 * Classifies Gemini SDK errors into clear, friendly client messages without exposing keys or stack traces.
 *
 * @param {Error|any} err
 * @returns {Error}
 */
function formatGeminiError(err) {
  const classified = classifyGeminiError(err);
  const formatted = new Error(classified.message);
  formatted.status = classified.status;
  formatted.errorType = classified.type;
  return formatted;
}

module.exports = {
  getGeminiClient,
  generateAnalysis,
  classifyGeminiError,
  executeWithBackoff,
  formatGeminiError,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  BACKOFF_CONFIG,
  SYSTEM_INSTRUCTION,
  ANALYSIS_SCHEMA
};
