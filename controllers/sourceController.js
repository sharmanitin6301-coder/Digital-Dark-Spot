const { fetchPage } = require('../services/fetchService');
const { extractContent } = require('../services/contentExtractor');

/**
 * Handles POST /api/fetch-sources.
 * Validates, fetches, and extracts content from 2 to 5 provided source URLs.
 * Individual failures are captured per source so that one failure never fails the batch.
 */
async function handleFetchSources(req, res) {
  try {
    const { sources } = req.body;
    console.log(`[FetchSources] Received batch of ${sources ? sources.length : 0} sources`);

    const sourcePromises = sources.map(async (sourceItem, index) => {
      const id = `S${index + 1}`;
      const url = sourceItem.url ? sourceItem.url.trim() : '';

      try {
        const { html } = await fetchPage(url);
        const { title, text, detectedDate } = extractContent(html);

        console.log(`[FetchSources] Succeeded: ${id} (${url}) -> title: "${title ? title.slice(0, 40) : 'Untitled'}", text: ${text ? text.length : 0} chars`);

        return {
          id,
          url,
          title,
          text,
          detectedDate,
          fetchStatus: 'success',
          error: null
        };
      } catch (err) {
        console.warn(`[FetchSources] Inaccessible: ${id} (${url}) -> ${err.message}`);
        return {
          id,
          url,
          title: null,
          text: '',
          detectedDate: null,
          fetchStatus: 'error',
          error: err.message || 'Failed to fetch or parse source website.'
        };
      }
    });

    const results = await Promise.all(sourcePromises);
    const successfulCount = results.filter((r) => r.fetchStatus === 'success').length;
    console.log(`[FetchSources] Batch complete: ${successfulCount}/${results.length} accessible`);

    return res.json({
      success: true,
      sources: results
    });
  } catch (error) {
    console.error('[FetchSources] Unexpected server error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while processing sources.'
    });
  }
}

module.exports = {
  handleFetchSources
};
