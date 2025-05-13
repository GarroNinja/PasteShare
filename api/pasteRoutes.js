// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createConnection, Op } = require('./db');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 3  // Limit to 3 files per request to conserve memory
  },
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

// Middleware to set up database connection for each request
router.use(async (req, res, next) => {
  // Create a fresh database connection for this request
  req.db = createConnection();
  
  if (!req.db.success) {
    return res.status(503).json({
      error: 'Database unavailable',
      message: 'Could not establish database connection'
    });
  }
  
  next();
});

// Test database connection
router.get('/test-connection', async (req, res) => {
  try {
    const testResult = await req.db.testConnection();
    return res.status(200).json({
      success: testResult.connected,
      message: testResult.connected 
        ? 'Database connection successful' 
        : 'Connection test failed',
      error: testResult.error
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
router.post('/', upload.array('files', 3), async (req, res) => {
  try {
    console.log('Paste creation started with request size:', req.get('content-length') || 'unknown');
    const startTime = Date.now();
    
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    
    // Validate input
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    // Early check for file sizes
    if (req.files && req.files.length > 0) {
      let totalFileSize = 0;
      for (const file of req.files) {
        totalFileSize += file.size;
      }
      console.log(`Processing paste with ${req.files.length} files, total size: ${totalFileSize} bytes`);
      
      // If files are too large, return early
      if (totalFileSize > 25 * 1024 * 1024) {
        return res.status(413).json({ 
          message: 'Total file size too large. Maximum combined size is 25MB.'
        });
      }
    }
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
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
      
      // Handle files (if any)
      const fileRecords = [];
      if (req.files && req.files.length > 0) {
        // Create file records one at a time to prevent transaction timeouts with large files
        for (const file of req.files) {
          try {
            console.log(`Processing file: ${file.originalname}, size: ${file.size} bytes`);
            
            // Check file size to prevent timeout on very large files
            if (file.size > 5 * 1024 * 1024) {
              console.log(`Large file detected (${file.size} bytes), processing with optimal settings`);
            }
            
            // Convert buffer to base64 in a safer way for larger files
            const base64Content = file.buffer.toString('base64');
            
            console.log(`File ${file.originalname} converted to base64, creating record...`);
            
            // Create the file record with optimized approach
            const fileRecord = await File.create({
              filename: file.originalname,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              content: base64Content,
              pasteId: paste.id
            }, { 
              transaction,
              // Use individual queries to avoid transaction timeouts
              hooks: false,
              returning: true
            });
            
            fileRecords.push(fileRecord);
            console.log(`File saved successfully: ${fileRecord.id}`);
          } catch (fileError) {
            console.error(`Error processing file ${file.originalname}:`, fileError);
            throw fileError; // Re-throw to rollback the transaction
          }
        }
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
          }))
        }
      });
    } catch (error) {
      // Rollback transaction if there was an error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({ message: 'Server error creating paste', error: error.message });
  }
});

// Get all recent public pastes
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    const { models } = req.db;
    const { Paste } = models;
    
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
    
    return res.status(200).json(
      publicPastes.map(paste => ({
        id: paste.id,
        title: paste.title,
        content: paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content,
        createdAt: paste.createdAt,
        expiresAt: paste.expiresAt,
        views: paste.views,
        customUrl: paste.customUrl
      }))
    );
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
    
    const { models } = req.db;
    const { Paste, File } = models;
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let paste = null;
    
    if (isValidUUID) {
      // If it's a valid UUID, try to find by ID first
      paste = await Paste.findByPk(id, {
        include: [{ model: File, as: 'Files' }]
      });
    }
    
    // If not found or not a UUID, try by customUrl
    if (!paste) {
      paste = await Paste.findOne({
        where: {
          customUrl: id
        },
        include: [{ model: File, as: 'Files' }]
      });
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
          canEdit: paste.isEditable
        }
      });
    } else {
      return res.status(404).json({ message: 'Paste not found' });
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
    
    const { models } = req.db;
    const { File } = models;
    
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
    console.error('Get file error:', error);
    return res.status(500).json({ message: 'Server error retrieving file' });
  }
});

// Edit a paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const now = new Date();
    
    const { models } = req.db;
    const { Paste } = models;
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let paste = null;
    
    if (isValidUUID) {
      // If it's a valid UUID, try to find by ID first
      paste = await Paste.findByPk(id);
    }
    
    // If not found or not a UUID, try by customUrl
    if (!paste) {
      paste = await Paste.findOne({
        where: { customUrl: id }
      });
    }
    
    if (paste) {
      // Check if expired
      if (paste.expiresAt && new Date(paste.expiresAt) < now) {
        return res.status(404).json({ message: 'Paste has expired' });
      }
      
      // Check if editable
      if (!paste.isEditable) {
        return res.status(403).json({ message: 'This paste is not editable' });
      }
      
      // Update paste
      if (title !== undefined) paste.title = title;
      if (content !== undefined) paste.content = content;
      
      // Save changes
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
    } else {
      return res.status(404).json({ message: 'Paste not found' });
    }
  } catch (error) {
    console.error('Update paste error:', error);
    return res.status(500).json({ message: 'Server error updating paste' });
  }
});

// Export the router
module.exports = router; 