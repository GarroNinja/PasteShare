// Serverless function entry point for Vercel
const express = require('express');
const cors = require('cors');
const { json, urlencoded } = require('express');
const morgan = require('morgan');
const https = require('https');

// Import paste routes
const pasteRoutes = require('./pasteRoutes');

// Print environments at startup
console.log('=== PasteShare API Server Starting ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  // Extract and log host information without credentials
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('Database host:', url.hostname);
    console.log('Database port:', url.port);
    console.log('Database name:', url.pathname.substring(1));
    console.log('Using SSL:', url.protocol === 'postgres:' ? 'No' : 'Yes');
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
  }
}

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

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Apply middleware
app.use(cors(corsOptions));
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Add a middleware for cache control headers
app.use((req, res, next) => {
  // Disable caching for all responses by default
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Catch JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON' });
  }
  next(err);
});

// Mount the paste routes
app.use('/api/pastes', pasteRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  // Get info about database usage from the pasteRoutes module
  const databaseStatus = pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus() : {
    isConnected: !!pasteRoutes.useDatabase,
    mode: pasteRoutes.useDatabase ? 'PostgreSQL' : 'In-Memory'
  };
  
  res.status(200).json({ 
    status: 'UP', 
    message: 'Vercel serverless function is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    database: {
      url: process.env.DATABASE_URL ? 'Configured' : 'Not configured',
      mode: databaseStatus.mode,
      connected: databaseStatus.isConnected,
      details: databaseStatus.details || 'No additional details available'
    },
    version: '1.0.1',
    serverInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage()
    }
  });
});

// Enhanced database status route
app.get('/api/database', (req, res) => {
  const dbInfo = {
    isConfigured: !!process.env.DATABASE_URL,
    isConnected: pasteRoutes.useDatabase === true,
    fallbackMode: pasteRoutes.useDatabase !== true,
    timestamp: new Date().toISOString(),
    connectionInfo: pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus() : null
  };
  
  res.status(200).json(dbInfo);
});

// Test Supabase connection directly
app.get('/api/test-connection', (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(400).json({ 
      success: false, 
      message: 'DATABASE_URL is not configured' 
    });
  }
  
  try {
    const url = new URL(process.env.DATABASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: '/',
      method: 'HEAD',
      timeout: 5000
    };
    
    const request = https.request(options, (response) => {
      res.status(200).json({
        success: true,
        message: 'Connection test successful',
        statusCode: response.statusCode,
        headers: response.headers
      });
    });
    
    request.on('error', (error) => {
      res.status(500).json({
        success: false,
        message: 'Connection test failed',
        error: error.message
      });
    });
    
    request.on('timeout', () => {
      request.destroy();
      res.status(408).json({
        success: false,
        message: 'Connection test timed out'
      });
    });
    
    request.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error testing connection',
      error: error.message
    });
  }
});

// Handle route not found
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export the serverless function handler
module.exports = (req, res) => {
  console.log(`Function invoked: ${req.method} ${req.url}`);
  return app(req, res);
}; 