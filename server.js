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
    console.log(`Digital Dark Spot server listening on port ${PORT}`);
});

module.exports = app;
