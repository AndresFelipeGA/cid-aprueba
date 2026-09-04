const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Load config (triggers dotenv)
const config = require('./config/env');

// Database module is loaded but initialization is deferred to server.js
// (sql.js requires async init; models require this module for the db wrapper)

// Import routes
const authRoutes = require('./routes/auth');
const requisitionRoutes = require('./routes/requisitions');
const approvalRoutes = require('./routes/approvals');
const dashboardRoutes = require('./routes/dashboard');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? process.env.ALLOWED_ORIGIN || 'http://localhost:3000'
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files — no-cache for JS/CSS to avoid stale browser cache after updates
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    },
    message: 'Server is running',
  });
});

// 404 handler for API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'The requested API endpoint does not exist',
  });
});

// Centralized error handler (must be last)
app.use(errorHandler);

module.exports = app;
