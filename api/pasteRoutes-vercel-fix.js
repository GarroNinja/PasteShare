// Paste routes for Vercel serverless functions - Modified with enhanced DB handling
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Sequelize, DataTypes, Op } = require('sequelize');

// Determine environment
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_VERCEL = process.env.VERCEL || process.env.VERCEL_ENV;
const ALLOW_FALLBACK = !IS_PROD || process.env.ALLOW_FALLBACK === 'true';

// Logging helper
function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

// Error logging helper
function logError(...args) {
  console.error(`[${new Date().toISOString().slice(11, 19)}] ERROR:`, ...args);
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Fallback in-memory storage
const inMemoryPastes = [];
let useDatabase = false;
let sequelize, Paste, File;
let lastConnectionAttempt = 0;
const connectionRetryInterval = 10000; // 10 seconds

// Log startup environment
log('==== PasteShare API Initializing ====');
log('Environment:', process.env.NODE_ENV);
log('Running on Vercel:', !!IS_VERCEL);
log('DATABASE_URL available:', !!process.env.DATABASE_URL);
log('Fallback allowed:', ALLOW_FALLBACK);
log('=============================');

// Database connection configurations to try in order
const connectionConfigs = [
  // Configuration 1: Minimal connection with strict timeouts
  {
    name: 'minimal',
    config: {
      dialect: 'postgres',
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
        connectTimeout: 5000,
        statement_timeout: 10000,
        idle_in_transaction_session_timeout: 10000
      },
      pool: { max: 1, min: 0, idle: 3000, acquire: 5000 },
      retry: { max: 3 },
      logging: false
    }
  },
  // Configuration 2: Standard connection with more relaxed settings
  {
    name: 'standard',
    config: {
      dialect: 'postgres',
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false }
      },
      pool: { max: 2, min: 0, idle: 5000, acquire: 10000 },
      retry: { max: 3 },
      logging: false
    }
  }
];

// Initialize database with multiple configuration attempts
async function initializeDatabase() {
  // Don't retry too frequently
  const now = Date.now();
  if (now - lastConnectionAttempt < connectionRetryInterval && lastConnectionAttempt !== 0) {
    log(`Skipping connection attempt, last attempt was ${Math.round((now - lastConnectionAttempt) / 1000)}s ago`);
    return false;
  }
  
  lastConnectionAttempt = now;
  log('Initializing database connection...');
  
  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL environment variable not set');
    return false;
  }
  
  // Log connection URL safely
  const urlParts = process.env.DATABASE_URL.split('@');
  if (urlParts.length > 1) {
    log('Database host:', urlParts[1].split('/')[0]);
    
    // Verify if using connection pooler
    const isPooler = urlParts[1].includes('pooler');
    if (isPooler) {
      log('✓ Using connection pooler (recommended)');
    } else {
      log('⚠ Not using connection pooler URL (might cause issues on Vercel)');
    }
  }
  
  // Try each connection configuration
  for (const connectionConfig of connectionConfigs) {
    try {
      log(`Trying database connection with "${connectionConfig.name}" configuration...`);
      
      // Initialize sequelize with this configuration
      sequelize = new Sequelize(process.env.DATABASE_URL, connectionConfig.config);
      
      // Test connection with timeout
      const connectPromise = sequelize.authenticate();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 5s')), 5000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      log(`✓ Connection successful with "${connectionConfig.name}" configuration`);
      
      // Define models
      defineModels();
      
      // Verify tables
      await verifyTables();
      
      // Set useDatabase flag
      useDatabase = true;
      return true;
    } catch (error) {
      logError(`Connection failed with "${connectionConfig.name}" configuration:`, error.message);
      if (error.original) {
        logError('Original error:', error.original.message, error.original.code);
      }
    }
  }
  
  logError('All connection configurations failed');
  return false;
}

function defineModels() {
  // Define Paste model
  Paste = sequelize.define('Paste', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Untitled Paste'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isEditable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    customUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'pastes',
    timestamps: true,
    freezeTableName: true
  });

  // Define File model
  File = sequelize.define('File', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    originalname: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    }
  }, {
    tableName: 'files',
    timestamps: true,
    freezeTableName: true
  });

  // Define associations
  Paste.hasMany(File, { 
    onDelete: 'CASCADE',
    foreignKey: 'pasteId'
  });
  File.belongsTo(Paste, {
    foreignKey: 'pasteId'
  });
}

