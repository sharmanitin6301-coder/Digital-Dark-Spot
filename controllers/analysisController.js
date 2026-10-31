const { generateAnalysis } = require('../services/geminiService');
const { verifyAllEvidence } = require('../services/evidenceVerifier');

/**
 * Handles POST /api/analyze.
 * Coordinates Gemini structured analysis, server-side evidence verification,
 * and error handling.
 */
async function handleAnalyze(req, res) {
  try {
    const { question, sources } = req.body;

    // Filter successful sources for Gemini analysis
    const validSources = sources.filter(
      (s) => s.fetchStatus === 'success' && typeof s.text === 'string' && s.text.trim().length >= 50
    );

    if (validSources.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Some sources could not be accessed. Review their status.'
      });
    }

    // Call Gemini to generate structured analysis
    const { rawAnalysis, modelUsed, isFallback } = await generateAnalysis(question, validSources);

    // Server-side evidence verification against supplied source texts
    const { verifiedAnalysis, stats } = verifyAllEvidence(rawAnalysis, validSources);

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
      model: modelUsed,
      model_used: modelUsed,
      is_fallback: Boolean(isFallback || modelUsed !== (process.env.GEMINI_MODEL || 'gemini-3.8-flash')),
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
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'An error occurred while analyzing sources.'
    });
  }
}

module.exports = {
  handleAnalyze
};
