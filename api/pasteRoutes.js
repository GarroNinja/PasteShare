// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Determine environment
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_FALLBACK = !IS_PROD;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Allow most common file types
    const allowedMimeTypes = [
      'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/json', 'application/xml', 'application/javascript',
      'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  }
});

// Fallback in-memory storage if database connection fails
const inMemoryPastes = [];
let useDatabase = false; // Start with false and only enable after successful connection
let sequelize, Paste, File;
let lastConnectionAttempt = 0;
const connectionRetryInterval = 30000; // Reduced from 60000 to 30000 (30 seconds)

// Add persistent cross-instance caching
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_KEY_PREFIX = 'pasteshare_';

// Check for all possible database URL variants from Vercel Supabase integration
const getPossibleDatabaseUrl = () => {
  // In order of preference: pooled connection first, then direct connection
  const possibleDbVars = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL', 
    'POSTGRES_URL_NON_POOLING'
  ];
  
  // Find the first available database URL
  for (const varName of possibleDbVars) {
    if (process.env[varName]) {
      console.log(`Using database connection from ${varName}`);
      return process.env[varName];
    }
  }
  
  console.error('No database connection URL found in environment variables');
  console.error(`Checked for these variables: ${possibleDbVars.join(', ')}`);
  
  return null;
};

// Helper function to restore pastes from database
async function restorePastesFromDatabase() {
  if (!useDatabase || !sequelize || !Paste) return;
  
  try {
    console.log('Attempting to restore pastes from database...');
    const now = new Date();
    
    // Query recent pastes from database to populate cache
    const recentPastes = await Paste.findAll({
      where: {
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: now } }
        ]
      },
      include: [{
        model: File,
        required: false
      }],
      order: [['createdAt', 'DESC']],
      limit: 100 // Limit to recent 100 pastes
    });
    
    console.log(`Restored ${recentPastes.length} pastes from database`);
    
    // Clear the in-memory array and repopulate it
    inMemoryPastes.length = 0;
    
    recentPastes.forEach(paste => {
      const pasteObj = paste.toJSON();
      inMemoryPastes.push({
        id: paste.id,
        title: paste.title,
        content: paste.content,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        userId: paste.userId,
        views: paste.views,
        createdAt: paste.createdAt,
        updatedAt: paste.updatedAt,
        files: paste.Files ? paste.Files.map(file => ({
          id: file.id,
          filename: file.originalname || file.filename,
          originalname: file.originalname || file.filename,
          mimetype: file.mimetype,
          size: file.size,
          content: file.content
        })) : []
      });
    });
  } catch (error) {
    console.error('Error restoring pastes from database:', error);
  }
}

// Log deployment environment on startup
console.log('==== PasteShare API Initializing ====');
console.log('Environment:', process.env.NODE_ENV);
console.log('Vercel Environment:', process.env.VERCEL_ENV || 'not running on Vercel');
console.log('Database connection available:', !!getPossibleDatabaseUrl());
console.log('Database fallback allowed:', ALLOW_FALLBACK);
console.log('=============================');

