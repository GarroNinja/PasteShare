// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Op } = require('sequelize');
const { createConnection } = require('./db');
const { Sequelize } = require('sequelize');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
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

// Initialize in-memory pastes array (fallback for development only)
const inMemoryPastes = [];

// Middleware to set up database connection for each request
router.use(async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Create a fresh database connection for this request
  req.db = createConnection();
  
  if (req.db.success) {
    try {
      // Test connection with a timeout
      const connectionTest = await req.db.testConnection();
      
      if (connectionTest.connected) {
        req.useDatabase = true;
        console.log('Database connection verified for this request');
      } else {
        req.useDatabase = false;
        console.error('Database connection test failed:', connectionTest.error);
        
        // In production, return error instead of falling back
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          return res.status(503).json({
            error: 'Service unavailable',
            message: 'Database connection failed. Please try again later.'
          });
        }
      }
    } catch (error) {
      req.useDatabase = false;
      console.error('Database connection test error:', error.message);
      
      // In production, return error instead of falling back
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Database connection error. Please try again later.'
        });
      }
    }
  } else {
    req.useDatabase = false;
    console.error('Database setup failed:', req.db.error);
    
    // In production, return error instead of falling back
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database configuration error. Please try again later.'
      });
    }
  }
  
  next();
});

// Test database connection
router.get('/test-connection', async (req, res) => {
  if (!req.db || !req.db.success) {
    return res.status(500).json({
      success: false,
      message: 'Database connection not initialized'
    });
  }
  
  try {
    const testResult = await req.db.testConnection();
    
    // Parse DATABASE_URL for debugging info (remove credentials)
    const urlInfo = (() => {
      try {
        const url = new URL(process.env.DATABASE_URL);
        return {
          host: url.hostname,
          port: url.port,
          database: url.pathname.substring(1),
          username: url.username ? '[CONFIGURED]' : '[MISSING]',
          hasPassword: !!url.password,
          ssl: url.searchParams.get('sslmode') || 'default'
        };
      } catch (error) {
        return { error: 'Invalid URL format' };
      }
    })();
    
    return res.status(200).json({
      success: testResult.connected,
      message: testResult.connected 
        ? 'Database connection successful' 
        : 'Connection test failed',
      connection: urlInfo,
      testResult,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isVercel: !!process.env.VERCEL
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error testing connection',
      error: error.message
    });
  }
});

// Create a new paste
router.post('/', upload.array('files', 5), async (req, res) => {
  try {
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    console.log(`Creating paste: ${title || 'Untitled'}, DB mode: ${req.useDatabase}`);
    
    // Validate input
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
    if (req.useDatabase) {
      const { sequelize, models } = req.db;
      const { Paste, File } = models;
      
      // Use transaction for atomicity
      const transaction = await sequelize.transaction();
      
      try {
        // Check if custom URL is taken
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
        
        console.log(`Created paste with ID: ${paste.id}`);
        
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
              content: base64Content,
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
        await transaction.rollback();
        console.error('Database operation failed:', error);
        return res.status(500).json({ 
          message: 'Failed to create paste',
          error: error.message
        });
      }
    } else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      // In-memory implementation (fallback - development only)
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
          content: file.buffer.toString('base64'),
          pasteId: paste.id
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
    } else {
      // Production environment without database connection
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database connection required for this operation'
      });
    }
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
    
    console.log(`Getting recent pastes, DB mode: ${req.useDatabase}`);
    
    if (req.useDatabase) {
      const { models } = req.db;
      const { Paste } = models;
      
      try {
        // Query for recent public pastes
        const publicPastes = await Paste.findAll({
          where: {
            isPrivate: false,
            [Op.or]: [
              { expiresAt: null },
              { expiresAt: { [Op.gt]: now } }
            ]
          },
          order: [['createdAt', 'DESC']],
          limit,
          attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl']
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
        return res.status(500).json({ 
          message: 'Error retrieving pastes from database',
          error: error.message 
        });
      }
    } else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      // In-memory implementation (fallback - development only)
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
    } else {
      // Production environment without database connection
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database connection required for this operation'
      });
    }
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
    
    console.log(`Getting paste by ID/URL: ${id}, DB mode: ${req.useDatabase}`);
    
    if (req.useDatabase) {
      const { models } = req.db;
      const { Paste, File } = models;
      
      try {
        // First, attempt to find by ID
        let paste = await Paste.findByPk(id, {
          include: [
            { 
              model: File,
              as: 'Files'
            }
          ]
        });
        
        // If not found by ID, try by customUrl (case-insensitive)
        if (!paste) {
          console.log(`Paste not found by ID, trying customUrl: ${id}`);
          paste = await Paste.findOne({
            where: {
              // Use case-insensitive comparison with Sequelize's ILIKE (if Postgres)
              // or convert both to lowercase for comparison
              customUrl: Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('customUrl')), 
                Sequelize.fn('LOWER', id)
              )
            },
            include: [
              { 
                model: File,
                as: 'Files'
              }
            ]
          });
          
          if (paste) {
            console.log(`Found paste by customUrl: ${id}, paste ID: ${paste.id}`);
          } else {
            console.log(`No paste found with customUrl: ${id}`);
          }
        }
        
        // If found, check expiration
        if (paste) {
          // Only check expiration if expiresAt is not null
          if (paste.expiresAt && new Date(paste.expiresAt) < now) {
            return res.status(404).json({ message: 'Paste has expired' });
          }
          
          // Increment views and save
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
              canEdit: paste.isEditable,
              storageType: 'database'
            }
          });
        } else {
          return res.status(404).json({ message: 'Paste not found' });
        }
      } catch (error) {
        console.error('Database query failed:', error);
        return res.status(500).json({ 
          message: 'Error retrieving paste from database',
          error: error.message 
        });
      }
    } else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      // In-memory implementation (fallback - development only)
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
          canEdit: paste.isEditable,
          storageType: 'memory'
        }
      });
    } else {
      // Production environment without database connection
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database connection required for this operation'
      });
    }
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({ message: 'Server error retrieving paste' });
  }
});

// Get file by ID
router.get('/:pasteId/files/:fileId', async (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    
    console.log(`Getting file: ${fileId} for paste: ${pasteId}, DB mode: ${req.useDatabase}`);
    
    if (req.useDatabase) {
      const { models } = req.db;
      const { File } = models;
      
      try {
        // Find the file
        const file = await File.findOne({
          where: { 
            id: fileId,
            pasteId: pasteId
          }
        });
        
        if (file) {
          // Convert base64 back to buffer
          const fileBuffer = Buffer.from(file.content, 'base64');
          
          res.setHeader('Content-Type', file.mimetype);
          res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
          return res.send(fileBuffer);
        } else {
          return res.status(404).json({ message: 'File not found' });
        }
      } catch (error) {
        console.error('Database query failed:', error);
        return res.status(500).json({ 
          message: 'Error retrieving file from database',
          error: error.message 
        });
      }
    } else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      // In-memory implementation (fallback - development only)
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
    } else {
      // Production environment without database connection
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database connection required for this operation'
      });
    }
  } catch (error) {
    console.error('Get file error:', error);
    return res.status(500).json({ message: 'Server error retrieving file' });
  }
});

// Export the router
module.exports = router; 