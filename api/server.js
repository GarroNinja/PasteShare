// Serverless function entry point for Vercel
const express = require('express');
const cors = require('cors');
const { json, urlencoded } = require('express');
const morgan = require('morgan');
const https = require('https');
const { URL } = require('url');
const bodyParser = require('body-parser');

// Import required PostgreSQL dependencies
try {
  // First, try to load the pg module
  const pg = require('pg');
  console.log('PostgreSQL module loaded successfully:', pg.version);
} catch (error) {
  console.error('CRITICAL ERROR - Failed to load pg module:', error.message);
  console.error('This may indicate that pg is not installed correctly.');
  console.error('Please run: npm install pg pg-hstore pg-native');
  
  // Try to install pg as a last resort
  try {
    require('child_process').execSync('npm install pg pg-hstore --no-save', { stdio: 'inherit' });
    console.log('Auto-installed pg module as emergency fix');
  } catch (installError) {
    console.error('Failed to auto-install pg:', installError.message);
  }
}

// Fail fast if DATABASE_URL is missing - required in all environments
if (!process.env.DATABASE_URL) {
  console.error('FATAL ERROR: DATABASE_URL environment variable is required');
  throw new Error('DATABASE_URL environment variable is required');
}

// Validate the DATABASE_URL is correctly formatted
try {
  const dbUrl = new URL(process.env.DATABASE_URL);
  // Additional validation to ensure it's pointing to postgres
  if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
    throw new Error(`Invalid database protocol: ${dbUrl.protocol}. Expected postgres: or postgresql:`);
  }
} catch (error) {
  console.error('FATAL ERROR: Invalid DATABASE_URL format:', error.message);
  throw error;
}

// Import paste routes
const pasteRoutes = require('./pasteRoutes');

// Print environments at startup for debugging
console.log('=== PasteShare API Server Starting ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Is Vercel environment:', !!process.env.VERCEL);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

// Log database information safely (without credentials)
if (process.env.DATABASE_URL) {
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

// Request logging middleware with unique request ID
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(2, 10);
  req.requestId = requestId;
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Apply middleware for optimized performance on Vercel
app.use(cors(corsOptions));

// Set reasonable size limits for serverless environment
app.use(json({ limit: '10mb' }));  // Lowered to 10MB to conserve memory
app.use(urlencoded({ extended: true, limit: '10mb' }));

// Only use logging in development or when debugging
const useLogging = process.env.NODE_ENV === 'development' || process.env.DEBUG_LOGGING === 'true';
if (useLogging) {
  app.use(morgan('dev'));
  console.log('Request logging enabled');
} else {
  console.log('Request logging disabled in production for performance');
}

// Add database connection middleware
app.use((req, res, next) => {
  try {
    // Ensure the createConnection function is available from pasteRoutes
    if (!pasteRoutes.createConnection) {
      console.error('Database middleware error: createConnection function not available');
      res.setHeader('X-DB-Status', 'middleware-error');
      next();
      return;
    }
    
    // Create a fresh database connection for this request
    req.db = pasteRoutes.createConnection();
    
    // Log connection status
    if (req.db && req.db.success) {
      console.log(`[${req.requestId}] Database connection established`);
      res.setHeader('X-DB-Status', 'connected');
    } else {
      console.error(`[${req.requestId}] Database connection failed:`, req.db?.error || 'Unknown error');
      res.setHeader('X-DB-Status', 'failed');
    }
    
    next();
  } catch (error) {
    console.error(`[${req.requestId}] Error in database middleware:`, error);
    res.setHeader('X-DB-Status', 'error');
    next();
  }
});

// Add a middleware for cache control headers
app.use((req, res, next) => {
  // Set default cache control headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // For static assets or syntax highlighting resources, allow caching
  if (req.path.startsWith('/static/') || 
      req.path.includes('.css') || 
      req.path.includes('.js') || 
      req.path.includes('.woff') || 
      req.path.includes('.ttf')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  next();
});

// Catch JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON' });
  }
  
  // Handle file upload errors from multer
  if (err && err.name === 'MulterError') {
    console.error('Multer error:', err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File too large. Maximum size is 10MB.',
        error: err.message
      });
    }
    return res.status(400).json({ 
      message: 'File upload error',
      error: err.message
    });
  }
  
  next(err);
});

// Mount the paste routes
app.use('/api/pastes', pasteRoutes);

// Add root-level paste handling to access pastes directly at /:id
app.get('/:id', async (req, res) => {
  try {
    // Forward the request to the paste route handler
    req.url = `/api/pastes/${req.params.id}`;
    app._router.handle(req, res);
  } catch (error) {
    console.error('Root paste handler error:', error);
    return res.status(500).json({ message: 'Server error retrieving paste' });
  }
});

