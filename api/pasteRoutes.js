// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createConnection, Op } = require('./db');
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');

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
    console.log('Request body keys:', Object.keys(req.body));
    const startTime = Date.now();
    
    const { title, content, expiresIn, isPrivate, customUrl, isEditable, password, isJupyterStyle, blocks } = req.body;
    
    // Debug Jupyter blocks
    console.log('Creating paste with isJupyterStyle:', isJupyterStyle, typeof isJupyterStyle);
    console.log('isJupyterStyle value is "true"?', isJupyterStyle === 'true');
    console.log('isJupyterStyle value is true?', isJupyterStyle === true);
    
    if (isJupyterStyle === 'true' || isJupyterStyle === true) {
      console.log('Blocks data type:', typeof blocks);
      console.log('Blocks data (first 100 chars):', blocks ? blocks.toString().substring(0, 100) : 'undefined');
      
      if (!blocks) {
        console.error('Missing blocks data for Jupyter-style paste');
        return res.status(400).json({ message: 'Blocks data is required for Jupyter-style pastes' });
      }
    }
    
    // Validate input for standard pastes
    if (isJupyterStyle !== 'true' && isJupyterStyle !== true && !content) {
      return res.status(400).json({ message: 'Content is required for standard pastes' });
    }
    
    // Validate input for Jupyter-style pastes
    let parsedBlocks = [];
    if (isJupyterStyle === 'true' || isJupyterStyle === true) {
      try {
        if (!blocks) {
          return res.status(400).json({ message: 'Blocks are required for Jupyter-style pastes' });
        }
        
        console.log('Attempting to parse blocks:', blocks);
        
        try {
          // Handle blocks data based on its type
          if (typeof blocks === 'object' && !Array.isArray(blocks)) {
            // Single block object
            parsedBlocks = [blocks];
          } else if (Array.isArray(blocks)) {
            // Already parsed as array
            parsedBlocks = blocks;
          } else if (typeof blocks === 'string') {
            // Try to parse as JSON string
            try {
              const parsed = JSON.parse(blocks);
              if (Array.isArray(parsed)) {
                parsedBlocks = parsed;
              } else if (parsed && typeof parsed === 'object') {
                parsedBlocks = [parsed];
              } else {
                throw new Error('Invalid blocks format: Not an array or object');
              }
            } catch (e) {
              console.error('Error parsing blocks JSON:', e);
              return res.status(400).json({ 
                message: 'Invalid blocks format: ' + e.message,
                details: typeof blocks
              });
            }
          } else {
            throw new Error(`Unexpected blocks format: ${typeof blocks}`);
          }
        } catch (parseError) {
          console.error('Error parsing blocks JSON:', parseError);
          return res.status(400).json({ 
            message: 'Invalid blocks format: ' + parseError.message,
            details: typeof blocks
          });
        }
        
        console.log('Parsed blocks:', typeof parsedBlocks, Array.isArray(parsedBlocks), parsedBlocks.length);
        console.log('First block:', parsedBlocks.length > 0 ? JSON.stringify(parsedBlocks[0]) : 'none');
        
        if (!Array.isArray(parsedBlocks)) {
          return res.status(400).json({ 
            message: 'Blocks must be an array',
            details: typeof parsedBlocks
          });
        }
        
        if (parsedBlocks.length === 0) {
          return res.status(400).json({ message: 'At least one valid block is required for Jupyter-style pastes' });
        }
        
        // Validate each block has required properties
        for (const block of parsedBlocks) {
          if (!block.content || typeof block.content !== 'string') {
            return res.status(400).json({ 
              message: 'Each block must have content property as a string',
              blockDetails: JSON.stringify(block)
            });
          }
          
          if (!block.language) {
            block.language = 'text'; // Default to text if language is not specified
          }
          
          if (typeof block.order !== 'number') {
            // If order is missing or not a number, we'll fix it later
            console.log('Block with missing or invalid order:', block);
          }
        }
        
        // Sort blocks by order and fix any missing/invalid orders
        parsedBlocks.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 999;
          const orderB = typeof b.order === 'number' ? b.order : 999;
          return orderA - orderB;
        });
        
        // Reassign orders sequentially
        parsedBlocks = parsedBlocks.map((block, index) => ({
          ...block,
          order: index
        }));
        
        console.log(`Validated ${parsedBlocks.length} blocks for Jupyter paste`);
      } catch (error) {
        console.error('Error processing blocks:', error);
        return res.status(400).json({ 
          message: 'Invalid blocks format: ' + error.message,
          stack: error.stack
        });
      }
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
    const { Paste, File, Block } = models;
    
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
      
      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      
      console.log('Creating paste with isJupyterStyle:', isJupyterStyle === 'true' || isJupyterStyle === true);
      
      // Create paste in database
      const paste = await Paste.create({
        title: title || 'Untitled Paste',
        content: isJupyterStyle === 'true' || isJupyterStyle === true ? null : content, // Only store content for standard pastes
        expiresAt,
        isPrivate: isPrivate === 'true' || isPrivate === true,
        isEditable: isEditable === 'true' || isEditable === true,
        customUrl: customUrl || null,
        userId: null,
        password: hashedPassword,
        isJupyterStyle: isJupyterStyle === 'true' || isJupyterStyle === true
      }, { transaction });
      
      console.log('Paste created with ID:', paste.id, 'isJupyterStyle:', paste.isJupyterStyle);
      
      // Create blocks for Jupyter-style pastes
      const blockRecords = [];
      if (isJupyterStyle === 'true' || isJupyterStyle === true) {
        console.log(`Creating ${parsedBlocks.length} blocks for paste ${paste.id}`);
        
        try {
          // Create blocks with proper ordering
          for (let i = 0; i < parsedBlocks.length; i++) {
            const block = parsedBlocks[i];
            console.log(`Creating block ${i}: language=${block.language}, content preview: ${block.content.substring(0, 30)}`);
            
            // Validate block data
            if (!block.content || typeof block.content !== 'string') {
              console.error(`Invalid block content at index ${i}:`, block);
              continue; // Skip this block rather than failing the whole paste
            }
            
            // Create the block record
            const blockRecord = await Block.create({
              content: block.content,
              language: block.language || 'text',
              order: i,
              pasteId: paste.id
            }, { 
              transaction,
              hooks: false,
              returning: true
            });
            
            console.log(`Block created with ID: ${blockRecord.id}`);
            blockRecords.push(blockRecord);
          }
          
          // Validate that blocks were created
          if (blockRecords.length === 0 && parsedBlocks.length > 0) {
            console.error('Failed to create any blocks despite having valid parsed blocks');
          } else {
            console.log(`Successfully created ${blockRecords.length} blocks`);
          }
        } catch (blockError) {
          console.error('Error creating blocks:', blockError);
          throw blockError; // Re-throw to rollback the transaction
        }
      }
      
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
      
      // Log completion time
      const endTime = Date.now();
      console.log(`Paste creation completed in ${endTime - startTime}ms. ID: ${paste.id}, isJupyterStyle: ${paste.isJupyterStyle}, blocks: ${blockRecords.length}`);
      
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
          isPasswordProtected: !!paste.password,
          isJupyterStyle: paste.isJupyterStyle,
          blocks: blockRecords.map(b => ({
            id: b.id,
            content: b.content,
            language: b.language,
            order: b.order
          })),
          files: req.files ? req.files.map(f => ({
            id: f.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            filename: f.originalname,
            size: f.size,
            url: `/api/pastes/${paste.id}/files/${f.id || 'latest'}`
          })) : []
        }
      });
    } catch (error) {
      // Rollback transaction if there was an error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({ message: 'Server error creating paste', error: error.message, stack: error.stack });
  }
});

