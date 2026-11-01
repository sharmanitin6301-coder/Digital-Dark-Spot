const { generateAnalysis } = require('../services/geminiService');
const { generateGroqAnalysis } = require('../services/groqService');
const { verifyAllEvidence } = require('../services/evidenceVerifier');

/**
 * Handles POST /api/analyze.
 * Coordinates primary (Gemini) and fallback (Groq API) structured analysis,
 * server-side evidence verification, and categorized error handling.
 */
async function handleAnalyze(req, res) {
  try {
    const { question, sources } = req.body;
    console.log(`[Analyze] Received request: question="${question ? question.slice(0, 60) : ''}...", total sources=${sources ? sources.length : 0}`);

    // Filter successful sources for AI analysis
    const validSources = sources.filter(
      (s) => s.fetchStatus === 'success' && typeof s.text === 'string' && s.text.trim().length >= 50
    );

    console.log(`[Analyze] Usable sources for cross-examination: ${validSources.length}/${sources ? sources.length : 0}`);

    if (validSources.length < 2) {
      console.warn(`[Analyze] Rejected: insufficient usable sources (${validSources.length} < 2)`);
      return res.status(400).json({
        success: false,
        error: 'Some sources could not be accessed. Review their status.'
      });
    }

    let rawAnalysis;
    let modelUsed;
    let isFallback = false;
    let providerUsed = 'gemini';

    // 1. Primary AI Provider: Google Gemini
    console.log(`[Analyze] Invoking primary provider (Google Gemini) with ${validSources.length} sources...`);
    try {
      const geminiResult = await generateAnalysis(question, validSources);
      rawAnalysis = geminiResult.rawAnalysis;
      modelUsed = geminiResult.modelUsed;
      isFallback = geminiResult.isFallback;
      providerUsed = 'gemini';
      console.log(`[Analyze] Gemini analysis succeeded with model: ${modelUsed} (isFallback: ${isFallback})`);
    } catch (geminiError) {
      console.warn(`[Analyze] Primary provider (Gemini) failed: status=${geminiError.status}, type=${geminiError.errorType || 'unknown'}, message=${geminiError.message}`);

      // Detect normalized Gemini quota / rate-limit errors from numeric/string status, errorType, or message
      const normalizedStatus =
        Number(geminiError.status) ||
        Number(geminiError.statusCode) ||
        (geminiError.response && Number(geminiError.response.status)) ||
        (geminiError.error && Number(geminiError.error.status || geminiError.error.code)) ||
        null;

      const rawMsg = (geminiError.message || '').toLowerCase();
      const isQuotaMessage =
        rawMsg.includes('quota') ||
        rawMsg.includes('resource_exhausted') ||
        rawMsg.includes('rate limit') ||
        rawMsg.includes('429') ||
        rawMsg.includes('too many requests');

      const isQuotaOrRateLimit =
        normalizedStatus === 429 ||
        geminiError.errorType === 'QUOTA_EXHAUSTED' ||
        geminiError.errorType === 'RATE_LIMIT_TEMPORARY' ||
        isQuotaMessage;

      if (!isQuotaOrRateLimit) {
        console.warn(`[Analyze] Non-quota error from Gemini (status ${geminiError.status}). Skipping Groq API fallback.`);
        throw geminiError;
      }

      console.log(`[Analyze] Gemini quota exhausted (HTTP 429). Attempting fallback to secondary provider (Groq API)...`);

      // 2. Secondary AI Provider: Groq API Fallback
      try {
        const groqResult = await generateGroqAnalysis(question, validSources);
        rawAnalysis = groqResult.rawAnalysis;
        modelUsed = groqResult.modelUsed;
        isFallback = true;
        providerUsed = 'groq';
        console.log(`[Analyze] Groq API fallback succeeded with model: ${modelUsed}`);
      } catch (groqError) {
        console.error(`[Analyze] Groq fallback failed: status=${groqError.status}, message=${groqError.message}`);

        // Requirement 8: Never return mock, cached, or fabricated results if both providers fail.
        let combinedMsg = 'The Gemini API quota has been reached, and the secondary AI provider (Groq API) is currently unavailable.';
        if (groqError.status === 401 || groqError.status === 403) {
          combinedMsg = 'Gemini quota exhausted (HTTP 429). Groq API fallback authentication failed. Please check GROQ_API_KEY configuration.';
        } else if (groqError.status === 429) {
          combinedMsg = 'Both primary (Gemini) and secondary (Groq API) AI service quotas have been exhausted. Please try again shortly or explore the offline Sample Demo.';
        } else if (groqError.isConfigError) {
          combinedMsg = 'The Gemini API daily quota has been reached for this project and tier, and secondary fallback (GROQ_API_KEY) is not configured. Please check your Google AI Studio quota or explore the offline Sample Demo.';
        } else if (groqError.message) {
          combinedMsg = `Gemini quota exhausted (HTTP 429). Secondary AI fallback (Groq API) error: ${groqError.message}`;
        }

        const combinedError = new Error(combinedMsg);
        combinedError.status = groqError.status || 502;
        throw combinedError;
      }
    }

    // 3. Server-side evidence verification against supplied source texts
    const { verifiedAnalysis, stats } = verifyAllEvidence(rawAnalysis, validSources);
    console.log(`[Analyze] Evidence verification complete (${providerUsed}/${modelUsed}): ${stats.verifiedCount}/${stats.totalChecked} verified (${stats.verificationRate})`);

    // Preserve all sources with failure information in the final response
    const sourcesSummary = sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title || null,
      detectedDate: s.detectedDate || null,
      text: s.text || null,
      fetchStatus: s.fetchStatus,
      error: s.error || null
    }));

    return res.json({
      success: true,
      question: question.trim(),
      provider: providerUsed,
      provider_used: providerUsed,
      model: modelUsed,
      model_used: modelUsed,
      is_fallback: Boolean(isFallback || providerUsed === 'groq' || modelUsed !== (process.env.GEMINI_MODEL || 'gemini-3.8-flash')),
      summary: verifiedAnalysis.summary,
      gaps: verifiedAnalysis.gaps,
      conflicts: verifiedAnalysis.conflicts,
      outdated: verifiedAnalysis.outdated,
      unanswered_questions: verifiedAnalysis.unanswered_questions,
      checklist: verifiedAnalysis.checklist,
      overall_confidence: verifiedAnalysis.overall_confidence,
      confidence_note: verifiedAnalysis.confidence_note,
      evidence_verification: stats,
      sources: sourcesSummary
    });
  } catch (error) {
    const statusCode = error.status || 500;
    console.error(`[Analyze] Error (HTTP ${statusCode}): ${error.message}`);
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'An error occurred while analyzing sources.'
    });
  }
}

module.exports = {
  handleAnalyze
};