function initializeDatabase() {
  // Don't retry connection too frequently
  const now = Date.now();
  if (now - lastConnectionAttempt < connectionRetryInterval && lastConnectionAttempt !== 0) {
    console.log(`Skipping connection attempt, last attempt was ${Math.round((now - lastConnectionAttempt) / 1000)}s ago`);
    return;
  }
  
  lastConnectionAttempt = now;
  console.log('Initializing database connection...');
  
  // Get connection string using the helper function
  const connectionString = getPossibleDatabaseUrl();
  
  try {
    if (!connectionString) {
      console.error('No database connection URL found in environment!');
      // Log all environment variables in development (redacted for security)
      if (process.env.NODE_ENV === 'development') {
        console.log('Available environment variables:', 
          Object.keys(process.env)
            .filter(key => !key.includes('SECRET') && !key.includes('KEY') && !key.includes('TOKEN') && !key.includes('PASS'))
        );
      }
      return;
    }
    
    // Log database connection attempt with more details
    const urlParts = connectionString.split('@');
    if (urlParts.length > 1) {
      console.log('Connecting to:', `[credentials hidden]@${urlParts[1]}`);
      
      // Check for pooler in the URL (preferred for Vercel)
      if (urlParts[1].includes('pooler')) {
        console.log('Using connection pooler URL (recommended for serverless)');
      } else {
        console.log('Not using connection pooler URL (might cause connection issues in serverless)');
      }
    } else {
      console.log('Connection string has unexpected format');
    }

    // Initialize DB connection with simplified config for Vercel + Supabase
    sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // Important for Vercel + Supabase
        }
      },
      pool: {
        max: 2, // Minimal pool for serverless
        min: 0,
        idle: 5000,
        acquire: 10000
      },
      retry: {
        max: 3,
        match: [/Deadlock/i, /Lock/i, /Timeout/i, /Connection/i]
      },
      logging: false
    });

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
      // Model options
      tableName: 'pastes',
      timestamps: true, // Enable timestamps
      paranoid: false, // Don't use soft deletes
      underscored: false, // Use camelCase for fields
      freezeTableName: true // Use the exact model name as table name
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
        type: DataTypes.TEXT('long'), // Use TEXT instead of BLOB for better compatibility
        allowNull: false
      }
    }, {
      // Model options
      tableName: 'files', 
      timestamps: true, // Enable timestamps
      paranoid: false, // Don't use soft deletes
      underscored: false, // Use camelCase for fields
      freezeTableName: true // Use the exact model name as table name
    });

    // Setup associations
    Paste.hasMany(File, { 
      foreignKey: 'pasteId',
      as: 'Files'
    });
    
    File.belongsTo(Paste, { 
      foreignKey: 'pasteId',
      as: 'Paste'
    });

    // Try asynchronous operations immediately
    (async () => {
      try {
        // First just try to authenticate
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully');
        
        // Set useDatabase to true immediately after authentication
        useDatabase = true;
        
        // Analyze existing database structure
        try {
          const [results] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
          `);
          
          if (results && results.length) {
            const existingTables = results.map(r => r.table_name?.toLowerCase());
            console.log('Existing tables:', existingTables);
            
            // Skip sync operations if tables exist
            if (existingTables.includes('pastes') || existingTables.includes('files')) {
              console.log('Tables already exist, skipping sync to preserve data');
              return;
            }
          }
          
          // Tables don't exist, sync them (never force in production)
          const forceSync = false; // Never force in production
          await sequelize.sync({ force: forceSync });
          console.log('Database tables synchronized successfully');
          
        } catch (queryError) {
          console.error('Error checking database tables:', queryError.message);
          // Continue anyway, we'll try to use the database
        }
      } catch (error) {
        console.error('Database initialization FAILED:', error.message);
        if (error.original) {
          console.error('Original error:', error.original.message);
        }
        useDatabase = false;
      }
    })();
  } catch (error) {
    console.error('Error setting up database:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    useDatabase = false;
  }
}

// Initialize database connection
initializeDatabase();

// Middleware to check database connection before each request
router.use(async (req, res, next) => {
  console.log(`DB Request: ${req.method} ${req.originalUrl}`);
  
  // Skip database check for health endpoint to prevent endless loops
  if (req.path === '/health') {
    return next();
  }
  
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in environment!');
    if (IS_PROD) {
      return res.status(503).json({ message: 'Database configuration error', error: 'Missing DATABASE_URL' });
    }
  }
  
  try {
    // Make a direct, forceful connection attempt
    if (!sequelize) {
      initializeDatabase();
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Try to ping - but with a short timeout
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 5000))
    ]);
    
    // Connected!
    useDatabase = true;
    next();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    
    // Always try to reinitialize on failure
    initializeDatabase();
    
    // In production, return error
    if (IS_PROD && !ALLOW_FALLBACK) {
      return res.status(503).json({ 
        message: 'Database unavailable', 
        error: error.message 
      });
    }
    
    // In development, fall back to in-memory storage
    useDatabase = false;
    console.log('Using in-memory storage fallback');
    next();
  }
});

// Create a new paste
router.post('/', upload.array('files', 5), async (req, res) => {
  try {
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    
    // Log request details
    console.log(`POST /api/pastes - Creating paste with title: ${title || 'Untitled'}, mode: ${useDatabase ? 'database' : 'in-memory'}`);
    
    // Validate input
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
    if (useDatabase) {
      // Use transaction to ensure both paste and files are created or nothing is
      let transaction;
      
      try {
        // Start transaction
        transaction = await sequelize.transaction();
        
        // Check if custom URL is taken (database version)
        if (customUrl) {
          const existingPaste = await Paste.findOne({ 
            where: { customUrl },
            transaction
          });
          if (existingPaste) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Custom URL is already taken' });
          }
        }
        
        // Create paste in database
        const paste = await Paste.create({
          title: title || 'Untitled Paste',
          content,
          expiresAt,
          isPrivate: isPrivate === 'true' || isPrivate === true,
          isEditable: isEditable === 'true' || isEditable === true,
          customUrl: customUrl || null,
          userId: null
        }, { transaction });
        
        console.log(`Created paste in database with ID: ${paste.id}`);
        
        // Handle files (if any)
        const fileRecords = [];
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            // Convert buffer to base64 string for storage
            const base64Content = file.buffer.toString('base64');
            
            const fileRecord = await File.create({
              filename: file.originalname,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              content: base64Content, // Store as base64 string instead of buffer
              pasteId: paste.id
            }, { transaction });
            
            fileRecords.push(fileRecord);
          }
          
          console.log(`Added ${fileRecords.length} files to paste ${paste.id}`);
        }
        
        // Commit the transaction
        await transaction.commit();
        
        return res.status(201).json({
          message: 'Paste created successfully',
          paste: {
            id: paste.id,
            title: paste.title,
            content: paste.content,
            expiresAt: paste.expiresAt,
            isPrivate: paste.isPrivate,
            isEditable: paste.isEditable,
            customUrl: paste.customUrl,
            createdAt: paste.createdAt,
            files: fileRecords.map(f => ({
              id: f.id,
              filename: f.originalname,
              size: f.size,
              url: `/api/pastes/${paste.id}/files/${f.id}`
            })),
            storageType: 'database'
          }
        });
      } catch (error) {
        // Rollback transaction if there was an error
        if (transaction) await transaction.rollback();
        console.error('Database operation failed:', error);
        // Fall through to in-memory implementation
      }
    }
    
    // In-memory implementation (fallback)
    // Check if custom URL is taken
    if (customUrl && inMemoryPastes.some(p => p.customUrl === customUrl)) {
      return res.status(400).json({ message: 'Custom URL is already taken' });
    }
    
    // Create paste in memory
    const paste = {
      id: uuidv4(),
      title: title || 'Untitled Paste',
      content,
      expiresAt,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      isEditable: isEditable === 'true' || isEditable === true,
      customUrl: customUrl || null,
      userId: null,
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      files: []
    };
    
    // Handle files (if any)
    if (req.files && req.files.length > 0) {
      paste.files = req.files.map(file => ({
        id: uuidv4(),
        filename: file.originalname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        content: file.buffer.toString('base64') // Store as base64 string for consistency
      }));
    }
    
    // Add to store
    inMemoryPastes.push(paste);
    console.log(`Created paste in memory with ID: ${paste.id}`);
    
    return res.status(201).json({
      message: 'Paste created successfully (in-memory mode)',
      paste: {
        id: paste.id,
        title: paste.title,
        content: paste.content,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
        files: paste.files.map(f => ({
          id: f.id,
          filename: f.originalname,
          size: f.size,
          url: `/api/pastes/${paste.id}/files/${f.id}`
        })),
        storageType: 'memory'
      }
    });
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({ message: 'Server error creating paste' });
  }
});

// Get all recent public pastes
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    console.log(`GET /api/pastes - Retrieving recent pastes, mode: ${useDatabase ? 'database' : 'in-memory'}`);
    
    // Set cache control headers to prevent Vercel cache
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    if (useDatabase) {
      try {
        // Simplified query without complex where clauses
        const publicPastes = await Paste.findAll({
          where: {
            isPrivate: false,
            // Handle expiration separately to avoid issues
            [Op.or]: [
              { expiresAt: null },
              { expiresAt: { [Op.gt]: now } }
            ]
          },
          order: [['createdAt', 'DESC']],
          limit,
          // Don't include files in this query to keep it simpler
          attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl']
        });
        
        console.log(`Retrieved ${publicPastes.length} pastes from database`);
        
        // Output full IDs for debugging
        console.log('Paste IDs:', publicPastes.map(p => p.id));
        
        if (publicPastes.length === 0 && inMemoryPastes.length > 0) {
          // If database returned no pastes but we have in-memory pastes, use those
          console.log('No pastes in database, falling back to in-memory pastes');
          if (!ALLOW_FALLBACK) {
            console.error('Database query failed in production, aborting request');
            return res.status(503).json({ message: 'Database unavailable' });
          }
        } else {
          // Return database results
          return res.status(200).json(
            publicPastes.map(paste => ({
              id: paste.id,
              title: paste.title,
              content: paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content,
              createdAt: paste.createdAt,
              expiresAt: paste.expiresAt,
              views: paste.views,
              customUrl: paste.customUrl,
              storageType: 'database'
            }))
          );
        }
      } catch (error) {
        console.error('Database query failed:', error);
        if (error.original) {
          console.error('Original error:', error.original.message);
        }
        // Try to restore pastes from database
        await restorePastesFromDatabase();
      }
    }
    
    // In-memory implementation (fallback)
    const publicPastes = inMemoryPastes
      .filter(paste => 
        !paste.isPrivate && 
        (!paste.expiresAt || paste.expiresAt > now)
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
      .map(paste => ({
        id: paste.id,
        title: paste.title,
        content: paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content,
        createdAt: paste.createdAt,
        expiresAt: paste.expiresAt,
        views: paste.views,
        customUrl: paste.customUrl,
        storageType: 'memory'
      }));
    
    console.log(`Retrieved ${publicPastes.length} pastes from memory`);
    
    return res.status(200).json(publicPastes);
  } catch (error) {
    console.error('Get pastes error:', error);
    return res.status(500).json({ message: 'Server error retrieving pastes' });
  }
});

// Get a paste by ID or custom URL
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    
    console.log(`GET /api/pastes/${id} - Retrieving paste, mode: ${useDatabase ? 'database' : 'in-memory'}`);
    
    if (useDatabase) {
      try {
        // First, attempt to find by ID
        let paste = await Paste.findByPk(id, {
          include: [File]
        });
        
        // If not found by ID, try by customUrl
        if (!paste) {
          paste = await Paste.findOne({
            where: { customUrl: id },
            include: [File]
          });
        }
        
        // If found, check expiration
        if (paste) {
          // Only check expiration if expiresAt is not null
          if (paste.expiresAt && new Date(paste.expiresAt) < now) {
            console.log(`Paste ${paste.id} has expired`);
            return res.status(404).json({ message: 'Paste has expired' });
          }
          
          // Increment views and save (with retry logic)
          let retries = 3;
          while (retries > 0) {
            try {
              paste.views += 1;
              await paste.save();
              break; // Success, exit the retry loop
            } catch (saveError) {
              retries--;
              if (retries === 0) {
                console.error('Failed to update views after multiple attempts:', saveError);
              } else {
                console.log(`Retrying view update, attempts left: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
              }
            }
          }
          
          // Log detailed information about the paste and its files
          console.log(`Retrieved paste ${paste.id} with ${paste.Files ? paste.Files.length : 0} files`);
          if (paste.Files && paste.Files.length > 0) {
            console.log('Files:', paste.Files.map(f => ({ id: f.id, name: f.filename, size: f.size })));
          }
          
          return res.status(200).json({
            paste: {
              id: paste.id,
              title: paste.title,
              content: paste.content,
              expiresAt: paste.expiresAt,
              isPrivate: paste.isPrivate,
              isEditable: paste.isEditable,
              customUrl: paste.customUrl,
              createdAt: paste.createdAt,
              views: paste.views,
              user: null,
              files: paste.Files ? paste.Files.map(f => ({
                id: f.id,
                filename: f.originalname,
                size: f.size,
                url: `/api/pastes/${paste.id}/files/${f.id}`
              })) : [],
              canEdit: paste.isEditable,
              storageType: 'database'
            }
          });
        } else {
          console.log(`Paste not found in database: ${id}`);
        }
      } catch (error) {
        console.error('Database query failed:', error);
        if (error.original) {
          console.error('Original error:', error.original.message);
        }
        // Try to restore pastes from database
        await restorePastesFromDatabase();
      }
    }
    
    // In-memory implementation (fallback)
    const paste = inMemoryPastes.find(p => 
      (p.id === id || p.customUrl === id) && 
      (!p.expiresAt || p.expiresAt > now)
    );
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found or has expired' });
    }
    
    // Increment views
    paste.views += 1;
    paste.updatedAt = new Date();
    
    return res.status(200).json({
      paste: {
        id: paste.id,
        title: paste.title,
        content: paste.content,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
        views: paste.views,
        user: null,
        files: paste.files.map(f => ({
          id: f.id,
          filename: f.originalname,
          size: f.size,
          url: `/api/pastes/${paste.id}/files/${f.id}`
        })),
        canEdit: paste.isEditable
      }
    });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({ message: 'Server error retrieving paste' });
  }
});

