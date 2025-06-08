import { Request, Response } from 'express';
import { Paste, File, Block, sequelize } from '../models';
import { Op } from 'sequelize';
import { deleteFile } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

// Create a new paste
export const createPaste = async (req: Request, res: Response) => {
  try {
    console.log('Create paste request received');
    console.log('Request body keys:', Object.keys(req.body));
    const { title, content, expiresIn, isPrivate, customUrl, isEditable, password, isJupyterStyle: requestIsJupyter, blocks } = req.body;
    
    // Handle special case of dummy content for Jupyter-style pastes
    const isDummyContent = content === "dummy-content-for-jupyter";
    const isJupyterStylePaste = requestIsJupyter === 'true' || requestIsJupyter === true || isDummyContent;
    
    console.log('Is Jupyter style paste:', isJupyterStylePaste);
    
    // Validate input based on paste type
    if (!isJupyterStylePaste && !content) {
      return res.status(400).json({
        message: 'Content is required for standard pastes',
      });
    }
    
    // Validate input for Jupyter-style pastes
    let parsedBlocks: any[] = [];
    if (isJupyterStylePaste) {
      console.log('Processing Jupyter-style paste with blocks:', blocks);
      console.log('Blocks type:', typeof blocks);
      
      if (!blocks) {
        return res.status(400).json({
          message: 'Blocks are required for Jupyter-style pastes',
        });
      }
      
      // Try to parse blocks if they're provided as a string
      try {
        if (typeof blocks === 'string') {
          console.log('Blocks provided as string, attempting to parse');
          try {
            parsedBlocks = JSON.parse(blocks);
            console.log('Successfully parsed blocks from string:', parsedBlocks.length);
          } catch (parseError) {
            console.error('Error parsing blocks JSON:', parseError);
            return res.status(400).json({
              message: 'Invalid blocks JSON format',
              error: parseError instanceof Error ? parseError.message : String(parseError),
            });
          }
        } else if (Array.isArray(blocks)) {
          console.log('Blocks provided as array');
          parsedBlocks = blocks;
        } else if (blocks && typeof blocks === 'object') {
          console.log('Blocks provided as single object');
          parsedBlocks = [blocks]; // Handle single block object case
        } else {
          console.error('Blocks in unexpected format:', blocks);
          return res.status(400).json({
            message: 'Blocks must be provided as an array or JSON string',
          });
        }
        
        console.log(`Parsed ${parsedBlocks.length} blocks`);
        
        if (!Array.isArray(parsedBlocks) || parsedBlocks.length === 0) {
          return res.status(400).json({
            message: 'At least one valid block is required for Jupyter-style pastes',
          });
        }
        
        // Validate each block has the required fields
        for (const block of parsedBlocks) {
          if (!block.content || typeof block.content !== 'string') {
            console.error('Invalid block content:', block);
            return res.status(400).json({
              message: 'Each block must have a content field with string value',
            });
          }
        }
        
      } catch (error: any) {
        console.error('Error processing blocks:', error);
        return res.status(400).json({
          message: 'Invalid blocks format',
          error: error.message,
        });
      }
    }
    
    // If custom URL is provided, check if it's already taken
    if (customUrl) {
      const existingPaste = await Paste.findOne({
        where: { customUrl },
      });
      
      if (existingPaste) {
        return res.status(400).json({
          message: 'Custom URL is already taken',
        });
      }
    }
    
    // Calculate expiry date if provided
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
    // Clean up password input (prevent empty strings)
    const cleanPassword = password && password.trim() ? password.trim() : null;
    
    console.log('Creating base paste record');
    
    // Create paste - for Jupyter-style, store null as content
    const paste = await Paste.create({
      title: title || 'Untitled Paste',
      content: isJupyterStylePaste ? null : content, // Only store content for standard pastes
      expiresAt,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      isEditable: isEditable === 'true' || isEditable === true,
      customUrl: customUrl || null,
      userId: null,
      password: cleanPassword,
    });
    
    console.log('Base paste created with ID:', paste.id);
    
    // Create blocks for Jupyter-style pastes
    const blockRecords = [];
    if (isJupyterStylePaste && parsedBlocks.length > 0) {
      console.log(`Creating ${parsedBlocks.length} blocks for paste ${paste.id}`);
      
      try {
        // Create blocks - use Promise.all for better performance
        const blockPromises = parsedBlocks
          .filter(block => block.content && block.content.trim()) // Skip truly empty blocks
          .map((block, index) => {
            return Block.create({
              content: block.content,
              language: block.language || 'text',
              order: block.order !== undefined ? block.order : index,
              pasteId: paste.id
            });
          });
        
        const createdBlocks = await Promise.all(blockPromises);
        blockRecords.push(...createdBlocks);
        
        console.log(`Successfully created ${blockRecords.length} blocks`);
        
        // If no blocks were created (all were empty), delete the paste and return an error
        if (blockRecords.length === 0) {
          await paste.destroy();
          return res.status(400).json({
            message: 'Could not create paste: all blocks were empty',
          });
        }
      } catch (error) {
        console.error('Error creating blocks:', error);
        // Delete the paste if block creation fails completely
        if (blockRecords.length === 0) {
          await paste.destroy();
          return res.status(500).json({
            message: 'Failed to create blocks for Jupyter-style paste',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // Otherwise, continue with the paste blocks we could create
      }
    }
    
    // Handle file uploads
    const files = req.files as Express.Multer.File[];
    const uploadedFiles: any[] = [];
    
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} uploaded files`);
      
      for (const file of files) {
        // Store absolute path for reliable access
        const absolutePath = path.resolve(file.path);
        
        const fileRecord = await File.create({
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: absolutePath,
          content: Buffer.from("").toString("base64"),
          pasteId: paste.id,
        });
        
        uploadedFiles.push({
          id: fileRecord.id,
          filename: fileRecord.originalname,
          size: fileRecord.size,
          url: `/pastes/${paste.id}/files/${fileRecord.id}`,
        });
      }
      
      console.log(`Successfully processed ${uploadedFiles.length} files`);
    }
    
    const isPasswordProtected = paste.isPasswordProtected();
    const hasJupyterBlocks = paste.isJupyterStyle();
    
    // Format paste response data
    const responseData = {
        id: paste.id,
        title: paste.title,
      content: paste.content === null ? '' : String(paste.content),
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
      isPasswordProtected,
      isJupyterStyle: hasJupyterBlocks,
      blocks: blockRecords.map(block => ({
        id: block.id,
        content: block.content,
        language: block.language,
        order: block.order
      })),
        files: uploadedFiles,
    };
    
    console.log('Paste creation successful, returning response');
    
    return res.status(201).json({
      message: 'Paste created successfully',
      paste: responseData,
    });
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({
      message: 'Server error creating paste',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Get a paste by ID or custom URL
export const getPasteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`Get paste request for ID/URL: ${id}`);
    
    // Extract password from body for POST requests or from query for GET requests
    const password = req.method === 'POST' ? req.body.password : req.query.password as string;
    
    // Check if the ID is a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Build the query condition based on whether id is a UUID
    const whereCondition = isValidUUID 
      ? { [Op.or]: [{ id }, { customUrl: id }] } 
      : { customUrl: id }; // Only check customUrl if not a UUID

    // Find paste using the appropriate condition with blocks included
    const paste = await Paste.findOne({
      where: whereCondition,
      include: [
        {
          model: File,
          as: 'files',
          attributes: ['id', 'originalname', 'size', 'mimetype'],
        },
        {
          model: Block,
          as: 'blocks',
          attributes: ['id', 'content', 'language', 'order'],
          required: false,
        }
      ],
    });
    
    if (!paste) {
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    // Check if paste is expired
    if (paste.isExpired()) {
      return res.status(404).json({
        message: 'Paste has expired',
      });
    }
    
    // Check if paste is password protected
    const isPasswordProtected = paste.isPasswordProtected();
    
    // If paste is password protected and no password provided, return limited info
    if (isPasswordProtected && !password) {
      return res.status(403).json({
        message: 'This paste is password protected',
        pasteInfo: {
          id: paste.id,
          title: paste.title,
          isPasswordProtected: true,
          customUrl: paste.customUrl,
        },
      });
    }
    
    // If paste is password protected, verify the password
    if (isPasswordProtected && password) {
      const isPasswordValid = await paste.verifyPassword(password);
      
      if (!isPasswordValid) {
        return res.status(403).json({
          message: 'Invalid password',
          pasteInfo: {
            id: paste.id,
            title: paste.title,
            isPasswordProtected: true,
            customUrl: paste.customUrl,
          },
        });
      }
    }
    
    // Increment view count
    await paste.incrementViews();
    
    // Format files
    const files = paste.get('files') as File[];
    const formattedFiles = files.map((file) => ({
      id: file.id,
      filename: file.originalname,
      size: file.size,
      url: `/pastes/${paste.id}/files/${file.id}`,
    }));
    
    // Format blocks if they exist
    const blocks = paste.get('blocks') as Block[] || [];
    const hasBlocks = paste.isJupyterStyle();
    
    const formattedBlocks = blocks
      .sort((a, b) => a.order - b.order)
      .map(block => ({
        id: block.id,
        content: block.content,
        language: block.language,
        order: block.order
    }));
    
    // Check if current user can edit this paste
    const canEdit = paste.canEdit(null);
    
    // Format content safely
    const safeContent = paste.content === null ? '' : String(paste.content);
    
    return res.status(200).json({
      paste: {
        id: paste.id,
        title: paste.title,
        content: safeContent,
        expiresAt: paste.expiresAt,
        isPrivate: paste.isPrivate,
        isEditable: paste.isEditable,
        customUrl: paste.customUrl,
        createdAt: paste.createdAt,
        views: paste.views,
        user: null,
        files: formattedFiles,
        canEdit,
        isPasswordProtected,
        isJupyterStyle: hasBlocks,
        blocks: formattedBlocks,
      },
    });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({
      message: 'Server error retrieving paste',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Verify paste password
export const verifyPastePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        message: 'Password is required',
      });
    }
    
    // Check if the ID is a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Build the query condition based on whether id is a UUID
    const whereCondition = isValidUUID 
      ? { [Op.or]: [{ id }, { customUrl: id }] } 
      : { customUrl: id };
    
    const paste = await Paste.findOne({
      where: whereCondition,
    });
    
    if (!paste) {
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    // Check if paste is expired
    if (paste.isExpired()) {
      return res.status(404).json({
        message: 'Paste has expired',
      });
    }
    
    // Check if paste is password protected
    const isPasswordProtected = paste.isPasswordProtected();
    
    if (!isPasswordProtected) {
      return res.status(400).json({
        message: 'This paste is not password protected',
      });
    }
    
    // Verify the password
    const isPasswordValid = await paste.verifyPassword(password);
    
    if (!isPasswordValid) {
      return res.status(403).json({
        message: 'Invalid password',
      });
    }
    
    // Return success
    return res.status(200).json({
      message: 'Password verified successfully',
      success: true,
    });
  } catch (error) {
    console.error('Verify paste password error:', error);
    return res.status(500).json({
      message: 'Server error verifying password',
    });
  }
};

// Get recent public pastes
export const getRecentPastes = async (req: Request, res: Response) => {
  try {
    console.log('Getting recent pastes');
    const limit = parseInt(req.query.limit as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;
    
    const pastes = await Paste.findAll({
      where: {
        isPrivate: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } },
        ],
      },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl'],
      include: [
        {
          model: Block,
          as: 'blocks',
          attributes: ['id', 'content', 'language', 'order'],
          required: false,
        }
      ]
    });
    
    console.log(`Found ${pastes.length} recent pastes`);
    
    return res.status(200).json({
      pastes: pastes.map((paste) => {
        const hasBlocks = paste.isJupyterStyle();
        const blocks = paste.get('blocks') as Block[] || [];
        
        // Format content based on paste type
        let formattedContent = '';
        if (hasBlocks && blocks.length > 0) {
          // For Jupyter-style pastes, use the first block content as preview
          const firstBlock = blocks[0];
          formattedContent = firstBlock.content || '';
          if (formattedContent.length > 200) {
            formattedContent = `${formattedContent.slice(0, 200)}...`;
          }
        } else if (paste.content) {
          // For standard pastes, use the content field
          formattedContent = paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content;
        }
        
        return {
        id: paste.id,
        title: paste.title,
          content: formattedContent,
        createdAt: paste.createdAt,
        expiresAt: paste.expiresAt,
        views: paste.views,
        customUrl: paste.customUrl,
          isJupyterStyle: hasBlocks,
        };
      }),
    });
  } catch (error) {
    console.error('Get recent pastes error:', error);
    return res.status(500).json({
      message: 'Server error retrieving pastes',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Get user pastes
export const getUserPastes = async (req: Request, res: Response) => {
  try {
    // Since we're removing auth, just return an empty array
    return res.status(200).json({
      pastes: [],
    });
  } catch (error) {
    console.error('Get user pastes error:', error);
    return res.status(500).json({
      message: 'Server error retrieving pastes',
    });
  }
};

// Download a file
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const { pasteId, fileId } = req.params;
    
    console.log(`Download request for file ${fileId} from paste ${pasteId}`);
    console.log('Request headers:', req.headers);
    
    // First check if paste exists and is accessible
    const paste = await Paste.findByPk(pasteId);
    
    if (!paste) {
      console.log(`Paste ${pasteId} not found`);
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    if (paste.isExpired()) {
      console.log(`Paste ${pasteId} has expired`);
      return res.status(404).json({
        message: 'Paste has expired',
      });
    }
    
    // Determine if this paste was just created (within the last 10 minutes)
    // Use a longer window for file access
    const justCreated = Date.now() - new Date(paste.createdAt).getTime() < 600000; // 10 minutes
    
    // Get the file
    const file = await File.findOne({
      where: {
        id: fileId,
        pasteId,
      },
    });
    
    if (!file) {
      console.log(`File ${fileId} not found`);
      return res.status(404).json({
        message: 'File not found',
      });
    }
    
    console.log(`Sending file: ${file.originalname}, path: ${file.path}`);
    
    // Check if file exists on disk
    if (!fs.existsSync(file.path)) {
      console.error(`File not found on disk: ${file.path}`);
      // Try with absolute path if the relative path doesn't work
      const absolutePath = path.resolve(file.path);
      console.log(`Trying absolute path: ${absolutePath}`);
      
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({
          message: 'File not found on disk',
        });
      } else {
        // Use the absolute path instead
        file.path = absolutePath;
      }
    }
    
    // Add CORS headers if not present
    if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalname)}"`);
    res.setHeader('Content-Length', file.size.toString());
    
    console.log('Response headers before sending:', res.getHeaders());
    
    // Stream the file instead of loading it all into memory
    const fileStream = fs.createReadStream(file.path);
    
    // Handle stream errors before piping
    fileStream.on('error', (error) => {
      console.error(`Error streaming file: ${error}`);
      if (!res.headersSent) {
        res.status(500).json({
          message: 'Error streaming file',
        });
      }
    });
    
    // Log when streaming is finished
    fileStream.on('end', () => {
      console.log(`Finished streaming file: ${file.originalname}`);
    });
    
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download file error:', error);
    return res.status(500).json({
      message: 'Server error downloading file',
    });
  }
};

// Delete a paste
export const deletePaste = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const paste = await Paste.findByPk(id, {
      include: [
        {
          model: File,
          as: 'files',
        },
      ],
    });
    
    if (!paste) {
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    // Delete associated files from disk
    const files = paste.get('files') as File[];
    for (const file of files) {
      await deleteFile(file.path);
      await file.destroy();
    }
    
    // Delete paste from database
    await paste.destroy();
    
    return res.status(200).json({
      message: 'Paste deleted successfully',
    });
  } catch (error) {
    console.error('Delete paste error:', error);
    return res.status(500).json({
      message: 'Server error deleting paste',
    });
  }
};