// Get all recent public pastes
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    const { models } = req.db;
    const { Paste, Block } = models;
    
    // Query for recent public pastes, including blocks for Jupyter-style pastes
    const publicPastes = await Paste.findAll({
      where: {
        isPrivate: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: now } }
        ]
      },
      include: [
        { model: Block, as: 'Blocks', required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl', 'isJupyterStyle']
    });
    
    return res.status(200).json(
      publicPastes.map(paste => {
        let contentPreview = '';
        
        if (paste.isJupyterStyle && paste.Blocks && paste.Blocks.length > 0) {
          // For Jupyter-style pastes, use the first block's content
          contentPreview = paste.Blocks[0].content || '';
        } else {
          // For regular pastes, use the paste content with null check
          contentPreview = paste.content || '';
        }
        
        // Truncate content preview if needed
        if (contentPreview.length > 200) {
          contentPreview = `${contentPreview.slice(0, 200)}...`;
        }
        
        return {
          id: paste.id,
          title: paste.title,
          content: contentPreview,
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views,
          customUrl: paste.customUrl,
          isJupyterStyle: paste.isJupyterStyle
        };
      })
    );
  } catch (error) {
    console.error('Get pastes error:', error);
    return res.status(500).json({ message: 'Server error retrieving pastes' });
  }
});

