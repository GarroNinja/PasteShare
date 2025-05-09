// Serverless function entry point for Vercel
const express = require('express');
const cors = require('cors');
const { json, urlencoded } = require('express');
const morgan = require('morgan');

// Import paste routes
const pasteRoutes = require('./pasteRoutes');

// Initialize Express app
const app = express();

// CORS Configuration
const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length']
};

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Apply middleware
app.use(cors(corsOptions));
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Mount the paste routes
app.use('/api/pastes', pasteRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    message: 'Vercel serverless function is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

// Handle route not found
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Export the serverless function handler
module.exports = (req, res) => {
  return app(req, res);
}; 