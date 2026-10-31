/**
 * Normalizes text for comparison without altering evidence meaning.
 * Collapses multiple whitespaces, normalizes smart quotes and dashes, and lowercases.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeForComparison(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Counts words in a string.
 *
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Verifies that a quote snippet:
 * 1. References a valid source ID.
 * 2. Does not exceed 25 words.
 * 3. Actually occurs verbatim in the corresponding source text.
 *
 * @param {string} sourceId
 * @param {string} snippet
 * @param {Map<string, { url: string, title: string, normalizedText: string }>} sourceMap
 * @returns {{ verified: boolean, status: string, word_count: number }}
 */
function verifyEvidenceSnippet(sourceId, snippet, sourceMap) {
  if (!sourceId || !sourceMap.has(sourceId)) {
    return {
      verified: false,
      status: 'invalid source reference',
      word_count: countWords(snippet)
    };
  }

  if (!snippet || typeof snippet !== 'string' || !snippet.trim()) {
    return {
      verified: true,
      status: 'empty snippet',
      word_count: 0
    };
  }

  const words = countWords(snippet);
  if (words > 25) {
    return {
      verified: false,
      status: 'unverified quote (exceeds 25 words)',
      word_count: words
    };
  }

  const normSource = sourceMap.get(sourceId).normalizedText;
  const normSnippet = normalizeForComparison(snippet);

  if (normSource.includes(normSnippet)) {
    return {
      verified: true,
      status: 'verified',
      word_count: words
    };
  }

  return {
    verified: false,
    status: 'unverified quote',
    word_count: words
  };
}

/**
 * Traverses and verifies all evidence snippets and source references in the Gemini analysis JSON.
 *
 * @param {object} analysis
 * @param {Array<{ id: string, url: string, title?: string, text: string }>} suppliedSources
 * @returns {{ verifiedAnalysis: object, stats: { totalChecked: number, verifiedCount: number, unverifiedCount: number, invalidSourceCount: number } }}
 */
function verifyAllEvidence(analysis, suppliedSources) {
  const sourceMap = new Map();
  for (const src of suppliedSources) {
    sourceMap.set(src.id, {
      url: src.url,
      title: src.title || '',
      normalizedText: normalizeForComparison(src.text)
    });
  }

  let totalChecked = 0;
  let verifiedCount = 0;
  let unverifiedCount = 0;
  let invalidSourceCount = 0;

  function trackResult(res) {
    totalChecked++;
    if (res.status === 'invalid source reference') {
      invalidSourceCount++;
    } else if (res.verified) {
      verifiedCount++;
    } else {
      unverifiedCount++;
    }
  }

  // 1. Verify summary points
  if (Array.isArray(analysis.summary)) {
    for (const item of analysis.summary) {
      const v = verifyEvidenceSnippet(item.source_id, item.evidence, sourceMap);
      trackResult(v);
      item.verification = v;
      if (!v.verified) {
        item.verification_note = v.status; // e.g. "unverified quote" or "invalid source reference"
      }
    }
  }

  // 2. Verify gaps evidence and sources_reviewed
  if (Array.isArray(analysis.gaps)) {
    for (const gap of analysis.gaps) {
      if (Array.isArray(gap.sources_reviewed)) {
        gap.sources_reviewed_valid = gap.sources_reviewed.every((id) => sourceMap.has(id));
      }
      if (Array.isArray(gap.evidence)) {
        for (const ev of gap.evidence) {
          const v = verifyEvidenceSnippet(ev.source_id, ev.snippet, sourceMap);
          trackResult(v);
          ev.verification = v;
          if (!v.verified) {
            ev.verification_note = v.status;
          }
        }
      }
    }
  }

  // 3. Verify conflicts
  if (Array.isArray(analysis.conflicts)) {
    for (const conflict of analysis.conflicts) {
      if (conflict.claim_a) {
        const vA = verifyEvidenceSnippet(conflict.claim_a.source_id, conflict.claim_a.evidence, sourceMap);
        trackResult(vA);
        conflict.claim_a.verification = vA;
        if (!vA.verified) conflict.claim_a.verification_note = vA.status;
      }
      if (conflict.claim_b) {
        const vB = verifyEvidenceSnippet(conflict.claim_b.source_id, conflict.claim_b.evidence, sourceMap);
        trackResult(vB);
        conflict.claim_b.verification = vB;
        if (!vB.verified) conflict.claim_b.verification_note = vB.status;
      }
    }
  }

  // 4. Verify outdated signals
  if (Array.isArray(analysis.outdated)) {
    for (const item of analysis.outdated) {
      if (item.evidence && item.evidence.trim()) {
        const v = verifyEvidenceSnippet(item.source_id, item.evidence, sourceMap);
        trackResult(v);
        item.verification = v;
        if (!v.verified) item.verification_note = v.status;
      }
    }
  }

  // 5. Verify source references in unanswered_questions
  if (Array.isArray(analysis.unanswered_questions)) {
    for (const q of analysis.unanswered_questions) {
      if (Array.isArray(q.related_sources)) {
        q.related_sources_valid = q.related_sources.every((id) => sourceMap.has(id));
      }
    }
  }

  // 6. Verify source references in checklist
  if (Array.isArray(analysis.checklist)) {
    for (const item of analysis.checklist) {
      if (Array.isArray(item.related_sources)) {
        item.related_sources_valid = item.related_sources.every((id) => sourceMap.has(id));
      }
    }
  }

  return {
    verifiedAnalysis: analysis,
    stats: {
      totalChecked,
      verifiedCount,
      unverifiedCount,
      invalidSourceCount
    }
  };
}

module.exports = {
  verifyEvidenceSnippet,
  verifyAllEvidence,
  normalizeForComparison,
  countWords
};
