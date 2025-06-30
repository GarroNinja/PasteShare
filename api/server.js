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

console.log('=== PasteShare API Server Starting ===');

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



// Apply middleware for optimized performance on Vercel
app.use(cors(corsOptions));

// Set reasonable size limits for serverless environment
app.use(json({ limit: '10mb' }));  // Lowered to 10MB to conserve memory
app.use(urlencoded({ extended: true, limit: '10mb' }));

// Only use logging in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
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

// Add handlers for both /raw/:id (for curl) and /api/pastes/raw/:id (for API)
const handleRawPaste = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;
    
    console.log(`Get raw paste request for ID/URL: ${id}`);
    
    if (!req.db || !req.db.success) {
      return res.status(503).send('Database connection error');
    }
    
    const { models } = req.db;
    const { Paste, Block } = models;
    
    // Import Op here to avoid issues
    const { Op } = require('./db');
    const bcrypt = require('bcryptjs');
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Find paste by ID or custom URL
    const paste = await Paste.findOne({
      where: isValidUUID 
        ? { [Op.or]: [{ id }, { customUrl: id }] }
        : { customUrl: id },
      include: [
        {
          model: Block,
          as: 'Blocks',
          attributes: ['id', 'content', 'language', 'order']
        }
      ]
    });
    
    if (!paste) {
      return res.status(404).send('Paste not found');
    }
    
    // Check if paste has expired
    if (paste.expiresAt && new Date() > new Date(paste.expiresAt)) {
      return res.status(404).send('Paste has expired');
    }
    
    // Check if it's a Jupyter-style paste (not supported for raw view)
    if (paste.Blocks && paste.Blocks.length > 0) {
      return res.status(400).send('Raw view not supported for Jupyter-style pastes. Use the regular view instead.');
    }
    
    // Check password if paste is password-protected
    if (paste.password) {
      if (!password) {
        return res.status(403).send('Password required. Add ?password=YOUR_PASSWORD to the URL.');
      }
      
      try {
        const isPasswordValid = await bcrypt.compare(password, paste.password);
        if (!isPasswordValid) {
          return res.status(403).send('Invalid password');
        }
      } catch (bcryptError) {
        console.error('bcrypt compare error:', bcryptError);
        return res.status(500).send('Server error verifying password');
      }
    }
    
    // Increment view count
    paste.views = (paste.views || 0) + 1;
    await paste.save();
    
    // Return raw content as plain text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(paste.content || '');
    
  } catch (error) {
    console.error('Get raw paste error:', error);
    res.status(500).send('Server error retrieving paste');
  }
};

// Handle both URL patterns for raw pastes
app.get('/raw/:id', handleRawPaste);
app.get('/api/pastes/raw/:id', handleRawPaste);

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