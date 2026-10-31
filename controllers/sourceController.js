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

    const sourcePromises = sources.map(async (sourceItem, index) => {
      const id = `S${index + 1}`;
      const url = sourceItem.url.trim();

      try {
        const { html } = await fetchPage(url);
        const { title, text, detectedDate } = extractContent(html);

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

    return res.json({
      success: true,
      sources: results
    });
  } catch (error) {
    console.error('Unexpected error in handleFetchSources:', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while processing sources.'
    });
  }
}

module.exports = {
  handleFetchSources
};