// Get recent public pastes - separate endpoint to match client expectations
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    const { models } = req.db;
    const { Paste, Block } = models;
    
    // Query for recent public pastes, including blocks for Jupyter-style pastes
    const publicPastes = await Paste.findAll({
      where: {
        isPrivate: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: now } }
        ]
      },
      include: [
        { model: Block, as: 'Blocks', required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl', 'isJupyterStyle']
    });
    
    return res.status(200).json(
      publicPastes.map(paste => {
        let contentPreview = '';
        
        if (paste.isJupyterStyle && paste.Blocks && paste.Blocks.length > 0) {
          // For Jupyter-style pastes, use the first block's content
          contentPreview = paste.Blocks[0].content || '';
        } else {
          // For regular pastes, use the paste content with null check
          contentPreview = paste.content || '';
        }
        
        // Truncate content preview if needed
        if (contentPreview.length > 200) {
          contentPreview = `${contentPreview.slice(0, 200)}...`;
        }
        
        return {
          id: paste.id,
          title: paste.title,
          content: contentPreview,
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views,
          customUrl: paste.customUrl,
          isJupyterStyle: paste.isJupyterStyle
        };
      })
    );
  } catch (error) {
    console.error('Get recent pastes error:', error);
    return res.status(500).json({ message: 'Server error retrieving recent pastes' });
  }
});

// Get a paste by ID or custom URL
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const password = req.query.password;
    const now = new Date();
    
    const { models, sequelize } = req.db;
    const { Paste, File, Block } = models;
    
    // Use a new transaction for better isolation
    const transaction = await sequelize.transaction({
      isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });
    
    try {
      // Check if the ID is a valid UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let paste = null;
      
      if (isValidUUID) {
        // If it's a valid UUID, try to find by ID first
        paste = await Paste.findByPk(id, {
          include: [
            { model: File, as: 'Files' },
            { model: Block, as: 'Blocks', order: [['order', 'ASC']] }
          ],
          transaction
        });
      }
      
      // If not found or not a UUID, try by customUrl
      if (!paste) {
        paste = await Paste.findOne({
          where: {
            customUrl: id
          },
          include: [
            { model: File, as: 'Files' },
            { model: Block, as: 'Blocks', order: [['order', 'ASC']] }
          ],
          transaction
        });
      }
      
      // If found, check expiration
      if (paste) {
        // Only check expiration if expiresAt is not null
        if (paste.expiresAt && new Date(paste.expiresAt) < now) {
          await transaction.commit();
          return res.status(404).json({ message: 'Paste has expired' });
        }
        
        // Check if paste is password protected
        const isPasswordProtected = !!paste.password;
        
        // If paste is password protected and no password provided, return limited info
        if (isPasswordProtected && !password) {
          await transaction.commit();
          return res.status(403).json({
            message: 'This paste is password protected',
            pasteInfo: {
              id: paste.id,
              title: paste.title,
              isPasswordProtected: true,
              customUrl: paste.customUrl
            }
          });
        }
        
        // If paste is password protected, verify the password
        if (isPasswordProtected && password) {
          const isPasswordValid = await bcrypt.compare(password, paste.password);
          
          if (!isPasswordValid) {
            await transaction.commit();
            return res.status(403).json({
              message: 'Invalid password',
              pasteInfo: {
                id: paste.id,
                title: paste.title,
                isPasswordProtected: true,
                customUrl: paste.customUrl
              }
            });
          }
        }
        
        // Increment views and save - use a separate transaction to avoid conflicts
        try {
          const viewUpdateTransaction = await sequelize.transaction();
          try {
            await Paste.update(
              { views: sequelize.literal('views + 1') },
              { 
                where: { id: paste.id },
                transaction: viewUpdateTransaction
              }
            );
            await viewUpdateTransaction.commit();
          } catch (viewUpdateError) {
            console.error('Failed to update views:', viewUpdateError);
            await viewUpdateTransaction.rollback();
            // Continue anyway, view count is not critical
          }
        } catch (error) {
          console.error('View update transaction error:', error);
          // Continue anyway, view count is not critical
        }
        
        // Commit the main transaction
        await transaction.commit();
        
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
            views: paste.views + 1, // Increment for the response even if DB update failed
            user: null,
            isJupyterStyle: paste.isJupyterStyle,
            blocks: paste.Blocks ? paste.Blocks.map(b => ({
              id: b.id,
              content: b.content,
              language: b.language,
              order: b.order
            })) : [],
            files: paste.Files ? paste.Files.map(f => ({
              id: f.id,
              filename: f.originalname,
              size: f.size,
              url: `/api/pastes/${paste.id}/files/${f.id}`
            })) : [],
            canEdit: paste.isEditable,
            isPasswordProtected
          }
        });
      } else {
        // No paste found
        await transaction.commit();
        return res.status(404).json({ message: 'Paste not found' });
      }
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
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