// Add PUT handler for editing pastes at the root level
app.put('/:id', async (req, res) => {
  try {
    // Forward the request to the paste route handler
    req.url = `/api/pastes/${req.params.id}`;
    app._router.handle(req, res);
  } catch (error) {
    console.error('Root paste edit handler error:', error);
    return res.status(500).json({ message: 'Server error updating paste' });
  }
});

// Add POST handler for verifying paste passwords at the root level
app.post('/:id/verify-password', async (req, res) => {
  try {
    // Forward the request to the paste route handler
    req.url = `/api/pastes/${req.params.id}/verify-password`;
    app._router.handle(req, res);
  } catch (error) {
    console.error('Root paste password verification handler error:', error);
    return res.status(500).json({ message: 'Server error verifying paste password' });
  }
});

// Add explicit migration endpoint to force schema updates
app.post('/api/migrate-schema', async (req, res) => {
  try {
    if (!req.db || !req.db.sequelize) {
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }
    
    const { sequelize } = req.db;
    const migrations = [];
    
    // Check and add isJupyterStyle column
    const [jupyterStyleColumnExists] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'isJupyterStyle'"
    );
    
    if (jupyterStyleColumnExists.length === 0) {
      console.log('Migrating: Adding isJupyterStyle column to pastes table');
      await sequelize.query('ALTER TABLE "pastes" ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE;');
      migrations.push('Added isJupyterStyle column');
    }
    
    // Check and make content column nullable
    const [contentColumnIsNotNull] = await sequelize.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'content'"
    );
    
    if (contentColumnIsNotNull.length > 0 && contentColumnIsNotNull[0].is_nullable === 'NO') {
      console.log('Migrating: Making content column nullable');
      await sequelize.query('ALTER TABLE "pastes" ALTER COLUMN "content" DROP NOT NULL;');
      migrations.push('Made content column nullable');
    }
    
    // Check and create blocks table
    const [blocksTableExists] = await sequelize.query(
      "SELECT to_regclass('public.blocks') IS NOT NULL as exists"
    );
    
    if (blocksTableExists.length === 0 || !blocksTableExists[0].exists) {
      console.log('Migrating: Creating blocks table');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "blocks" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          language VARCHAR(50) DEFAULT 'text',
          "order" INTEGER NOT NULL,
          "pasteId" UUID NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);
      migrations.push('Created blocks table');
    }
    
    // Return results
    if (migrations.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No migrations needed. Schema is already up to date.' 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Schema migrations completed successfully',
      migrations
    });
  } catch (error) {
    console.error('Schema migration error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Schema migration failed', 
      error: error.message 
    });
  }
});