// Edit a paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const now = new Date();
    
    if (useDatabase) {
      try {
        // Find by ID or custom URL (database version)
        const paste = await Paste.findOne({
          where: {
            [Sequelize.Op.or]: [
              { id },
              { customUrl: id }
            ],
            [Sequelize.Op.or]: [
              { expiresAt: null },
              { expiresAt: { [Sequelize.Op.gt]: now } }
            ]
          }
        });
        
        if (paste) {
          // Check if editable
          if (!paste.isEditable) {
            return res.status(403).json({ message: 'This paste is not editable' });
          }
          
          // Update paste
          if (title) paste.title = title;
          if (content) paste.content = content;
          await paste.save();
          
          return res.status(200).json({
            message: 'Paste updated successfully',
            paste: {
              id: paste.id,
              title: paste.title,
              content: paste.content,
              expiresAt: paste.expiresAt,
              isPrivate: paste.isPrivate,
              isEditable: paste.isEditable,
              customUrl: paste.customUrl,
              createdAt: paste.createdAt,
              updatedAt: paste.updatedAt,
              views: paste.views
            }
          });
        }
      } catch (error) {
        console.error('Database query failed:', error);
        // Try to restore pastes from database
        await restorePastesFromDatabase();
      }
    }
    
    // In-memory implementation (fallback)
    const pasteIndex = inMemoryPastes.findIndex(p => 
      (p.id === id || p.customUrl === id) && 
      (!p.expiresAt || p.expiresAt > now)
    );
    
    if (pasteIndex === -1) {
      return res.status(404).json({ message: 'Paste not found or has expired' });
    }
    
    const paste = inMemoryPastes[pasteIndex];
    
    // Check if editable
    if (!paste.isEditable) {
      return res.status(403).json({ message: 'This paste is not editable' });
    }
    
    // Update paste
    if (title) paste.title = title;
    if (content) paste.content = content;
    paste.updatedAt = new Date();
    
    return res.status(200).json({
      message: 'Paste updated successfully (in-memory mode)',
      paste: {
        id: paste.id,
        title: paste.title,
        content: paste.content,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
        updatedAt: paste.updatedAt,
        views: paste.views
      }
    });
  } catch (error) {
    console.error('Update paste error:', error);
    return res.status(500).json({ message: 'Server error updating paste' });
  }
});

