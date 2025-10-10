// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createConnection, Op } = require('./db');
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

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

// Database connection is handled by server.js middleware
// No need for duplicate middleware here



// GET /api/pastes/recent - Get recent pastes with pagination
// IMPORTANT: This route must be defined BEFORE the /:id route to avoid conflicts
router.get('/recent', async (req, res) => {
  try {
    if (!req.db || !req.db.success) {
      return res.status(503).json({ 
        message: 'Database connection error',
        details: 'Could not establish database connection'
      });
    }
    
    const { sequelize, models } = req.db;
    
    // Validate models are available
    if (!models || !models.Paste || !models.Block) {
      return res.status(500).json({ 
        message: 'Server configuration error',
        details: 'Database models not properly initialized'
      });
    }
    
    const { Paste, Block } = models;
    
    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5; // Fixed at 5 pastes per page as requested
    const offset = (page - 1) * limit;
    
    // Get recent public pastes with try/catch for the query itself
    try {
      // First, get the total count for pagination
      const totalCount = await Paste.count({
        where: {
          isPrivate: false,
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: new Date() } }
          ]
        }
      });
      
      const totalPages = Math.ceil(totalCount / limit);
      
      const pastes = await Paste.findAll({
        where: {
          isPrivate: false,
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: new Date() } }
          ]
        },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        include: [
          {
            model: Block,
            as: 'Blocks',
            attributes: ['id', 'content', 'language', 'order'],
            required: false
          }
        ]
      });
      
      // Format pastes for response with additional error handling
      const formattedPastes = pastes.map(paste => {
        try {
          const isPasswordProtected = paste.isPasswordProtected();
          
          // For password-protected pastes, don't show content in preview
          let content = '';
          let blocks = [];
          
          if (!isPasswordProtected) {
            if (paste.isJupyterStyle()) {
              // For Jupyter-style pastes, show first block content as preview
              const pasteBlocks = Array.isArray(paste.Blocks) ? paste.Blocks : [];
              if (pasteBlocks.length > 0) {
                const firstBlock = pasteBlocks[0];
                content = firstBlock.content ? 
                  (firstBlock.content.length > 200 ? `${firstBlock.content.slice(0, 200)}...` : firstBlock.content) : '';
              }
              blocks = pasteBlocks.map(block => ({
                id: block.id,
                content: block.content || '',
                language: block.language || 'text',
                order: block.order || 0
              }));
            } else {
              // For standard pastes, show truncated content
              const fullContent = paste.content || '';
              content = fullContent.length > 200 ? `${fullContent.slice(0, 200)}...` : fullContent;
            }
          }
          
          return {
            id: paste.id,
            title: paste.title || 'Untitled Paste',
            content,
            createdAt: paste.createdAt,
            expiresAt: paste.expiresAt,
            customUrl: paste.customUrl,
            isJupyterStyle: paste.isJupyterStyle(),
            isPasswordProtected,
            blocks
          };
        } catch (formatError) {
          console.error('Error formatting paste:', formatError, paste?.id);
          // Return a simplified version if there's an error
          return {
            id: paste.id || 'unknown',
            title: paste.title || 'Error: Malformed Paste',
            content: '',
            createdAt: paste.createdAt || new Date(),
            isJupyterStyle: false,
            isPasswordProtected: false,
            blocks: []
          };
        }
      });
      
      return res.status(200).json({ 
        pastes: formattedPastes,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (queryError) {
      console.error('Database query error in /recent route:', queryError);
      return res.status(500).json({
        message: 'Error retrieving recent pastes',
        details: queryError.message
      });
    }
  } catch (error) {
    console.error('Unhandled error in /recent route:', error);
    return res.status(500).json({
      message: 'Server error retrieving recent pastes',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Cleanup function for expired pastes
const cleanupExpiredPastes = async (db) => {
  try {
    if (!db || !db.success) {
      console.error('Database connection not available for cleanup');
      return { success: false, error: 'Database connection error' };
    }

    const { sequelize, models } = db;
    const { Paste, Block, File } = models;

    console.log('Starting cleanup of expired pastes...');

    // Find all expired pastes
    const expiredPastes = await Paste.findAll({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        }
      },
      include: [
        {
          model: Block,
          as: 'Blocks',
          required: false
        },
        {
          model: File,
          as: 'Files',
          required: false
        }
      ]
    });

    if (expiredPastes.length === 0) {
      console.log('No expired pastes found');
      return { success: true, deletedCount: 0 };
    }

    console.log(`Found ${expiredPastes.length} expired pastes to delete`);

    // Start transaction for cleanup
    const transaction = await sequelize.transaction();
    
    try {
      let deletedCount = 0;

      for (const paste of expiredPastes) {
        try {
          // Delete associated blocks
          if (paste.Blocks && paste.Blocks.length > 0) {
            await Block.destroy({
              where: { pasteId: paste.id },
          transaction
        });
          }

          // Delete associated files
          if (paste.Files && paste.Files.length > 0) {
            await File.destroy({
              where: { pasteId: paste.id },
              transaction
            });
          }

          // Delete the paste itself
          await paste.destroy({ transaction });
          deletedCount++;

          console.log(`Deleted expired paste: ${paste.id} (expired: ${paste.expiresAt})`);
        } catch (deleteError) {
          console.error(`Error deleting paste ${paste.id}:`, deleteError);
          // Continue with other pastes even if one fails
        }
      }

      await transaction.commit();
      console.log(`Cleanup completed. Deleted ${deletedCount} expired pastes.`);
      
      return { success: true, deletedCount };
    } catch (transactionError) {
          await transaction.rollback();
      console.error('Transaction error during cleanup:', transactionError);
      return { success: false, error: transactionError.message };
    }
  } catch (error) {
    console.error('Error during expired pastes cleanup:', error);
    return { success: false, error: error.message };
  }
};

// GET /api/pastes/cleanup - Manual cleanup endpoint (for admin use)
router.get('/cleanup', async (req, res) => {
  try {
    const result = await cleanupExpiredPastes(req.db);
    
    if (result.success) {
      return res.status(200).json({
        message: 'Cleanup completed successfully',
        deletedCount: result.deletedCount
      });
    } else {
      return res.status(500).json({
        message: 'Cleanup failed',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in cleanup endpoint:', error);
    return res.status(500).json({
      message: 'Server error during cleanup',
      error: error.message
    });
  }
});

// Schedule automatic cleanup every hour
setInterval(async () => {
  try {
    // We need to get a database connection for the cleanup
    // This is a bit tricky since we don't have req.db here
    // We'll need to create a connection manually
    const dbConnection = require('./db');
    const db = await dbConnection();
    
    if (db.success) {
      await cleanupExpiredPastes(db);
    } else {
      console.error('Could not establish database connection for scheduled cleanup');
    }
  } catch (error) {
    console.error('Error in scheduled cleanup:', error);
  }
}, 60 * 60 * 1000); // Run every hour

// POST /api/pastes - Create a new paste
// Rate limit: 10 pastes per minute per IP (applied via middleware)
router.post('/', (req, res, next) => {
  // Apply stricter rate limit for paste creation
  const createPasteLimiter = req.app.locals.rateLimiters?.createPasteLimiter;
  if (createPasteLimiter) {
    return createPasteLimiter(req, res, next);
  }
  next();
}, upload.array('files', 3), async (req, res) => {
  try {
    console.log('[CREATE-PASTE] Paste creation started');
    const { title, content, expiresIn, isPrivate, customUrl, isEditable, password, isJupyterStyle, blocks } = req.body;
    
    // Determine if this is a Jupyter-style paste
    const isJupyterStylePaste = isJupyterStyle === 'true' || isJupyterStyle === true;
    
    // Debug logging for paste creation
    console.log(`[CREATE-PASTE] Creating paste - hasPassword: ${!!password}, isJupyterStyle: ${isJupyterStylePaste}`);
    
    // Validate input
    if (!isJupyterStylePaste && !content) {
      return res.status(400).json({ message: 'Content is required for standard pastes' });
    }
    
    // Parse blocks for Jupyter-style pastes
    let parsedBlocks = [];
    
    if (isJupyterStylePaste) {
      try {
        if (typeof blocks === 'string') {
          try {
            parsedBlocks = JSON.parse(blocks);
          } catch (jsonError) {
            console.error('Error parsing blocks JSON:', jsonError);
            return res.status(400).json({ 
              message: 'Invalid blocks format - could not parse JSON',
              error: jsonError.message
            });
          }
        } else if (Array.isArray(blocks)) {
          parsedBlocks = blocks;
        } else {
          parsedBlocks = [];
        }
        
        // Validate blocks
        if (!Array.isArray(parsedBlocks) || parsedBlocks.length === 0) {
          return res.status(400).json({
            message: 'Jupyter-style paste requires at least one valid block'
          });
        }
      } catch (blockParseError) {
        console.error('Error processing blocks:', blockParseError);
        return res.status(400).json({
          message: 'Error processing blocks',
          error: blockParseError.message
        });
      }
    }
    
    // DB connection
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { sequelize, models } = req.db;
    const { Paste, Block, File } = models;
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + parseInt(expiresIn));
    }
    
    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }
    
    // Start transaction
    const transaction = await sequelize.transaction();
    
    try {
      // Create paste
      const paste = await Paste.create({
        title: title || 'Untitled Paste',
        content: isJupyterStylePaste ? null : content,
        expiresAt: expiresAt,
        isPrivate: isPrivate === 'true' || isPrivate === true,
        isEditable: isEditable === 'true' || isEditable === true,
        customUrl: customUrl || null,
        password: hashedPassword
      }, { transaction });
      
      console.log(`Created paste with ID: ${paste.id}`);
      
      // Process blocks for Jupyter-style paste
      if (isJupyterStylePaste && parsedBlocks.length > 0) {
        const validBlocks = parsedBlocks.filter(block => 
          block && 
          typeof block === 'object' && 
          block.content && 
          block.content.trim() !== ''
        );
        
        if (validBlocks.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: 'No valid blocks found in the request. Each block must have non-empty content.'
          });
        }
        
        try {
          const blockPromises = validBlocks.map((block, index) => {
            // Generate or validate block ID
            let blockId;
            try {
              blockId = (block.id && typeof block.id === 'string' && 
                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
                ? block.id 
                : uuidv4();
            } catch (idError) {
              console.error('Error processing block ID, generating new one:', idError);
              blockId = uuidv4();
            }
            
            // Ensure content is a string
            const content = String(block.content || '');
            
            return Block.create({
              id: blockId,
              content: content,
              language: block.language || 'text',
              order: index,
              pasteId: paste.id
            }, { transaction });
          });
          
          await Promise.all(blockPromises);
        } catch (blockError) {
          console.error('Error creating blocks:', blockError);
          await transaction.rollback();
          return res.status(500).json({ 
            message: 'Error creating blocks for Jupyter-style paste',
            error: blockError.message
          });
        }
      }
      
      // Handle file uploads
      const files = req.files || [];
      if (files.length > 0) {
        const filePromises = files.map(file => {
          return File.create({
            id: uuidv4(),
              filename: file.originalname,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            content: file.buffer.toString('base64'),
              pasteId: paste.id
          }, { transaction });
        });
        
        await Promise.all(filePromises);
      }
      
      await transaction.commit();
      
      // Fetch created blocks for response
      let blockRecords = [];
      if (isJupyterStylePaste) {
        blockRecords = await Block.findAll({
          where: { pasteId: paste.id },
          order: [['order', 'ASC']]
        });
      }
      
      // Fetch created files for response
      const fileRecords = await File.findAll({
        where: { pasteId: paste.id }
      });
      
      // Format file records for response
      const formattedFiles = fileRecords.map(file => ({
        id: file.id,
        filename: file.originalname,
        size: file.size,
        url: `/api/pastes/${paste.id}/files/${file.id}`
      }));
      
      return res.status(201).json({
        message: 'Paste created successfully',
        paste: {
          id: paste.id,
          title: paste.title,
          content: isJupyterStylePaste ? '' : paste.content,
          expiresAt: paste.expiresAt,
          isPrivate: paste.isPrivate,
          isEditable: paste.isEditable,
          customUrl: paste.customUrl,
          createdAt: paste.createdAt,
          isPasswordProtected: !!paste.password,
          isJupyterStyle: isJupyterStylePaste,
          blocks: blockRecords.map(block => ({
            id: block.id,
            content: block.content,
            language: block.language,
            order: block.order
          })),
          files: formattedFiles
        }
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({
      message: 'Server error creating paste',
      error: error.message
    });
  }
});

// GET /api/raw/:id - Get raw paste content (plain text) for curl/terminal access
router.get('/raw/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;
    
    console.log(`Get raw paste request for ID/URL: ${id}`);
    
    if (!req.db || !req.db.success) {
      return res.status(503).send('Database connection error');
    }
    
    const { models } = req.db;
    const { Paste, Block } = models;
    
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
    
    // Return raw content as plain text with newline for proper terminal display
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send((paste.content || '') + '\n');
    
  } catch (error) {
    console.error('Get raw paste error:', error);
    res.status(500).send('Server error retrieving paste');
  }
});

// GET /api/pastes/check-url/:url - Check if custom URL is available
router.get('/check-url/:url', async (req, res) => {
  try {
    console.log(`[CHECK-URL ROUTE] Hit with params:`, req.params, `URL: ${req.url}`);
    const { url } = req.params;
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { models } = req.db;
    const { Paste } = models;
    
    // Check if URL already exists
    const existingPaste = await Paste.findOne({
      where: { customUrl: url }
    });
    
    const isAvailable = !existingPaste;
    
    return res.status(200).json({ 
      available: isAvailable,
      url: url
    });
  } catch (error) {
    console.error('Check URL error:', error);
    return res.status(500).json({
      message: 'Error checking URL availability',
      error: error.message
    });
  }
});

// GET /api/pastes/:id - Get a paste by ID or custom URL
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;
    
    console.log(`Get paste request for ID/URL: ${id}`);
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { sequelize, models } = req.db;
    const { Paste, Block, File } = models;
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Find paste by ID or custom URL
    const paste = await Paste.findOne({
      where: isValidUUID 
        ? { [Op.or]: [{ id }, { customUrl: id }] }
        : { customUrl: id },
      include: [
        {
          model: File,
          as: 'Files',
          attributes: ['id', 'originalname', 'size', 'mimetype']
        },
        {
          model: Block,
          as: 'Blocks',
          attributes: ['id', 'content', 'language', 'order']
        }
      ]
    });
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    // Check if paste has expired
    if (paste.expiresAt && new Date() > new Date(paste.expiresAt)) {
      return res.status(404).json({ message: 'Paste has expired' });
    }
    
    // Check password if paste is password-protected
    if (paste.password) {
      console.log(`[GET-PASTE] Paste is password protected, password provided: ${!!password}`);
      
      // If no password provided, return limited info
      if (!password) {
        return res.status(403).json({
          message: 'Password required',
          pasteInfo: {
        id: paste.id,
        title: paste.title,
            isPasswordProtected: true,
        customUrl: paste.customUrl
          }
        });
      }
      
      // Verify password
      try {
        const isPasswordValid = await bcrypt.compare(password, paste.password);
        console.log(`[GET-PASTE] Password verification result: ${isPasswordValid}`);
        
        if (!isPasswordValid) {
          return res.status(403).json({ message: 'Invalid password' });
        }
        
        // Password is valid, continue to return paste data below
        console.log(`[GET-PASTE] Password verified, proceeding to return paste data`);
      } catch (bcryptError) {
        console.error('[GET-PASTE] bcrypt compare error:', bcryptError);
        return res.status(500).json({
          message: 'Server error verifying password',
          error: 'Error comparing passwords'
        });
      }
    }
    
    // Increment view count
    paste.views = (paste.views || 0) + 1;
      await paste.save();
    
    // Format files for response
    const files = paste.Files ? paste.Files.map(file => ({
      id: file.id,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/api/pastes/${paste.id}/files/${file.id}`
    })) : [];
    
    // Format blocks for response
    const blocks = paste.Blocks ? paste.Blocks.map(block => ({
      id: block.id,
      content: block.content,
      language: block.language,
      order: block.order
    })) : [];
    
    // Sort blocks by order
    blocks.sort((a, b) => a.order - b.order);
      
      return res.status(200).json({
        paste: {
          id: paste.id,
          title: paste.title,
        content: paste.isJupyterStyle() ? '' : paste.content,
          expiresAt: paste.expiresAt,
          isPrivate: paste.isPrivate,
        views: paste.views,
          customUrl: paste.customUrl,
        isEditable: paste.isEditable,
          createdAt: paste.createdAt,
        updatedAt: paste.updatedAt,
        isPasswordProtected: !!paste.password,
        isJupyterStyle: paste.isJupyterStyle(),
        blocks,
        files,
          canEdit: paste.isEditable
        }
      });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({
      message: 'Server error retrieving paste',
      error: error.message
    });
  }
});

// POST /api/pastes/:id/verify-password - Verify paste password
// Rate limit: 5 attempts per minute per IP (prevent brute force)
router.post('/:id/verify-password', (req, res, next) => {
  // Apply strict rate limit for password verification
  const passwordVerifyLimiter = req.app.locals.rateLimiters?.passwordVerifyLimiter;
  if (passwordVerifyLimiter) {
    return passwordVerifyLimiter(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { models } = req.db;
    const { Paste } = models;
    
    if (!Paste) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    
    // Check if the ID is a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let paste;
    try {
      if (isValidUUID) {
        // Try to find by ID first, then by customUrl
        paste = await Paste.findOne({
          where: { id }
        });
        
        if (!paste) {
          paste = await Paste.findOne({
            where: { customUrl: id }
          });
        }
    } else {
        // Only search by customUrl for non-UUID strings
        paste = await Paste.findOne({
          where: { customUrl: id }
        });
      }
    } catch (queryError) {
      console.error(`Database query error:`, queryError);
      return res.status(500).json({
        message: 'Database query error',
        error: queryError.message
      });
    }
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    // Check if paste has expired
    if (paste.expiresAt && new Date() > new Date(paste.expiresAt)) {
      return res.status(404).json({ message: 'Paste has expired' });
    }
    
    // Check if paste is password-protected
    if (!paste.password) {
      return res.status(400).json({ message: 'This paste is not password-protected' });
    }
    
    // Verify password
    try {
      const isPasswordValid = await bcrypt.compare(password, paste.password);
      
      if (!isPasswordValid) {
        return res.status(403).json({ message: 'Invalid password' });
      }
      
      return res.status(200).json({ success: true });
    } catch (bcryptError) {
      console.error('bcrypt compare error:', bcryptError);
      return res.status(500).json({
        message: 'Server error verifying password',
        error: 'Error comparing passwords'
      });
    }
  } catch (error) {
    console.error('Verify password error:', error);
    return res.status(500).json({
      message: 'Server error verifying password',
      error: error.message
    });
  }
});

// GET /api/pastes/:pasteId/files/:fileId - Download a file
router.get('/:pasteId/files/:fileId', async (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { models } = req.db;
    const { Paste, File } = models;
    
    // Find paste
    const paste = await Paste.findByPk(pasteId);
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    // Check if paste has expired
    if (paste.expiresAt && new Date() > new Date(paste.expiresAt)) {
      return res.status(404).json({ message: 'Paste has expired' });
    }
    
    // Find file
    const file = await File.findOne({
      where: { 
        id: fileId,
        pasteId
      }
    });
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalname)}"`);
    
    // Convert base64 content back to binary
    const buffer = Buffer.from(file.content, 'base64');
    
    return res.send(buffer);
  } catch (error) {
    console.error('Download file error:', error);
    return res.status(500).json({
      message: 'Server error downloading file',
      error: error.message
    });
  }
});

// PUT /api/pastes/:id - Update a paste
router.put('/:id', async (req, res) => {
  console.log('--- UPDATE ROUTE CALLED ---');
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    console.log(`Update paste request for ID: ${id}`);
    
    // Check database connection
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { sequelize, models } = req.db;
    const { Paste, Block } = models;
    
    if (!Paste || !Block) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    
    // Check if the ID is a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let paste;
    try {
    if (isValidUUID) {
        // Try to find by ID first, then by customUrl
        paste = await Paste.findOne({
          where: { id },
          include: [
            {
              model: Block,
              as: 'Blocks'
            }
          ]
        });
        
    if (!paste) {
      paste = await Paste.findOne({
            where: { customUrl: id },
            include: [
              {
                model: Block,
                as: 'Blocks'
              }
            ]
          });
        }
      } else {
        // Only search by customUrl for non-UUID strings
        paste = await Paste.findOne({
          where: { customUrl: id },
          include: [
            {
              model: Block,
              as: 'Blocks'
            }
          ]
        });
      }
    } catch (queryError) {
      console.error(`Database query error:`, queryError);
      return res.status(500).json({
        message: 'Database query error',
        error: queryError.message
      });
    }
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    // Check if paste is editable
      if (!paste.isEditable) {
      console.error('Paste not editable');
        return res.status(403).json({ message: 'This paste is not editable' });
      }
      
    // Check if paste has expired
    if (paste.expiresAt && new Date() > new Date(paste.expiresAt)) {
      console.error('Paste expired');
      return res.status(404).json({ message: 'Paste has expired' });
    }
    
    // Process Jupyter-style paste update
    let isJupyterUpdate = false;
    let parsedBlocks = [];
    
    try {
      if (typeof blocks === 'string') {
        try {
          parsedBlocks = JSON.parse(blocks);
          isJupyterUpdate = Array.isArray(parsedBlocks) && parsedBlocks.length > 0;
        } catch (jsonError) {
          console.error('Error parsing blocks JSON:', jsonError);
          return res.status(400).json({ 
            message: 'Invalid blocks format - could not parse JSON',
            error: jsonError.message
          });
        }
      } else if (Array.isArray(blocks)) {
        parsedBlocks = blocks;
        isJupyterUpdate = parsedBlocks.length > 0;
      }
    } catch (e) {
      console.error('Error processing blocks:', e);
      isJupyterUpdate = false;
    }
    
    console.log('isJupyterUpdate:', isJupyterUpdate, 'parsedBlocks length:', parsedBlocks?.length);
    
    // Start transaction
    const transaction = await sequelize.transaction();
    
    try {
      // Update title if provided
      if (title !== undefined) {
        paste.title = title;
        await paste.save({ transaction });
        console.log(`Updated title for paste ${paste.id}`);
      }
      
      if (isJupyterUpdate) {
        console.log('Processing Jupyter-style paste update');
        console.log('Number of blocks received:', parsedBlocks.length);
        
        // Validate blocks before proceeding
        const validBlocks = parsedBlocks.filter(block => 
          block && 
          typeof block === 'object' && 
          block.content && 
          block.content.trim() !== ''
        );
        
        if (validBlocks.length === 0) {
          await transaction.rollback();
          console.error('No valid blocks found in the request');
          return res.status(400).json({ message: 'No valid blocks found in the request' });
        }
        
        console.log('Valid blocks count:', validBlocks.length);
        
        // Delete existing blocks
        await Block.destroy({
          where: { pasteId: paste.id },
          transaction
        });
        
        // Create new blocks
        let insertedBlocks = [];
        try {
          for (let i = 0; i < validBlocks.length; i++) {
            const block = validBlocks[i];
            
            // Validate block structure
            if (!block || typeof block !== 'object') {
              console.error(`Invalid block at index ${i}:`, block);
              continue;
            }
            
            // Generate or validate block ID
            let blockId;
            try {
              blockId = (block.id && typeof block.id === 'string' && 
                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
                ? block.id 
                : uuidv4();
            } catch (idError) {
              console.error('Error processing block ID, generating new one:', idError);
              blockId = uuidv4();
            }
            
            // Ensure content is a string
            const content = String(block.content || '');
            if (!content.trim()) {
              console.warn(`Skipping empty block at index ${i}`);
              continue;
            }
            
            // Create the block with error handling
            try {
              const newBlock = await Block.create({
                id: blockId,
                content: content,
                language: block.language || 'text',
                order: i,
                pasteId: paste.id
              }, { transaction });
              
              insertedBlocks.push(newBlock);
            } catch (blockCreateError) {
              console.error(`Error creating block at index ${i}:`, blockCreateError);
              // Continue with other blocks instead of failing completely
            }
          }
        } catch (blocksError) {
          console.error('Error processing blocks:', blocksError);
          await transaction.rollback();
          return res.status(500).json({ 
            message: 'Error processing blocks for Jupyter-style paste update',
            error: blocksError.message
          });
        }
        
        console.log(`Inserted ${insertedBlocks.length} blocks for paste ${paste.id}`);
        
        if (insertedBlocks.length === 0) {
          await transaction.rollback();
          console.error('No blocks inserted for Jupyter-style paste update!');
          return res.status(500).json({ message: 'No blocks inserted for Jupyter-style paste update.' });
        }
        
        // Update paste to be Jupyter style with empty content
        paste.content = '';
        await paste.save({ transaction });
        
        // Commit the transaction
        await transaction.commit();
        
        // Reload the paste with blocks
        await paste.reload({
          include: [
            {
              model: Block,
              as: 'Blocks'
            }
          ]
        });
        
        // Format blocks for response
        const blockRecords = paste.Blocks ? paste.Blocks.map(block => ({
          id: block.id,
          content: block.content,
          language: block.language,
          order: block.order
        })) : [];
        
        return res.status(200).json({
          message: 'Paste updated successfully',
          paste: {
            id: paste.id,
            title: paste.title,
            content: '',
            expiresAt: paste.expiresAt,
            isPrivate: paste.isPrivate,
            isEditable: paste.isEditable,
            customUrl: paste.customUrl,
            createdAt: paste.createdAt,
            updatedAt: paste.updatedAt,
            isJupyterStyle: true,
            blocks: blockRecords,
            canEdit: paste.isEditable
          }
        });
      } else if (content !== undefined) {
        // Regular paste update
        console.log(`Updating regular paste content for ${paste.id}, length: ${content.length}`);
        paste.content = content;
        await paste.save({ transaction });
        await transaction.commit();
      
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
            isJupyterStyle: false,
            blocks: [],
            canEdit: paste.isEditable
        }
      });
    } else {
        // Only title was updated
        await transaction.commit();
        
        // Get blocks if any
        const blockRecords = paste.Blocks ? paste.Blocks.map(block => ({
          id: block.id,
          content: block.content,
          language: block.language,
          order: block.order
        })) : [];
        
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
            isJupyterStyle: paste.isJupyterStyle(),
            blocks: blockRecords,
            canEdit: paste.isEditable
          }
        });
      }
    } catch (error) {
      try {
        if (transaction) await transaction.rollback();
        console.error('Transaction rolled back due to error:', error.message);
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      return res.status(500).json({
        message: 'Server error updating paste',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Unhandled error in update paste route:', error.message);
    return res.status(500).json({
      message: 'Server error updating paste',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// DELETE /api/pastes/:id - Delete a paste
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { models } = req.db;
    const { Paste } = models;
    
    // Find paste
    const paste = await Paste.findByPk(id);
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    // Delete paste
    await paste.destroy();
    
    return res.status(200).json({ message: 'Paste deleted successfully' });
  } catch (error) {
    console.error('Delete paste error:', error);
    return res.status(500).json({
      message: 'Server error deleting paste',
      error: error.message
    });
  }
});

// Add explicit migration endpoint to force schema updates
router.post('/migrate-schema', async (req, res) => {
  try {
    if (!req.db || !req.db.sequelize) {
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }
    
    const { sequelize } = req.db;
    const migrations = [];
    
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

// Export the router and createConnection for use in server.js
module.exports = router; 
module.exports.createConnection = createConnection; 