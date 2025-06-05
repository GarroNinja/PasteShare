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
    
    // Determine if this is a Jupyter-style paste
    const isJupyterStylePaste = isJupyterStyle === 'true' || isJupyterStyle === true;

    // Validate input for Jupyter-style pastes
    let parsedBlocks = [];
    if (isJupyterStylePaste) {
      console.log('Processing Jupyter-style paste with blocks:', blocks);
      console.log('Blocks type:', typeof blocks);
      
      if (!blocks) {
        return res.status(400).json({ message: 'Blocks are required for Jupyter-style pastes' });
      }
      
      try {
        if (typeof blocks === 'string') {
          console.log('Blocks provided as string, attempting to parse');
          try {
            parsedBlocks = JSON.parse(blocks);
            console.log('Successfully parsed blocks from string:', parsedBlocks.length);
          } catch (parseError) {
            console.error('Failed to parse blocks JSON:', parseError);
            return res.status(400).json({
              message: 'Invalid blocks JSON format',
              error: parseError.message
            });
          }
        } else if (Array.isArray(blocks)) {
          parsedBlocks = blocks;
        } else if (typeof blocks === 'object') {
          parsedBlocks = [blocks];
        } else {
          throw new Error(`Unexpected blocks format: ${typeof blocks}`);
        }
        
        if (!Array.isArray(parsedBlocks)) {
          return res.status(400).json({ message: 'Blocks must be an array' });
        }
        
        console.log('Parsed', parsedBlocks.length, 'blocks');
        
        // Validate blocks
        for (const block of parsedBlocks) {
          if (!block.content) {
            block.content = ''; // Default to empty string
          }
          
          if (!block.language) {
            block.language = 'text'; // Default to text
          }
          
          if (typeof block.order !== 'number') {
            // Will fix later in sequence
          }
        }
        
        // Sort and re-number blocks
        parsedBlocks.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 999;
          const orderB = typeof b.order === 'number' ? b.order : 999;
          return orderA - orderB;
        });
        
        parsedBlocks = parsedBlocks.map((block, index) => ({
          ...block,
          order: index
        }));
      } catch (error) {
        console.error('Error processing blocks:', error);
        return res.status(400).json({
          message: 'Failed to process blocks data',
          error: error.message
        });
      }
    }
    
    if (!isJupyterStylePaste && !content) {
      return res.status(400).json({ message: 'Content is required for standard pastes' });
    }
    
    // Create new paste
    if (!req.db || !req.db.success) {
      console.error('Database connection error in paste creation');
      return res.status(500).json({
        message: 'Database connection error',
        error: req.db ? req.db.error : 'No database connection'
      });
    }
    
    const { sequelize, models } = req.db;
    const { Paste, File, Block } = models;
    
    // Check for columns in the pastes table
    try {
      const [columns] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
      );
      
      const columnNames = columns.map(c => c.column_name);
      console.log('Available columns in pastes table:', columnNames);
      
      const hasJupyterStyleColumn = columnNames.includes('isjupyterstyle');
      const hasBlocksTable = await checkTableExists(sequelize, 'blocks');
      
      console.log('Has isJupyterStyle column:', hasJupyterStyleColumn);
      console.log('Has blocks table:', hasBlocksTable);
      
      // Check if customUrl is already taken
      if (customUrl) {
        const existingPaste = await Paste.findOne({
          where: { customUrl }
        });
        
        if (existingPaste) {
          return res.status(400).json({ message: 'Custom URL is already taken' });
        }
      }
      
      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      
      // Expiration date calculation
      let expiresAt = null;
      if (expiresIn && parseInt(expiresIn) > 0) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + parseInt(expiresIn));
      }
      
      // Create the paste record
      console.log('Creating base paste record');
      
      // Create paste data object with required fields
      const pasteData = {
        title: title || 'Untitled Paste',
        content: isJupyterStylePaste ? null : content,
        expiresAt,
        isPrivate: isPrivate === 'true' || isPrivate === true,
        customUrl: customUrl || null,
        isEditable: isEditable === 'true' || isEditable === true,
        password: hashedPassword
      };
      
      // Only add isJupyterStyle if the column exists
      if (hasJupyterStyleColumn) {
        pasteData.isJupyterStyle = isJupyterStylePaste;
      }
      
      const newPaste = await Paste.create(pasteData);
      
      console.log(`Base paste created with ID: ${newPaste.id}`);
      
      // Create blocks if Jupyter-style and blocks table exists
      let createdBlocks = [];
      if (isJupyterStylePaste && hasBlocksTable && parsedBlocks.length > 0) {
        console.log(`Creating ${parsedBlocks.length} blocks for paste ${newPaste.id}`);
        
        for (const block of parsedBlocks) {
          const newBlock = await Block.create({
            content: block.content || '',
            language: block.language || 'text',
            order: block.order,
            pasteId: newPaste.id
          });
          
          createdBlocks.push({
            id: newBlock.id,
            content: newBlock.content,
            language: newBlock.language,
            order: newBlock.order
          });
        }
        
        console.log(`Successfully created ${createdBlocks.length} blocks`);
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
              pasteId: newPaste.id
            }, { 
              transaction: sequelize.transaction(),
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
      
      // Log completion time
      const endTime = Date.now();
      console.log(`Paste creation completed in ${endTime - startTime}ms. ID: ${newPaste.id}, isJupyterStyle: ${newPaste.isJupyterStyle}, blocks: ${createdBlocks.length}`);
      
      return res.status(201).json({
        message: 'Paste created successfully',
        paste: {
          id: newPaste.id,
          title: newPaste.title,
          content: newPaste.content,
          expiresAt: newPaste.expiresAt,
          isPrivate: newPaste.isPrivate,
          isEditable: newPaste.isEditable,
          customUrl: newPaste.customUrl,
          createdAt: newPaste.createdAt,
          isPasswordProtected: !!newPaste.password,
          isJupyterStyle: newPaste.isJupyterStyle,
          blocks: createdBlocks,
          files: req.files ? req.files.map(f => ({
            id: f.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            filename: f.originalname,
            size: f.size,
            url: `/api/pastes/${newPaste.id}/files/${f.id || 'latest'}`
          })) : []
        }
      });
    } catch (error) {
      console.error('Database error in paste creation:', error);
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
        content: paste.content || '',
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
        let isJupyterStyle = false;
        
        // Check if isJupyterStyle property exists in the paste object
        if ('isJupyterStyle' in paste) {
          isJupyterStyle = paste.isJupyterStyle === true;
        } else {
          // Check if column exists and add it if needed
          const hasColumn = await checkColumnExists(sequelize, 'pastes', 'isJupyterStyle');
          if (!hasColumn) {
            try {
              await sequelize.query('ALTER TABLE "pastes" ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE');
            } catch (error) {
              console.error('Failed to add isJupyterStyle column:', error);
            }
          }
        }
        
        if (isJupyterStyle && hasBlocksTable) {
          if (blocks) {
            let parsedBlocks;
            try {
              // Parse blocks data
              if (typeof blocks === 'string') {
                parsedBlocks = JSON.parse(blocks);
              } else if (Array.isArray(blocks)) {
                parsedBlocks = blocks;
              } else {
                throw new Error(`Invalid blocks format: ${typeof blocks}`);
              }
              
              // Validate blocks
              if (!Array.isArray(parsedBlocks)) {
                throw new Error('Blocks must be an array');
              }
              
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
                      block.content || '',
                      block.language || 'text',
                      i,
                      paste.id
                    ],
                    transaction
                  }
                );
              }
            } catch (parseError) {
              console.error('Error processing blocks:', parseError);
              throw parseError;
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

// Helper function to check if a table exists
async function checkTableExists(sequelize, tableName) {
  try {
    const [result] = await sequelize.query(
      "SELECT to_regclass('public." + tableName + "') IS NOT NULL as exists"
    );
    return result[0].exists;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

// Helper function to check if a column exists in a table
async function checkColumnExists(sequelize, tableName, columnName) {
  try {
    const [result] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = '${tableName}' 
       AND column_name = '${columnName}'`
    );
    return result.length > 0;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error);
    return false;
  }
}

// Export the router
module.exports = router; 