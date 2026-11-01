/**
 * Groq AI Fallback Service
 *
 * Provides secondary AI analysis using the official Groq API (https://api.groq.com/openai/v1/chat/completions).
 * Called ONLY when primary provider (Gemini) encounters HTTP 429 quota exhaustion or rate limits.
 */

const { SYSTEM_INSTRUCTION, buildUserPrompt } = require('./geminiService');

const DEFAULT_GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

function getGroqApiUrl() {
  if (process.env.GROQ_BASE_URL && process.env.GROQ_BASE_URL !== 'undefined') {
    return `${process.env.GROQ_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  }
  return DEFAULT_GROQ_ENDPOINT;
}

const GROQ_SYSTEM_INSTRUCTION = `${SYSTEM_INSTRUCTION}

CRITICAL OUTPUT FORMAT REQUIREMENT:
You must return ONLY a single, valid JSON object with NO preamble, NO conversational text, and NO markdown wrappers.
The JSON object must strictly match this exact schema:
{
  "summary": [
    {
      "point": "Factual statement directly supported by source",
      "source_id": "S1",
      "evidence": "Verbatim evidence snippet of at most 25 words"
    }
  ],
  "gaps": [
    {
      "title": "Title describing potential gap",
      "why_it_matters": "Why this missing information matters to user",
      "priority": "high" | "medium" | "low",
      "sources_reviewed": ["S1", "S2"],
      "evidence": [
        {
          "source_id": "S1",
          "snippet": "Verbatim relevant snippet of at most 25 words"
        }
      ]
    }
  ],
  "conflicts": [
    {
      "topic": "Topic where conflict arises",
      "claim_a": {
        "claim": "First claim",
        "source_id": "S1",
        "evidence": "Verbatim evidence snippet of at most 25 words"
      },
      "claim_b": {
        "claim": "Second claim",
        "source_id": "S2",
        "evidence": "Verbatim evidence snippet of at most 25 words"
      }
    }
  ],
  "outdated": [
    {
      "signal": "Indicator that information may be outdated",
      "source_id": "S1",
      "detected_date": "Publication or update date, or null",
      "reason": "Why freshness verification is needed",
      "evidence": "Verbatim evidence or empty string"
    }
  ],
  "unanswered_questions": [
    {
      "question": "Question that remains unanswered",
      "why_it_matters": "Why this question matters",
      "related_sources": ["S1", "S2"]
    }
  ],
  "checklist": [
    {
      "item": "What to verify next",
      "priority": "high" | "medium" | "low",
      "reason": "Why verification is important",
      "verify_at": "Suggested authority or primary source",
      "related_sources": ["S1", "S2"]
    }
  ],
  "overall_confidence": "high" | "medium" | "low",
  "confidence_note": "Explanation of limitations, coverage, and uncertainty"
}`;

/**
 * Validates that data returned from Groq conforms to the required schema.
 *
 * @param {any} data
 * @returns {object}
 */
function validateGroqSchema(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const err = new Error('Groq response is not a valid JSON object.');
    err.status = 502;
    throw err;
  }

  const requiredArrays = ['summary', 'gaps', 'conflicts', 'outdated', 'unanswered_questions', 'checklist'];
  for (const field of requiredArrays) {
    if (!Array.isArray(data[field])) {
      if (data[field] === undefined || data[field] === null) {
        data[field] = [];
      } else {
        const err = new Error(`Groq response property "${field}" must be an array.`);
        err.status = 502;
        throw err;
      }
    }
  }

  const validConfidence = ['high', 'medium', 'low'];
  if (!data.overall_confidence || !validConfidence.includes(String(data.overall_confidence).toLowerCase())) {
    data.overall_confidence = 'medium';
  } else {
    data.overall_confidence = String(data.overall_confidence).toLowerCase();
  }

  if (typeof data.confidence_note !== 'string' || !data.confidence_note.trim()) {
    data.confidence_note = 'Confidence reflects agreement and coverage across submitted sources.';
  }

  return data;
}

/**
 * Invokes Groq API to generate cross-examination structured analysis.
 *
 * @param {string} question
 * @param {Array<{ id: string, url: string, title?: string, text: string, detectedDate?: string|null }>} validSources
 * @param {string} [modelOverride]
 * @returns {Promise<{ rawAnalysis: object, modelUsed: string, providerUsed: string }>}
 */
async function generateGroqAnalysis(question, validSources, modelOverride) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const error = new Error('Groq fallback is not configured. GROQ_API_KEY environment variable is not set.');
    error.status = 503;
    error.provider = 'groq';
    error.isConfigError = true;
    throw error;
  }

  const modelUsed = modelOverride || DEFAULT_GROQ_MODEL;
  const userPrompt = buildUserPrompt(question, validSources);

  console.log(`[Groq] Requesting completion with model ${modelUsed}...`);

  const requestBody = {
    model: modelUsed,
    messages: [
      {
        role: 'system',
        content: GROQ_SYSTEM_INSTRUCTION
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  let res;
  try {
    const apiUrl = getGroqApiUrl();
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(requestBody)
    });
  } catch (netErr) {
    console.error(`[Groq] Network request failed:`, netErr.message);
    const err = new Error(`Network failure communicating with Groq API: ${netErr.message}`);
    err.status = 504;
    err.provider = 'groq';
    throw err;
  }

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const rawErrMsg = errJson.error ? (errJson.error.message || errJson.error) : res.statusText;
    console.warn(`[Groq] API returned error HTTP ${res.status}:`, rawErrMsg);

    let clientMsg = `Groq API error (HTTP ${res.status}): ${rawErrMsg || 'Request failed'}`;
    let statusCode = res.status;

    if (res.status === 401 || res.status === 403) {
      clientMsg = 'Groq API authentication failed. Please check GROQ_API_KEY configuration.';
      statusCode = 401;
    } else if (res.status === 429) {
      clientMsg = 'The Groq API quota or rate limit has been reached.';
      statusCode = 429;
    }

    const error = new Error(clientMsg);
    error.status = statusCode;
    error.provider = 'groq';
    throw error;
  }

  const resData = await res.json().catch(() => ({}));
  const content = resData.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string' || !content.trim()) {
    const err = new Error('Groq returned an empty response.');
    err.status = 502;
    err.provider = 'groq';
    throw err;
  }

  // Strip markdown code fences if present (e.g. ```json ... ```)
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error(`[Groq] JSON parse failure:`, parseErr.message, 'Raw content sample:', cleaned.slice(0, 100));
    const err = new Error('Groq returned an invalid JSON response structure.');
    err.status = 502;
    err.provider = 'groq';
    throw err;
  }

  const validated = validateGroqSchema(parsed);
  console.log(`[Groq] Analysis successfully generated with model: ${modelUsed}`);

  return {
    rawAnalysis: validated,
    modelUsed,
    providerUsed: 'groq'
  };
}

module.exports = {
  generateGroqAnalysis,
  validateGroqSchema,
  GROQ_SYSTEM_INSTRUCTION,
  DEFAULT_GROQ_MODEL,
  getGroqApiUrl
};
