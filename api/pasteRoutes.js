// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createConnection, Op } = require('./db');
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');

// Add a flag to track if we've detected a missing isJupyterStyle column
let hasFixedSchema = false;

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

// Helper function to safely create a paste
const createPasteWithoutJupyterStyleColumn = async (sequelize, pasteData, parsedBlocks = []) => {
  // Remove isJupyterStyle from the paste data to prevent SQL errors
  const { isJupyterStyle, ...safeData } = pasteData;
  
  // Start a transaction
  const transaction = await sequelize.transaction();
  
  try {
    // Insert the paste without isJupyterStyle column
    const [result] = await sequelize.query(
      `INSERT INTO pastes 
       (id, title, content, "expiresAt", "isPrivate", "customUrl", "isEditable", password, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) RETURNING *`,
      {
        replacements: [
          uuidv4(),
          safeData.title || 'Untitled Paste',
          safeData.content,
          safeData.expiresAt,
          safeData.isPrivate,
          safeData.customUrl,
          safeData.isEditable,
          safeData.password,
        ],
        transaction
      }
    );
    
    const newPaste = result[0];
    
    // If there are blocks, create them
    if (parsedBlocks.length > 0) {
      for (let i = 0; i < parsedBlocks.length; i++) {
        const block = parsedBlocks[i];
        await sequelize.query(
          `INSERT INTO blocks 
           (id, content, language, "order", "pasteId", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          {
            replacements: [
              uuidv4(),
              block.content || '',
              block.language || 'text',
              i,
              newPaste.id
            ],
            transaction
          }
        );
      }
    }
    
    await transaction.commit();
    return { success: true, paste: newPaste };
  } catch (error) {
    await transaction.rollback();
    return { success: false, error };
  }
};

// POST /api/pastes - Create a new paste
router.post('/', upload.array('files', 3), async (req, res) => {
  try {
    console.log('Paste creation started');
    const { title, content, expiresIn, isPrivate, customUrl, isEditable, password, isJupyterStyle, blocks } = req.body;
    
    // Determine if this is a Jupyter-style paste
    const isJupyterStylePaste = isJupyterStyle === 'true' || isJupyterStyle === true;
    
    // Validate input
    if (!isJupyterStylePaste && !content) {
      return res.status(400).json({ message: 'Content is required for standard pastes' });
    }
    
    // Parse blocks if this is a Jupyter-style paste
    let parsedBlocks = [];
    if (isJupyterStylePaste) {
      try {
        if (!blocks) {
          return res.status(400).json({ message: 'Blocks are required for Jupyter-style pastes' });
        }
        
        if (typeof blocks === 'string') {
          parsedBlocks = JSON.parse(blocks);
        } else if (Array.isArray(blocks)) {
          parsedBlocks = blocks;
        } else {
          throw new Error(`Invalid blocks format: ${typeof blocks}`);
        }
        
        if (!Array.isArray(parsedBlocks)) {
          return res.status(400).json({ message: 'Blocks must be an array' });
        }
      } catch (error) {
        return res.status(400).json({ message: 'Invalid blocks data: ' + error.message });
      }
    }
    
    // DB connection
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { sequelize } = req.db;
    
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
    
    // Prepare paste data
    const pasteData = {
      title: title || 'Untitled Paste',
      content: isJupyterStylePaste ? null : content,
      expiresAt,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      customUrl: customUrl || null,
      isEditable: isEditable === 'true' || isEditable === true,
      password: hashedPassword,
      isJupyterStyle: isJupyterStylePaste
    };
    
    // Try to determine if we have an isJupyterStyle column, but only once
    if (!hasFixedSchema) {
      try {
        const [columns] = await sequelize.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
        );
        
        const columnNames = columns.map(c => c.column_name.toLowerCase());
        
        // If we don't have the column, try to create it
        if (!columnNames.includes('isjupyterstyle')) {
          try {
            await sequelize.query('ALTER TABLE pastes ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE');
            console.log('Added isJupyterStyle column');
          } catch (alterError) {
            // Failed to add the column, we'll use our safe method
            console.log('Failed to add isJupyterStyle column, using safe method');
          }
        }
        
        hasFixedSchema = true;
      } catch (schemaError) {
        console.error('Schema check error:', schemaError);
      }
    }
    
    // Try to create the paste using the regular model, and if it fails, use our safe method
    try {
      // Try the standard method first
      const { models } = req.db;
      const { Paste, Block } = models;
      
      const newPaste = await Paste.create(pasteData);
      
      // Create blocks if needed
      if (isJupyterStylePaste && parsedBlocks.length > 0) {
        for (const block of parsedBlocks) {
          await Block.create({
            content: block.content || '',
            language: block.language || 'text',
            order: block.order,
            pasteId: newPaste.id
          });
        }
      }
      
      // Process files
      if (req.files && req.files.length > 0) {
        const { File } = models;
        for (const file of req.files) {
          // Convert file buffer to base64
          const base64Content = file.buffer.toString('base64');
          
          await File.create({
            filename: file.originalname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            content: base64Content,
            pasteId: newPaste.id
          });
        }
      }
      
      // Return response
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
          isJupyterStyle: isJupyterStylePaste
        }
      });
    } catch (modelError) {
      console.error('Error creating paste using model:', modelError);
      
      // Try our safe method as fallback
      const result = await createPasteWithoutJupyterStyleColumn(sequelize, pasteData, parsedBlocks);
      
      if (!result.success) {
        throw result.error;
      }
      
      // Process files manually if needed
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          // Convert file buffer to base64
          const base64Content = file.buffer.toString('base64');
          
          await sequelize.query(
            `INSERT INTO files 
             (id, filename, originalname, mimetype, size, content, "pasteId", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            {
              replacements: [
                uuidv4(),
                file.originalname,
                file.originalname,
                file.mimetype,
                file.size,
                base64Content,
                result.paste.id
              ]
            }
          );
        }
      }
      
      // Return response
      return res.status(201).json({
        message: 'Paste created successfully',
        paste: {
          id: result.paste.id,
          title: result.paste.title,
          content: result.paste.content,
          expiresAt: result.paste.expiresAt,
          isPrivate: result.paste.isPrivate,
          isEditable: result.paste.isEditable,
          customUrl: result.paste.customUrl,
          createdAt: result.paste.createdAt,
          isPasswordProtected: !!result.paste.password,
          isJupyterStyle: isJupyterStylePaste,
          blocks: parsedBlocks.map((block, index) => ({
            id: uuidv4(), // Generate IDs for display purposes
            content: block.content || '',
            language: block.language || 'text',
            order: index
          }))
        }
      });
    }
  } catch (error) {
    console.error('Error creating paste:', error);
    return res.status(500).json({
      message: 'Server error creating paste',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
      
      // Always check for blocks regardless of isJupyterStyle column
      let blocks = [];
      let isJupyterStyle = false;
      
      if (hasBlocksTable) {
        try {
          const [blockResults] = await sequelize.query(
            `SELECT id, content, language, "order" FROM blocks WHERE "pasteId" = '${paste.id}' ORDER BY "order" ASC`
          );
          
          // If we have blocks, consider it a Jupyter-style paste
          if (blockResults.length > 0) {
            isJupyterStyle = true;
            blocks = blockResults.map(block => ({
              id: block.id,
              content: block.content,
              language: block.language || 'text',
              order: block.order
            }));
          }
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
        isJupyterStyle: isJupyterStyle, // Use the detected value
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

// PUT /api/pastes/:id - Update an existing paste
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    
    console.log('Update request for paste ID:', id);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Blocks provided:', blocks ? (typeof blocks === 'string' ? 'as string' : 'as object') : 'none');
    
    if (!req.db || !req.db.success) {
      return res.status(503).json({ message: 'Database connection error' });
    }
    
    const { sequelize } = req.db;
    
    // Find the paste using prepared statements to prevent SQL injection
    let pasteQuery = `SELECT * FROM pastes WHERE `;
    let queryParams = [];
    
    // Check if the ID is a valid UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    if (isValidUUID) {
      pasteQuery += `id = ?`;
      queryParams.push(id);
    } else {
      pasteQuery += `"customUrl" = ?`;
      queryParams.push(id);
    }
    
    const [pasteResults] = await sequelize.query(pasteQuery, { 
      replacements: queryParams 
    });
    
    if (pasteResults.length === 0) {
      return res.status(404).json({ message: 'Paste not found' });
    }
    
    const paste = pasteResults[0];
    console.log('Found paste with ID:', paste.id);
    
    // Check if editable
    if (!paste.isEditable) {
      return res.status(403).json({ message: 'This paste is not editable' });
    }
    
    // Check if expired
    if (paste.expiresAt && new Date(paste.expiresAt) < new Date()) {
      return res.status(404).json({ message: 'Paste has expired' });
    }
    
    // Start a transaction for atomic updates
    const transaction = await sequelize.transaction();
    
    try {
      // Update title if provided
      if (title !== undefined) {
        await sequelize.query(
          `UPDATE pastes SET title = ? WHERE id = ?`,
          {
            replacements: [title, paste.id],
            transaction
          }
        );
        console.log(`Updated title for paste ${paste.id}`);
      }
      
      // Check if blocks table exists
      const [blocksTableResult] = await sequelize.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'blocks') AS exists"
      );
      
      const hasBlocksTable = blocksTableResult[0].exists;
      console.log('Blocks table exists:', hasBlocksTable);
      
      if (!hasBlocksTable) {
        await transaction.rollback();
        return res.status(500).json({ 
          message: 'Server configuration error: blocks table does not exist' 
        });
      }
      
      // Check if this is a Jupyter-style paste by looking for blocks
      const [blockCountResult] = await sequelize.query(
        `SELECT COUNT(*) AS count FROM blocks WHERE "pasteId" = ?`,
        { 
          replacements: [paste.id],
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      const existingBlockCount = parseInt(blockCountResult.count, 10);
      console.log(`Found ${existingBlockCount} existing blocks for paste ${paste.id}`);
      
      const isJupyterStyle = existingBlockCount > 0 || blocks !== undefined;
      
      if (isJupyterStyle) {
        if (blocks) {
          try {
            // Parse blocks if provided as string
            let parsedBlocks;
            if (typeof blocks === 'string') {
              try {
                parsedBlocks = JSON.parse(blocks);
                console.log(`Successfully parsed blocks string into ${parsedBlocks.length} blocks`);
              } catch (parseError) {
                console.error('Failed to parse blocks JSON:', parseError);
                throw new Error(`Invalid blocks JSON: ${parseError.message}`);
              }
            } else if (Array.isArray(blocks)) {
              parsedBlocks = blocks;
              console.log(`Received ${parsedBlocks.length} blocks as array`);
            } else {
              throw new Error(`Invalid blocks format: expected string or array, got ${typeof blocks}`);
            }
            
            if (!Array.isArray(parsedBlocks)) {
              throw new Error('Blocks must be an array');
            }
            
            // Log details about the blocks
            console.log('Blocks to update:', 
              parsedBlocks.map((b, i) => ({
                index: i,
                id: b.id || 'new',
                contentLength: b.content ? b.content.length : 0,
                language: b.language || 'text'
              }))
            );
            
            // First delete all existing blocks for this paste
            const deleteResult = await sequelize.query(
              `DELETE FROM blocks WHERE "pasteId" = ?`,
              {
                replacements: [paste.id],
                transaction
              }
            );
            
            console.log(`Deleted ${deleteResult[1].rowCount} existing blocks for paste ${paste.id}`);
            
            // Now insert all the new/updated blocks
            for (let i = 0; i < parsedBlocks.length; i++) {
              const block = parsedBlocks[i];
              
              // Validate block data
              if (!block) {
                console.error(`Block at index ${i} is null or undefined`);
                continue; // Skip invalid blocks
              }
              
              // Generate a new UUID if not provided or invalid
              const blockId = (block.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
                ? block.id
                : uuidv4();
                
              // Sanitize block content and language
              const blockContent = block.content || '';
              const blockLanguage = block.language || 'text';
              
              try {
                const insertResult = await sequelize.query(
                  `INSERT INTO blocks (id, content, language, "order", "pasteId", "createdAt", "updatedAt") 
                   VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                  {
                    replacements: [
                      blockId,
                      blockContent,
                      blockLanguage,
                      i, // Order by position in array
                      paste.id
                    ],
                    transaction
                  }
                );
                
                console.log(`Inserted block ${i+1}/${parsedBlocks.length} with ID ${blockId} for paste ${paste.id}`);
              } catch (insertError) {
                console.error(`Error inserting block ${i}:`, insertError);
                throw new Error(`Failed to insert block ${i}: ${insertError.message}`);
              }
            }
          } catch (blocksError) {
            console.error('Error processing blocks:', blocksError);
            throw blocksError;
          }
        } else {
          console.log('No blocks provided for Jupyter-style paste update');
        }
      } else if (content !== undefined) {
        // Standard paste, update content
        await sequelize.query(
          `UPDATE pastes SET content = ? WHERE id = ?`,
          {
            replacements: [content, paste.id],
            transaction
          }
        );
        console.log(`Updated content for standard paste ${paste.id}`);
      } else {
        console.log('No content provided for standard paste update');
      }
      
      // Update timestamp
      await sequelize.query(
        `UPDATE pastes SET "updatedAt" = NOW() WHERE id = ?`,
        {
          replacements: [paste.id],
          transaction
        }
      );
      
      // Commit all changes
      await transaction.commit();
      console.log(`Successfully committed all updates for paste ${paste.id}`);
      
      // Fetch the updated paste to return in response
      const [updatedPasteResults] = await sequelize.query(
        `SELECT * FROM pastes WHERE id = ?`,
        { replacements: [paste.id] }
      );
      
      if (updatedPasteResults.length === 0) {
        return res.status(404).json({ message: 'Failed to retrieve updated paste' });
      }
      
      const updatedPaste = updatedPasteResults[0];
      
      // Fetch updated blocks if this is a Jupyter-style paste
      let updatedBlocks = [];
      const [blockResults] = await sequelize.query(
        `SELECT id, content, language, "order" FROM blocks WHERE "pasteId" = ? ORDER BY "order" ASC`,
        { replacements: [paste.id] }
      );
      
      if (blockResults.length > 0) {
        updatedBlocks = blockResults.map(b => ({
          id: b.id,
          content: b.content || '',
          language: b.language || 'text',
          order: b.order
        }));
        console.log(`Retrieved ${updatedBlocks.length} blocks for updated paste ${paste.id}`);
      }
      
      // Return the updated paste with all relevant data
      return res.status(200).json({
        message: 'Paste updated successfully',
        paste: {
          id: updatedPaste.id,
          title: updatedPaste.title || 'Untitled Paste',
          content: updatedPaste.content || '',
          expiresAt: updatedPaste.expiresAt,
          isPrivate: updatedPaste.isPrivate,
          isEditable: updatedPaste.isEditable,
          customUrl: updatedPaste.customUrl,
          createdAt: updatedPaste.createdAt,
          updatedAt: updatedPaste.updatedAt,
          views: updatedPaste.views || 0,
          isJupyterStyle: updatedBlocks.length > 0,
          blocks: updatedBlocks,
          canEdit: updatedPaste.isEditable
        }
      });
    } catch (transactionError) {
      // Rollback on any error
      await transaction.rollback();
      console.error(`Transaction rolled back for paste ${paste.id}:`, transactionError);
      throw transactionError;
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