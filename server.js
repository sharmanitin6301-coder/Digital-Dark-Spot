const path = require('path');
const express = require('express');
require('dotenv').config();

const sourceRoutes = require('./routes/sourceRoutes');
const analysisRoutes = require('./routes/analysisRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'Digital Dark Spot'
  });
});

// Source fetching routes
app.use('/api', sourceRoutes);

// Gemini analysis routes
app.use('/api', analysisRoutes);

// Serve static files from the existing public directory
app.use(express.static(path.join(__dirname, 'public')));

// Start the server if run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    const hasGroqKey = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
    console.log(`[Startup] Digital Dark Spot server listening on 0.0.0.0:${PORT}`);
    console.log(`[Startup] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Startup] GEMINI_API_KEY: ${hasGeminiKey ? 'Configured (' + process.env.GEMINI_API_KEY.trim().length + ' characters)' : 'NOT CONFIGURED'}`);
    console.log(`[Startup] GROQ_API_KEY: ${hasGroqKey ? 'Configured (' + process.env.GROQ_API_KEY.trim().length + ' characters)' : 'NOT CONFIGURED'}`);
    console.log(`[Startup] Primary AI Provider: Google Gemini (${process.env.GEMINI_MODEL || 'gemini-3.8-flash'})`);
    console.log(`[Startup] Secondary Fallback: Groq API (${process.env.GROQ_MODEL || 'openai/gpt-oss-120b'})`);
  });
}

module.exports = app;
