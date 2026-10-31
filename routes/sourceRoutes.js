const express = require('express');
const { handleFetchSources } = require('../controllers/sourceController');
const { validateSourcesMiddleware } = require('../middleware/validateSources');

const router = express.Router();

// POST /api/fetch-sources
router.post('/fetch-sources', validateSourcesMiddleware, handleFetchSources);

module.exports = router;
