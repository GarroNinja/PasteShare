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
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for pastes index');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize, models } = req.db;
    
    // Use a simpler query without transactions or joins to avoid potential issues
    try {
      // First check if isJupyterStyle column exists to determine query approach
      const [columns] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
      );
      
      const columnNames = columns.map(c => c.column_name);
      const hasJupyterStyle = columnNames.includes('isJupyterStyle');
      
      // Basic query for recent public pastes
      let query = `
        SELECT id, title, content, "createdAt", "expiresAt", views, "customUrl"
        ${hasJupyterStyle ? ', "isJupyterStyle"' : ''} 
        FROM pastes 
        WHERE "isPrivate" = false 
        AND (
          "expiresAt" IS NULL 
          OR "expiresAt" > NOW()
        )
        ORDER BY "createdAt" DESC 
        LIMIT ${limit}
      `;
      
      const [pastes] = await sequelize.query(query);
      
      // Map the results to the expected format
      const formattedPastes = pastes.map(paste => {
        let contentPreview = '';
        
        if (paste.content) {
          contentPreview = paste.content.length > 200 
            ? `${paste.content.substring(0, 200)}...`
            : paste.content;
        }
        
        return {
          id: paste.id,
          title: paste.title || 'Untitled Paste',
          content: contentPreview,
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views || 0,
          customUrl: paste.customUrl,
          isJupyterStyle: hasJupyterStyle ? paste.isJupyterStyle : false
        };
      });
      
      return res.status(200).json(formattedPastes);
    } catch (dbError) {
      console.error('Database query error for pastes index:', dbError);
      
      // Fallback to simpler query if the previous one failed
      try {
        console.log('Attempting fallback query for pastes index...');
        const [simplePastes] = await sequelize.query(`
          SELECT id, title, content, "createdAt", "expiresAt", views, "customUrl"
          FROM pastes 
          WHERE "isPrivate" = false 
          ORDER BY "createdAt" DESC 
          LIMIT ${limit}
        `);
        
        const formattedPastes = simplePastes.map(paste => ({
          id: paste.id,
          title: paste.title || 'Untitled Paste',
          content: paste.content 
            ? (paste.content.length > 200 ? `${paste.content.substring(0, 200)}...` : paste.content)
            : '',
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views || 0,
          customUrl: paste.customUrl
        }));
        
        return res.status(200).json(formattedPastes);
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        throw dbError; // Throw the original error for consistent error reporting
      }
    }
  } catch (error) {
    console.error('Get pastes index error:', error);
    return res.status(500).json({ 
      message: 'Server error retrieving pastes',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get recent public pastes - separate endpoint to match client expectations
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for recent pastes');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize, models } = req.db;
    const { Paste } = models;
    
    // Use a simpler query without transactions or joins to avoid potential issues
    try {
      // First check if isJupyterStyle column exists to determine query approach
      const [columns] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
      );
      
      const columnNames = columns.map(c => c.column_name);
      const hasJupyterStyle = columnNames.includes('isJupyterStyle');
      
      console.log('Columns in pastes table:', columnNames);
      console.log('Has isJupyterStyle column:', hasJupyterStyle);
      
      // Basic query for recent public pastes
      let query = `
        SELECT id, title, content, "createdAt", "expiresAt", views, "customUrl"
        ${hasJupyterStyle ? ', "isJupyterStyle"' : ''} 
        FROM pastes 
        WHERE "isPrivate" = false 
        AND (
          "expiresAt" IS NULL 
          OR "expiresAt" > NOW()
        )
        ORDER BY "createdAt" DESC 
        LIMIT ${limit}
      `;
      
      const [pastes] = await sequelize.query(query);
      
      // Map the results to the expected format
      const formattedPastes = pastes.map(paste => {
        let contentPreview = '';
        
        if (paste.content) {
          contentPreview = paste.content.length > 200 
            ? `${paste.content.substring(0, 200)}...`
            : paste.content;
        }
        
        return {
          id: paste.id,
          title: paste.title || 'Untitled Paste',
          content: contentPreview,
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views || 0,
          customUrl: paste.customUrl,
          isJupyterStyle: hasJupyterStyle ? paste.isJupyterStyle : false
        };
      });
      
      return res.status(200).json(formattedPastes);
    } catch (dbError) {
      console.error('Database query error for recent pastes:', dbError);
      
      // Fallback to simpler query if the previous one failed
      try {
        console.log('Attempting fallback query for recent pastes...');
        const [simplePastes] = await sequelize.query(`
          SELECT id, title, content, "createdAt", "expiresAt", views, "customUrl"
          FROM pastes 
          WHERE "isPrivate" = false 
          ORDER BY "createdAt" DESC 
          LIMIT ${limit}
        `);
        
        const formattedPastes = simplePastes.map(paste => ({
          id: paste.id,
          title: paste.title || 'Untitled Paste',
          content: paste.content 
            ? (paste.content.length > 200 ? `${paste.content.substring(0, 200)}...` : paste.content)
            : '',
          createdAt: paste.createdAt,
          expiresAt: paste.expiresAt,
          views: paste.views || 0,
          customUrl: paste.customUrl
        }));
        
        return res.status(200).json(formattedPastes);
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        throw dbError; // Throw the original error for consistent error reporting
      }
    }
  } catch (error) {
    console.error('Get recent pastes error:', error);
    return res.status(500).json({ 
      message: 'Server error retrieving recent pastes',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get a paste by ID or custom URL
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const password = req.query.password;
    const now = new Date();
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for paste retrieval');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize, models } = req.db;
    
    try {
      // First check which columns exist in the schema
      const [pasteColumns] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
      );
      
      const columnNames = pasteColumns.map(c => c.column_name);
      const hasJupyterStyle = columnNames.includes('isJupyterStyle');
      const hasPassword = columnNames.includes('password');
      
      console.log('Columns in pastes table:', columnNames);
      
      // Check if blocks table exists
      const [blocksTableExists] = await sequelize.query(
        "SELECT to_regclass('public.blocks') IS NOT NULL as exists"
      );
      const hasBlocksTable = blocksTableExists[0].exists;
      
      // Check if the ID is a valid UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      // Prepare base query for paste retrieval
      let pasteQuery;
      
      if (isValidUUID) {
        pasteQuery = `SELECT * FROM pastes WHERE id = '${id}'`;
      } else {
        pasteQuery = `SELECT * FROM pastes WHERE "customUrl" = '${id}'`;
      }
      
      // Execute the paste query
      const [pasteResults] = await sequelize.query(pasteQuery);
      
      if (pasteResults.length === 0) {
        return res.status(404).json({ message: 'Paste not found' });
      }
      
      const paste = pasteResults[0];
      
      // Check expiration
      if (paste.expiresAt && new Date(paste.expiresAt) < now) {
        return res.status(404).json({ message: 'Paste has expired' });
      }
      
      // Check password protection
      const isPasswordProtected = hasPassword && paste.password;
      
      if (isPasswordProtected && !password) {
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
      
      // Verify password if present
      if (isPasswordProtected && password) {
        const isPasswordValid = await bcrypt.compare(password, paste.password);
        
        if (!isPasswordValid) {
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
      
      // Increment views in a separate query to avoid transaction issues
      try {
        await sequelize.query(`UPDATE pastes SET views = views + 1 WHERE id = '${paste.id}'`);
      } catch (viewError) {
        console.error('Failed to update views:', viewError);
        // Continue anyway, view count is not critical
      }
      
      // Get associated files if any
      let files = [];
      try {
        const [fileResults] = await sequelize.query(
          `SELECT id, filename, originalname, mimetype, size FROM files WHERE "pasteId" = '${paste.id}'`
        );
        
        files = fileResults.map(file => ({
          id: file.id,
          filename: file.originalname || file.filename,
          size: file.size,
          url: `/api/pastes/${paste.id}/files/${file.id}`
        }));
      } catch (fileError) {
        console.error('Error fetching files:', fileError);
        // Continue anyway, files are optional
      }
      
      // Get blocks for Jupyter-style pastes
      let blocks = [];
      if (hasJupyterStyle && paste.isJupyterStyle && hasBlocksTable) {
        try {
          const [blockResults] = await sequelize.query(
            `SELECT id, content, language, "order" FROM blocks WHERE "pasteId" = '${paste.id}' ORDER BY "order" ASC`
          );
          
          blocks = blockResults.map(block => ({
            id: block.id,
            content: block.content,
            language: block.language || 'text',
            order: block.order
          }));
        } catch (blockError) {
          console.error('Error fetching blocks:', blockError);
          // Continue anyway, we'll fall back to content
        }
      }
      
      // Build the response object
      const pasteResponse = {
        id: paste.id,
        title: paste.title || 'Untitled Paste',
        content: paste.content,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
        views: paste.views + 1, // Increment for the response even if DB update failed
        user: null,
        isJupyterStyle: hasJupyterStyle ? paste.isJupyterStyle : false,
        blocks: blocks,
        files: files,
        canEdit: paste.isEditable,
        isPasswordProtected: isPasswordProtected
      };
      
      return res.status(200).json({ paste: pasteResponse });
    } catch (dbError) {
      console.error('Database error in paste retrieval:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({ 
      message: 'Server error retrieving paste', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get file by ID
router.get('/:pasteId/files/:fileId', async (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for file retrieval');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize } = req.db;
    
    // Use raw query instead of Sequelize ORM
    try {
      const [fileResults] = await sequelize.query(
        `SELECT * FROM files WHERE id = '${fileId}' AND "pasteId" = '${pasteId}'`
      );
      
      if (fileResults.length === 0) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      const file = fileResults[0];
      
      // Convert base64 back to buffer
      const fileBuffer = Buffer.from(file.content, 'base64');
      
      res.setHeader('Content-Type', file.mimetype);
      res.setHeader('Content-Disposition', `inline; filename="${file.originalname || file.filename}"`);
      return res.send(fileBuffer);
    } catch (dbError) {
      console.error('Database error in file retrieval:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Get file error:', error);
    return res.status(500).json({ 
      message: 'Server error retrieving file',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for password verification');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize } = req.db;
    
    try {
      // Check if the ID is a valid UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      // Prepare the query
      let query;
      if (isValidUUID) {
        query = `SELECT * FROM pastes WHERE id = '${id}'`;
      } else {
        query = `SELECT * FROM pastes WHERE "customUrl" = '${id}'`;
      }
      
      // Execute the query
      const [pasteResults] = await sequelize.query(query);
      
      if (pasteResults.length === 0) {
        return res.status(404).json({ message: 'Paste not found' });
      }
      
      const paste = pasteResults[0];
      
      // Check if paste is expired
      if (paste.expiresAt && new Date(paste.expiresAt) < new Date()) {
        return res.status(404).json({ message: 'Paste has expired' });
      }
      
      // Check if paste is password protected
      if (!paste.password) {
        return res.status(400).json({ message: 'This paste is not password protected' });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, paste.password);
      
      if (!isPasswordValid) {
        return res.status(403).json({ message: 'Invalid password' });
      }
      
      // Return success if password is valid
      return res.status(200).json({
        message: 'Password verified successfully',
        success: true
      });
    } catch (dbError) {
      console.error('Database error in password verification:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Verify paste password error:', error);
    return res.status(500).json({ 
      message: 'Server error verifying password',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Edit a paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    const now = new Date();
    
    // Check if database connection is available
    if (!req.db || !req.db.success) {
      console.error('Database connection not available for paste update');
      return res.status(500).json({ 
        message: 'Database connection error', 
        error: req.db ? req.db.error : 'No database connection' 
      });
    }
    
    const { sequelize } = req.db;
    
    try {
      // First check which columns exist in the schema
      const [pasteColumns] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
      );
      
      const columnNames = pasteColumns.map(c => c.column_name);
      const hasJupyterStyle = columnNames.includes('isJupyterStyle');
      
      console.log('Columns in pastes table for update:', columnNames);
      
      // Check if blocks table exists
      const [blocksTableExists] = await sequelize.query(
        "SELECT to_regclass('public.blocks') IS NOT NULL as exists"
      );
      const hasBlocksTable = blocksTableExists[0].exists;
      
      // Check if the ID is a valid UUID
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      // Find the paste
      let pasteQuery;
      if (isValidUUID) {
        pasteQuery = `SELECT * FROM pastes WHERE id = '${id}'`;
      } else {
        pasteQuery = `SELECT * FROM pastes WHERE "customUrl" = '${id}'`;
      }
      
      // Execute the query
      const [pasteResults] = await sequelize.query(pasteQuery);
      
      if (pasteResults.length === 0) {
        return res.status(404).json({ message: 'Paste not found' });
      }
      
      const paste = pasteResults[0];
      
      // Check if expired
      if (paste.expiresAt && new Date(paste.expiresAt) < now) {
        return res.status(404).json({ message: 'Paste has expired' });
      }
      
      // Check if editable
      if (!paste.isEditable) {
        return res.status(403).json({ message: 'This paste is not editable' });
      }
      
      // Start a transaction
      const transaction = await sequelize.transaction();
      
      try {
        // Update paste title if provided
        if (title !== undefined) {
          await sequelize.query(
            `UPDATE pastes SET title = ? WHERE id = ?`,
            {
              replacements: [title, paste.id],
              transaction
            }
          );
        }
        
        // Update content for standard pastes or handle blocks for Jupyter-style pastes
        const isJupyterStyle = hasJupyterStyle && paste.isJupyterStyle;
        
        if (isJupyterStyle && hasBlocksTable) {
          if (blocks) {
            const parsedBlocks = typeof blocks === 'string' ? JSON.parse(blocks) : blocks;
            
            // Delete existing blocks
            await sequelize.query(
              `DELETE FROM blocks WHERE "pasteId" = ?`,
              {
                replacements: [paste.id],
                transaction
              }
            );
            
            // Create new blocks with updated content
            for (let i = 0; i < parsedBlocks.length; i++) {
              const block = parsedBlocks[i];
              await sequelize.query(
                `INSERT INTO blocks (id, content, language, "order", "pasteId", "createdAt", "updatedAt") 
                VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                {
                  replacements: [
                    uuidv4(),
                    block.content,
                    block.language || 'text',
                    i,
                    paste.id
                  ],
                  transaction
                }
              );
            }
          }
        } else if (content !== undefined) {
          // Standard paste, just update the content
          await sequelize.query(
            `UPDATE pastes SET content = ? WHERE id = ?`,
            {
              replacements: [content, paste.id],
              transaction
            }
          );
        }
        
        // Update the updatedAt timestamp
        await sequelize.query(
          `UPDATE pastes SET "updatedAt" = NOW() WHERE id = ?`,
          {
            replacements: [paste.id],
            transaction
          }
        );
        
        // Commit the transaction
        await transaction.commit();
        
        // Fetch the updated paste
        const [updatedPasteResults] = await sequelize.query(
          `SELECT * FROM pastes WHERE id = ?`,
          {
            replacements: [paste.id]
          }
        );
        
        const updatedPaste = updatedPasteResults[0];
        
        // Fetch blocks if Jupyter-style
        let updatedBlocks = [];
        if (isJupyterStyle && hasBlocksTable) {
          const [blockResults] = await sequelize.query(
            `SELECT * FROM blocks WHERE "pasteId" = ? ORDER BY "order" ASC`,
            {
              replacements: [paste.id]
            }
          );
          
          updatedBlocks = blockResults.map(b => ({
            id: b.id,
            content: b.content,
            language: b.language || 'text',
            order: b.order
          }));
        }
        
        // Return the updated paste
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
            isJupyterStyle: isJupyterStyle,
            blocks: updatedBlocks
          }
        });
      } catch (transactionError) {
        // Rollback the transaction in case of error
        await transaction.rollback();
        throw transactionError;
      }
    } catch (dbError) {
      console.error('Database error in paste update:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Update paste error:', error);
    return res.status(500).json({ 
      message: 'Server error updating paste',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Export the router
module.exports = router; 