// Get file by ID
router.get('/:pasteId/files/:fileId', async (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    
    console.log(`GET /api/pastes/${pasteId}/files/${fileId} - Retrieving file`);
    
    if (useDatabase) {
      try {
        // First try with a simpler query to avoid join issues
        const file = await File.findOne({
          where: { 
            id: fileId,
            pasteId: pasteId
          }
        });
        
        if (file) {
          console.log(`Found file ${fileId} for paste ${pasteId}`);
          
          // Convert base64 back to buffer
          const fileBuffer = Buffer.from(file.content, 'base64');
          
          res.setHeader('Content-Type', file.mimetype);
          res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
          return res.send(fileBuffer);
        } else {
          console.log(`File not found in database: ${fileId} for paste ${pasteId}`);
        }
      } catch (error) {
        console.error('Database query failed:', error);
        // Try to restore pastes from database
        await restorePastesFromDatabase();
      }
    }
    
    // In-memory implementation (fallback)
    const paste = inMemoryPastes.find(p => p.id === pasteId);
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    const file = paste.files.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Convert base64 back to buffer
    const fileBuffer = Buffer.from(file.content, 'base64');
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
    return res.send(fileBuffer);
  } catch (error) {
    console.error('Get file error:', error);
    return res.status(500).json({ message: 'Server error retrieving file' });
  }
});

