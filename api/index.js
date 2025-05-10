// Serverless function entry point for Vercel
const express = require('express');
const cors = require('cors');
const { json, urlencoded } = require('express');
const morgan = require('morgan');
const https = require('https');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Try to load env from multiple locations for Vercel deployment
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '.env.production'),
  path.resolve(process.cwd(), '.env.local')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('No specific .env file found, using default dotenv config');
  dotenv.config();
}

// Import paste routes
const pasteRoutes = require('./pasteRoutes');

// Helper function to check for DATABASE_URL
function getDatabaseInfo() {
  if (!process.env.DATABASE_URL) {
    return {
      value: null,
      exists: false
    };
  }
  
  return {
    value: process.env.DATABASE_URL,
    exists: true
  };
}

// Helper function to check for all possible database URLs
function getDatabaseUrl() {
  // In order of preference: pooled connection first, then direct connection
  const possibleDbVars = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL', 
    'POSTGRES_URL_NON_POOLING'
  ];
  
  for (const varName of possibleDbVars) {
    if (process.env[varName]) {
      return {
        value: process.env[varName],
        source: varName
      };
    }
  }
  
  return {
    value: null,
    source: null
  };
}

// Print environments at startup
console.log('=== PasteShare API Server Starting ===');
console.log('NODE_ENV:', process.env.NODE_ENV);

// Check for database connection
const dbConnection = getDatabaseInfo();
console.log('DATABASE_URL exists:', dbConnection.exists);

if (dbConnection.value) {
  // Extract and log host information without credentials
  try {
    const url = new URL(dbConnection.value);
    console.log('Database host:', url.hostname);
    console.log('Database port:', url.port);
    console.log('Database name:', url.pathname.substring(1));
    console.log('Using SSL:', url.protocol === 'postgres:' ? 'No' : 'Yes');
    console.log('Using pooler:', url.hostname.includes('pooler') ? 'Yes' : 'No');
  } catch (error) {
    console.error('Error parsing database URL:', error.message);
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
app.get('/api/health', async (req, res) => {
  // Get info about database status
  let dbStatus = false;
  try {
    dbStatus = await pasteRoutes.dbReady();
  } catch (error) {
    console.error('Health check error:', error);
  }
  
  // Create safe database URL (hide credentials)
  let dbUrl = 'Not configured';
  if (process.env.DATABASE_URL) {
    const parts = process.env.DATABASE_URL.split('@');
    if (parts.length > 1) {
      dbUrl = `[credentials hidden]@${parts[1]}`;
    }
  }
  
  res.status(200).json({ 
    status: 'UP', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus ? 'connected' : 'disconnected',
      url: dbUrl
    }
  });
});

// Enhanced database status route
app.get('/api/database', async (req, res) => {
  const dbConnection = getDatabaseInfo();
  
  // Create a safe version of the URL for display
  let safeDbUrl = 'Not configured';
  if (dbConnection.value) {
    const parts = dbConnection.value.split('@');
    if (parts.length > 1) {
      safeDbUrl = `[credentials hidden]@${parts[1]}`;
    } else {
      safeDbUrl = 'Invalid format';
    }
  }
  
  const dbInfo = {
    isConfigured: dbConnection.exists,
    databaseUrl: safeDbUrl, 
    isConnected: pasteRoutes.useDatabase === true,
    fallbackMode: pasteRoutes.useDatabase !== true,
    timestamp: new Date().toISOString(),
    connectionInfo: pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus() : null
  };
  
  // Try to run a simple query to test connection
  try {
    if (typeof pasteRoutes.dbReady === 'function') {
      const isConnected = await pasteRoutes.dbReady();
      dbInfo.connectionTest = {
        success: isConnected,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    dbInfo.connectionTest = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
  
  res.status(200).json(dbInfo);
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
  console.log(`Request: ${req.method} ${req.url}`);
  return app(req, res);
}; 