// Edit an existing paste
export const editPaste = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    
    console.log('--- EDIT PASTE CONTROLLER ---');
    console.log('Request body:', req.body);
    console.log('typeof blocks:', typeof blocks, 'blocks:', blocks);
    
    // Check if the ID is a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Build the query condition based on whether id is a UUID
    const whereCondition = isValidUUID 
      ? { [Op.or]: [{ id }, { customUrl: id }] } 
      : { customUrl: id }; // Only check customUrl if not a UUID
      
    // Find paste using the appropriate condition
    const paste = await Paste.findOne({
      where: whereCondition,
      include: [
        {
          model: Block,
          as: 'blocks',
          required: false
        }
      ]
    });
    
    if (!paste) {
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    // Check if paste is expired
    if (paste.isExpired()) {
      return res.status(404).json({
        message: 'Paste has expired',
      });
    }
    
    // For editable check, use the canEdit method but pass null as userId
    if (!paste.canEdit(null)) {
      return res.status(403).json({
        message: 'You do not have permission to edit this paste',
      });
    }
    
    // Process Jupyter-style paste update
    let isJupyterUpdate = false;
    let parsedBlocks: any[] = [];
    
    try {
      if (typeof blocks === 'string') {
        parsedBlocks = JSON.parse(blocks);
        isJupyterUpdate = Array.isArray(parsedBlocks) && parsedBlocks.length > 0;
      } else if (Array.isArray(blocks)) {
        parsedBlocks = blocks;
        isJupyterUpdate = parsedBlocks.length > 0;
      }
    } catch (e) {
      isJupyterUpdate = false;
    }
    
    console.log('isJupyterUpdate:', isJupyterUpdate, 'parsedBlocks length:', parsedBlocks.length);
    
    // Handle transaction for database operations
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
        for (let i = 0; i < validBlocks.length; i++) {
          const block = validBlocks[i];
          const blockId = (block.id && typeof block.id === 'string' && 
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
            ? block.id 
            : require('crypto').randomUUID();
            
          const newBlock = await Block.create({
            id: blockId,
            content: block.content,
            language: block.language || 'text',
            order: i,
            pasteId: paste.id
          }, { transaction });
          
          insertedBlocks.push(newBlock);
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
              as: 'blocks',
              required: false
            }
          ]
        });
        
        // Get blocks from the association
        const pasteWithBlocks = paste as any; // Cast to any to access blocks property
        const blockRecords = pasteWithBlocks.blocks ? pasteWithBlocks.blocks.map((block: any) => ({
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
          },
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
          },
        });
      } else {
        // Only title was updated
        await transaction.commit();
        
        // Get blocks if any
        const pasteWithBlocks = paste as any; // Cast to any to access blocks property
        const blockRecords = pasteWithBlocks.blocks ? pasteWithBlocks.blocks.map((block: any) => ({
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
      },
    });
      }
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Edit paste error:', error);
    return res.status(500).json({
      message: 'Server error updating paste',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}; 