// Verify paste password
router.post('/:id/verify-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    
    const { models, sequelize } = req.db;
    const { Paste } = models;
    
    // Use a transaction for better error handling
    const transaction = await sequelize.transaction({
      isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });
    
    try {
      // Check if the ID is a valid UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let paste = null;
      
      if (isValidUUID) {
        // If it's a valid UUID, try to find by ID first
        paste = await Paste.findByPk(id, { transaction });
      }
      
      // If not found or not a UUID, try by customUrl
      if (!paste) {
        paste = await Paste.findOne({
          where: { customUrl: id },
          transaction
        });
      }
      
      if (!paste) {
        await transaction.commit();
        return res.status(404).json({ message: 'Paste not found' });
      }
      
      // Check if paste is expired
      if (paste.expiresAt && new Date(paste.expiresAt) < new Date()) {
        await transaction.commit();
        return res.status(404).json({ message: 'Paste has expired' });
      }
      
      // Check if paste is password protected
      if (!paste.password) {
        await transaction.commit();
        return res.status(400).json({ message: 'This paste is not password protected' });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, paste.password);
      
      // Commit the transaction before response
      await transaction.commit();
      
      if (!isPasswordValid) {
        return res.status(403).json({ message: 'Invalid password' });
      }
      
      // Return success if password is valid
      return res.status(200).json({
        message: 'Password verified successfully',
        success: true
      });
    } catch (error) {
      // Rollback the transaction if there's an error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Verify paste password error:', error);
    return res.status(500).json({ message: 'Server error verifying password' });
  }
});

// Edit a paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    const now = new Date();
    
    const { models } = req.db;
    const { Paste, Block } = models;
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let paste = null;
    
    if (isValidUUID) {
      // If it's a valid UUID, try to find by ID first
      paste = await Paste.findByPk(id, {
        include: [{ model: Block, as: 'Blocks' }]
      });
    }
    
    // If not found or not a UUID, try by customUrl
    if (!paste) {
      paste = await Paste.findOne({
        where: { customUrl: id },
        include: [{ model: Block, as: 'Blocks' }]
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
      
      // Start a transaction
      const transaction = await models.sequelize.transaction();
      
      try {
      // Update paste
      if (title !== undefined) paste.title = title;
        
        // Update content for standard pastes or handle blocks for Jupyter-style pastes
        if (paste.isJupyterStyle) {
          if (blocks) {
            const parsedBlocks = typeof blocks === 'string' ? JSON.parse(blocks) : blocks;
            
            // Delete existing blocks
            await Block.destroy({
              where: { pasteId: paste.id },
              transaction
            });
            
            // Create new blocks with updated content
            for (let i = 0; i < parsedBlocks.length; i++) {
              const block = parsedBlocks[i];
              await Block.create({
                content: block.content,
                language: block.language || 'text',
                order: i,
                pasteId: paste.id
              }, { transaction });
            }
          }
        } else if (content !== undefined) {
          // Standard paste, just update the content
          paste.content = content;
        }
      
      // Save changes
        await paste.save({ transaction });
        
        // Commit the transaction
        await transaction.commit();
        
        // Fetch the updated paste with its blocks
        const updatedPaste = await Paste.findByPk(paste.id, {
          include: [{ model: Block, as: 'Blocks', order: [['order', 'ASC']] }]
        });
      
      return res.status(200).json({
        message: 'Paste updated successfully',
        paste: {
            id: updatedPaste.id,
            title: updatedPaste.title,
            content: updatedPaste.content,
            expiresAt: updatedPaste.expiresAt,
            isPrivate: updatedPaste.isPrivate,
            isEditable: updatedPaste.isEditable,
            customUrl: updatedPaste.customUrl,
            createdAt: updatedPaste.createdAt,
            updatedAt: updatedPaste.updatedAt,
            views: updatedPaste.views,
            isJupyterStyle: updatedPaste.isJupyterStyle,
            blocks: updatedPaste.Blocks ? updatedPaste.Blocks.map(b => ({
              id: b.id,
              content: b.content,
              language: b.language,
              order: b.order
            })) : []
        }
      });
      } catch (error) {
        // Rollback the transaction in case of error
        await transaction.rollback();
        throw error;
      }
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