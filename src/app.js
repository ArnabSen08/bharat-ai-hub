const express = require('express');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/healthcare', require('./api/healthcare/diagnosis.api'));
app.use('/api/rural', require('./api/rural/crop-advisory.api'));
// Add more routes as modules are created

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Bharat AI Hub',
    version: '1.0.0',
    description: 'Unified AI Platform for Social Impact',
    modules: [
      'Healthcare Intelligence',
      'Smart Retail & Commerce',
      'Rural Empowerment',
      'Learning Hub',
      'Content Intelligence',
      'Community Connect'
    ],
    endpoints: {
      healthcare: '/api/healthcare',
      rural: '/api/rural',
      retail: '/api/retail',
      learning: '/api/learning',
      content: '/api/content',
      community: '/api/community'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Bharat AI Hub server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