async function verifyTables() {
  try {
    // Check existing tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableNames = tables.map(t => t.table_name);
    log('Available tables:', tableNames.join(', '));
    
    // Check for lowercase vs capitalized tables
    const hasPastes = tableNames.includes('pastes');
    const hasFiles = tableNames.includes('files');
    const hasCapitalizedPastes = tableNames.includes('Pastes');
    const hasCapitalizedFiles = tableNames.includes('Files');
    
    if (!hasPastes || !hasFiles) {
      log('Creating missing tables...');
      await sequelize.sync();
      log('Tables synchronized');
    }
    
    if (hasCapitalizedPastes || hasCapitalizedFiles) {
      log('⚠ Found capitalized tables which may cause issues:');
      if (hasCapitalizedPastes) log('- Capitalized "Pastes" table found');
      if (hasCapitalizedFiles) log('- Capitalized "Files" table found');
    }
    
    return true;
  } catch (error) {
    logError('Error verifying tables:', error.message);
    return false;
  }
}

// Initialize database on startup
initializeDatabase();

// Middleware to check database connection before each request
router.use(async (req, res, next) => {
  // Skip for health endpoint
  if (req.path === '/health' || req.path === '/diagnostic') {
    return next();
  }
  
  log(`Request: ${req.method} ${req.originalUrl}`);
  
  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL not set in environment');
    if (IS_PROD && !ALLOW_FALLBACK) {
      return res.status(503).json({ 
        message: 'Database configuration error', 
        error: 'Missing DATABASE_URL' 
      });
    }
  }
  
  try {
    // If no database connection, try to initialize
    if (!sequelize || !useDatabase) {
      await initializeDatabase();
    }
    
    // Test connection quickly
    if (useDatabase && sequelize) {
      await Promise.race([
        sequelize.authenticate(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000))
      ]);
    } else {
      throw new Error('Database not initialized');
    }
    
    // Connected!
    useDatabase = true;
    next();
  } catch (error) {
    logError('Database connection failed:', error.message);
    
    // Always try to reinitialize on failure
    initializeDatabase();
    
    // In production without fallback, return error
    if (IS_PROD && !ALLOW_FALLBACK) {
      return res.status(503).json({ 
        message: 'Database unavailable', 
        error: error.message 
      });
    }
    
    // In development or with fallback, use in-memory storage
    useDatabase = false;
    log('Using in-memory storage fallback');
    next();
  }
});

// Add diagnostic endpoint 
router.get('/diagnostic', async (req, res) => {
  const diagnosticInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: {
      url_available: !!process.env.DATABASE_URL,
      connection_active: useDatabase,
      using_fallback: !useDatabase && inMemoryPastes.length > 0,
      in_memory_paste_count: inMemoryPastes.length
    },
    vercel: {
      is_vercel: !!IS_VERCEL,
      env: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION,
    }
  };
  
  if (process.env.DATABASE_URL) {
    const urlParts = process.env.DATABASE_URL.split('@');
    if (urlParts.length > 1) {
      diagnosticInfo.database.host_info = urlParts[1].split('/')[0];
      diagnosticInfo.database.using_pooler = urlParts[1].includes('pooler');
    }
  }
  
  // Try to get table info if database is available
  if (useDatabase && sequelize) {
    try {
      const [tables] = await sequelize.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      diagnosticInfo.database.tables = tables.map(t => t.table_name);
      
      // Check for our tables
      const hasPastes = tables.some(t => t.table_name === 'pastes');
      const hasFiles = tables.some(t => t.table_name === 'files');
      
      if (hasPastes) {
        const [result] = await sequelize.query('SELECT COUNT(*) as count FROM pastes');
        diagnosticInfo.database.paste_count = parseInt(result[0].count, 10);
      }
    } catch (error) {
      diagnosticInfo.database.query_error = error.message;
    }
  }
  
  res.json(diagnosticInfo);
});

// Rest of your existing routes (GET /pastes, POST /pastes, etc) go here...
// ...

// Export router
module.exports = router; 