// Export database status
router.getDatabaseStatus = function() {
  return {
    isConnected: useDatabase,
    mode: useDatabase ? 'PostgreSQL' : 'In-Memory',
    details: {
      initialized: !!sequelize,
      modelsLoaded: !!(Paste && File),
      lastConnectionAttempt: new Date(lastConnectionAttempt).toISOString(),
      inMemoryPastesCount: inMemoryPastes.length
    }
  };
};

// Expose inMemoryPastes for diagnostics
router.inMemoryPastes = inMemoryPastes;

// Expose dbReady function
router.dbReady = dbReady;

// Update connection handling to check all possible database URLs
async function ensureConnection() {
  // Try to initialize if not already done
  if (!sequelize) {
    return initializeDatabase();
  }
  
  try {
    // Simple connection check with no retries
    await sequelize.authenticate({ retry: false });
    useDatabase = true;
    return true;
  } catch (err) {
    console.error('Database check failed:', err.message);
    
    // Check if we should try to reinitialize with a different connection string
    const connectionString = getPossibleDatabaseUrl();
    if (connectionString) {
      console.log('Attempting to reconnect with available connection string');
      initializeDatabase();
    }
    
    useDatabase = false;
    return false;
  }
}

// Add health check endpoint with detailed diagnostics
router.get('/health', async (req, res) => {
  try {
    const dbStatus = await dbReady();
    
    // Get all potential database environment variables (safely)
    const dbEnvVars = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING']
      .map(varName => {
        if (process.env[varName]) {
          const url = process.env[varName];
          const parts = url.split('@');
          if (parts.length > 1) {
            return { 
              name: varName, 
              available: true,
              masked: `[credentials hidden]@${parts[1]}`,
              pooled: parts[1].includes('pooler')
            };
          }
          return { name: varName, available: true, masked: '[invalid format]', pooled: false };
        }
        return { name: varName, available: false };
      });
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV,
        vercel_env: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION || 'unknown'
      },
      database: {
        status: dbStatus ? 'connected' : 'disconnected',
        mode: useDatabase ? 'PostgreSQL' : 'In-Memory',
        lastConnectionAttempt: new Date(lastConnectionAttempt).toISOString(),
        connectionVariables: dbEnvVars
      },
      cache: {
        inMemoryPastes: inMemoryPastes.length
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function dbReady () {
  try {
    await sequelize.authenticate();   // inexpensive ping
    return true;
  } catch { return false; }
}

module.exports = router; 