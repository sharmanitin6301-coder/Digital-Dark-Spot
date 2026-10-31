const express = require('express');
const { handleAnalyze } = require('../controllers/analysisController');
const { validateAnalysisMiddleware } = require('../middleware/validateAnalysis');

const router = express.Router();

// POST /api/analyze
router.post('/analyze', validateAnalysisMiddleware, handleAnalyze);

module.exports = router;
