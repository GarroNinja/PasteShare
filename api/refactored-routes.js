// Simplified paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Op } = require('sequelize');

// Import database models
const { sequelize, Paste, File, testConnection } = require('./simplified-db');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Connection check middleware
router.use(async (req, res, next) => {
  // Skip for OPTIONS requests (pre-flight CORS)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  console.log(`${req.method} ${req.path} - Checking database`);
  
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: 'Database configuration error: DATABASE_URL not set'
    });
  }
  
  try {
    const connected = await testConnection();
    if (!connected) {
      return res.status(503).json({
        error: 'Database connection failed'
      });
    }
    next();
  } catch (error) {
    console.error('Database error:', error);
    return res.status(503).json({
      error: 'Database error'
    });
  }
});

// Create a new paste
router.post('/', upload.array('files', 5), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Calculate expiration date if provided
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
    // Check for custom URL uniqueness
    if (customUrl) {
      const existing = await Paste.findOne({ 
        where: { customUrl },
        transaction
      });
      
      if (existing) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Custom URL is already taken' });
      }
    }
    
    // Create paste
    const paste = await Paste.create({
      title: title || 'Untitled Paste',
      content,
      expiresAt,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      isEditable: isEditable === 'true' || isEditable === true,
      customUrl: customUrl || null
    }, { transaction });
    
    // Handle attached files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await File.create({
          filename: file.originalname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          content: file.buffer.toString('base64'),
          pasteId: paste.id
        }, { transaction });
      }
    }
    
    await transaction.commit();
    
    return res.status(201).json({
      id: paste.id,
      title: paste.title,
      customUrl: paste.customUrl
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create paste error:', error);
    return res.status(500).json({ error: 'Failed to create paste' });
  }
});

// Get all recent public pastes
router.get('/', async (req, res) => {
  try {
    const pastes = await Paste.findAll({
      where: {
        isPrivate: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 20,
      attributes: ['id', 'title', 'content', 'createdAt', 'customUrl', 'views']
    });
    
    return res.json(pastes.map(paste => ({
      id: paste.id,
      title: paste.title,
      content: paste.content.length > 200 ? paste.content.substring(0, 200) + '...' : paste.content,
      createdAt: paste.createdAt,
      customUrl: paste.customUrl,
      views: paste.views
    })));
  } catch (error) {
    console.error('Get pastes error:', error);
    return res.status(500).json({ error: 'Failed to retrieve pastes' });
  }
});

// Get a paste by ID or custom URL
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const paste = await Paste.findOne({
      where: {
        [Op.or]: [
          { id },
          { customUrl: id }
        ],
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [{
        model: File,
        as: 'Files',
        attributes: ['id', 'filename', 'mimetype', 'size']
      }]
    });
    
    if (!paste) {
      return res.status(404).json({ error: 'Paste not found' });
    }
    
    // Increment views counter
    await paste.increment('views');
    
    return res.json({
      id: paste.id,
      title: paste.title,
      content: paste.content,
      createdAt: paste.createdAt,
      expiresAt: paste.expiresAt,
      isPrivate: paste.isPrivate,
      isEditable: paste.isEditable,
      customUrl: paste.customUrl,
      views: paste.views + 1, // Add 1 to reflect the increment we just did
      files: paste.Files.map(file => ({
        id: file.id,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        url: `/api/pastes/${paste.id}/files/${file.id}`
      }))
    });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({ error: 'Failed to retrieve paste' });
  }
});

// Get file by ID
router.get('/:pasteId/files/:fileId', async (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    
    const file = await File.findOne({
      where: {
        id: fileId,
        pasteId: pasteId
      }
    });
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Convert base64 back to buffer
    const fileBuffer = Buffer.from(file.content, 'base64');
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
    return res.send(fileBuffer);
  } catch (error) {
    console.error('Get file error:', error);
    return res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// Update a paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    
    const paste = await Paste.findOne({
      where: {
        [Op.or]: [
          { id },
          { customUrl: id }
        ],
        isEditable: true
      }
    });
    
    if (!paste) {
      return res.status(404).json({ error: 'Paste not found or not editable' });
    }
    
    // Update fields
    if (title) paste.title = title;
    if (content) paste.content = content;
    
    await paste.save();
    
    return res.json({
      id: paste.id,
      title: paste.title,
      updatedAt: paste.updatedAt
    });
  } catch (error) {
    console.error('Update paste error:', error);
    return res.status(500).json({ error: 'Failed to update paste' });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    
    res.json({
      status: 'ok',
      database: dbStatus ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router; 