// Health check route
app.get('/api/health', async (req, res) => {
  // Get info about database usage from the pasteRoutes module
  const databaseStatus = pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus() : {
    isConnected: !!pasteRoutes.useDatabase,
    mode: pasteRoutes.useDatabase ? 'PostgreSQL' : 'In-Memory'
  };
  
  // Check database schema at runtime
  let schemaStatus = { checked: false };
  
  if (req.db && req.db.sequelize) {
    try {
      // Check if isJupyterStyle column exists
      const [jupyterStyleColumnResult] = await req.db.sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'isJupyterStyle'"
      );
      
      // Check if content column is nullable
      const [contentColumnResult] = await req.db.sequelize.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'content'"
      );
      
      // Check if blocks table exists
      const [blocksTableResult] = await req.db.sequelize.query(
        "SELECT to_regclass('public.blocks') IS NOT NULL as exists"
      );
      
      schemaStatus = {
        checked: true,
        hasJupyterStyleColumn: jupyterStyleColumnResult.length > 0,
        contentIsNullable: contentColumnResult.length > 0 && contentColumnResult[0].is_nullable === 'YES',
        hasBlocksTable: blocksTableResult.length > 0 && blocksTableResult[0].exists,
        isFullyCompatible: jupyterStyleColumnResult.length > 0 && 
                         contentColumnResult.length > 0 && 
                         contentColumnResult[0].is_nullable === 'YES' &&
                         blocksTableResult.length > 0 && 
                         blocksTableResult[0].exists
      };
      
      // Auto-fix schema issues if possible
      if (!schemaStatus.isFullyCompatible) {
        console.log('Schema issues detected, attempting auto-fix...');
        
        if (!schemaStatus.hasJupyterStyleColumn) {
          console.log('Adding missing isJupyterStyle column...');
          await req.db.sequelize.query('ALTER TABLE "pastes" ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE;');
          schemaStatus.fixedJupyterStyleColumn = true;
        }
        
        if (!schemaStatus.contentIsNullable) {
          console.log('Making content column nullable...');
          await req.db.sequelize.query('ALTER TABLE "pastes" ALTER COLUMN "content" DROP NOT NULL;');
          schemaStatus.fixedContentColumn = true;
        }
        
        if (!schemaStatus.hasBlocksTable) {
          console.log('Creating missing blocks table...');
          await req.db.sequelize.query(`
            CREATE TABLE IF NOT EXISTS "blocks" (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              content TEXT NOT NULL,
              language VARCHAR(50) DEFAULT 'text',
              "order" INTEGER NOT NULL,
              "pasteId" UUID NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
              "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
          `);
          schemaStatus.createdBlocksTable = true;
        }
      }
    } catch (error) {
      console.error('Schema check error:', error);
      schemaStatus.error = error.message;
    }
  }
  
  res.status(200).json({ 
    status: 'UP', 
    message: 'Vercel serverless function is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    isVercel: !!process.env.VERCEL,
    requestId: req.requestId,
    database: {
      url: process.env.DATABASE_URL ? 'Configured' : 'Not configured',
      mode: databaseStatus.mode,
      connected: databaseStatus.isConnected,
      details: databaseStatus.details || 'No additional details available',
      schema: schemaStatus
    },
    version: '1.0.3',
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
    isConnected: pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus().isConnected : false,
    fallbackMode: !pasteRoutes.getDatabaseStatus || !pasteRoutes.getDatabaseStatus().isConnected,
    timestamp: new Date().toISOString(),
    connectionInfo: pasteRoutes.getDatabaseStatus ? pasteRoutes.getDatabaseStatus() : null,
    environmentVariables: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: !!process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_REGION: process.env.VERCEL_REGION
    }
  };
  
  res.status(200).json(dbInfo);
});

// Test Supabase connection directly
app.get('/api/test-connection', async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(400).json({ 
      success: false, 
      message: 'DATABASE_URL is not configured' 
    });
  }
  
  try {
    const url = new URL(process.env.DATABASE_URL);
    
    // First check basic connectivity to host
    const hostConnectTest = await new Promise((resolve) => {
      const options = {
        hostname: url.hostname,
        port: 443, // HTTPS port
        path: '/',
        method: 'HEAD',
        timeout: 5000
      };
      
      const request = https.request(options, (response) => {
        resolve({
          success: true,
          statusCode: response.statusCode
        });
      });
      
      request.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
      
      request.on('timeout', () => {
        request.destroy();
        resolve({
          success: false,
          error: 'Connection timed out'
        });
      });
      
      request.end();
    });
    
    // For Supabase, also perform a PostgreSQL connection test using the pasteRoutes module
    let pgTest = { attempted: false };
    if (url.hostname.includes('supabase') && pasteRoutes.testDatabase) {
      pgTest = {
        attempted: true,
        result: await pasteRoutes.testDatabase()
      };
      
      // Force enable database usage if connection succeeded
      if (pgTest.result && pgTest.result.connected && pgTest.result.queryWorking) {
        pasteRoutes.useDatabase = true;
        console.log('Test endpoint: Forcing database usage to true based on successful connection test');
      }
    }
    
    res.status(200).json({
      success: hostConnectTest.success,
      message: hostConnectTest.success 
        ? 'Connection test completed' 
        : 'Connection test failed',
      hostname: url.hostname,
      hostConnectivity: hostConnectTest,
      database: {
        host: url.hostname,
        port: url.port,
        database: url.pathname.substring(1),
        username: url.username ? '(configured)' : '(missing)',
        passwordConfigured: !!url.password,
        ssl: url.searchParams.get('sslmode') || 'default',
        poolingEnabled: url.port === '6543'
      },
      postgresTest: pgTest,
      currentState: {
        usingDatabase: pasteRoutes.useDatabase,
        connectionsAttempted: pasteRoutes.connectionAttempts || 0,
        mode: pasteRoutes.useDatabase ? 'PostgreSQL' : 'In-Memory'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error testing connection',
      error: error.message
    });
  }
});

// Add route to serve the migration HTML page
app.get('/migrate', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const htmlPath = path.join(__dirname, 'migrate.html');
    if (fs.existsSync(htmlPath)) {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlContent);
    } else {
      return res.status(404).send('Migration page not found');
    }
  } catch (error) {
    console.error('Error serving migration page:', error);
    return res.status(500).send('Error serving migration page');
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
  console.error(`[${req.requestId || 'unknown'}] Server error:`, err);
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