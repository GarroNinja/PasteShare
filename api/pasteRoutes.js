// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

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
const connectionRetryInterval = 60000; // 1 minute

function initializeDatabase() {
  // Don't retry connection too frequently
  const now = Date.now();
  if (now - lastConnectionAttempt < connectionRetryInterval && lastConnectionAttempt !== 0) {
    console.log(`Skipping connection attempt, last attempt was ${Math.round((now - lastConnectionAttempt) / 1000)}s ago`);
    return;
  }
  
  lastConnectionAttempt = now;
  
  try {
    // Log database connection attempt with more details
    if (process.env.DATABASE_URL) {
      // Safely log part of the connection string for debugging
      const urlParts = process.env.DATABASE_URL.split('@');
      if (urlParts.length > 1) {
        console.log('Attempting to connect to:', `[credentials hidden]@${urlParts[1]}`);
      } else {
        console.log('DATABASE_URL is set but has unexpected format');
      }
    } else {
      console.log('DATABASE_URL is not set, will attempt localhost connection');
    }

    // Initialize DB connection with better configuration for Supabase
    sequelize = new Sequelize(
      process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pasteshare',
      {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          },
          keepAlive: true
        },
        pool: {
          max: 2, // Reduced pool size for serverless
          min: 0,
          idle: 5000, // Reduced idle time
          acquire: 15000,
          evict: 1000
        },
        retry: {
          max: 3,
          timeout: 10000
        },
        logging: false,
        benchmark: true // To measure query times
      }
    );

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
    });

    // Define associations
    Paste.hasMany(File, { onDelete: 'CASCADE' });
    File.belongsTo(Paste);

    // Test database connection and sync
    (async () => {
      try {
        await sequelize.authenticate();
        console.log('Database connection established successfully');
        
        // Force sync in development only
        const forceSync = process.env.NODE_ENV === 'development' && process.env.FORCE_SYNC === 'true';
        await sequelize.sync({ force: forceSync });
        console.log(`Database tables synchronized successfully (force: ${forceSync})`);
        
        // Test a simple query to validate connection
        const count = await Paste.count();
        console.log(`Database has ${count} pastes`);
        
        // Only set useDatabase to true if everything succeeded
        useDatabase = true;
        console.log('Database is now being used for storage');
      } catch (error) {
        console.error('Database connection or sync failed:', error.message);
        if (error.original) {
          console.error('Original error:', error.original.message);
          console.error('Error code:', error.original.code);
        }
        useDatabase = false;
        console.log('Falling back to in-memory storage');
      }
    })();
    
  } catch (error) {
    console.error('Error setting up database:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    useDatabase = false;
    console.log('Falling back to in-memory storage due to setup error');
  }
}

// Initialize database connection
initializeDatabase();

// Middleware to check database connection before each request
router.use((req, res, next) => {
  // If we're not using the database, try to initialize it again
  // This will respect the retry interval
  if (!useDatabase) {
    initializeDatabase();
  }
  next();
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
      try {
        // Check if custom URL is taken (database version)
        if (customUrl) {
          const existingPaste = await Paste.findOne({ where: { customUrl } });
          if (existingPaste) {
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
        });
        
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
              PasteId: paste.id
            });
            fileRecords.push(fileRecord);
          }
        }
        
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
        console.error('Database operation failed:', error);
        useDatabase = false;
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
    
    if (useDatabase) {
      try {
        const publicPastes = await Paste.findAll({
          where: {
            isPrivate: false,
            [Op.or]: [
              { expiresAt: null },
              { expiresAt: { [Op.gt]: now } }
            ]
          },
          order: [['createdAt', 'DESC']],
          limit
        });
        
        console.log(`Retrieved ${publicPastes.length} pastes from database`);
        
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
      } catch (error) {
        console.error('Database query failed:', error);
        useDatabase = false;
        // Fall through to in-memory implementation
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
          },
          include: [File]
        });
        
        if (paste) {
          // Increment views
          paste.views += 1;
          await paste.save();
          
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
              canEdit: paste.isEditable
            }
          });
        }
        // If paste not found in database, fall through to in-memory check
      } catch (error) {
        console.error('Database query failed:', error);
        useDatabase = false;
        // Fall through to in-memory implementation
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
        // If paste not found in database, fall through to in-memory check
      } catch (error) {
        console.error('Database query failed:', error);
        useDatabase = false;
        // Fall through to in-memory implementation
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
    
    if (useDatabase) {
      try {
        const file = await File.findOne({
          where: { id: fileId },
          include: [
            {
              model: Paste,
              where: { id: pasteId }
            }
          ]
        });
        
        if (file) {
          // Convert base64 back to buffer
          const fileBuffer = Buffer.from(file.content, 'base64');
          
          res.setHeader('Content-Type', file.mimetype);
          res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
          return res.send(fileBuffer);
        }
        // If file not found in database, fall through to in-memory check
      } catch (error) {
        console.error('Database query failed:', error);
        useDatabase = false;
        // Fall through to in-memory implementation
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
      lastConnectionAttempt: new Date(lastConnectionAttempt).toISOString()
    }
  };
};

module.exports = router; 