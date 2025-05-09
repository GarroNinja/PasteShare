import { Request, Response } from 'express';
import { Paste, File, User } from '../models';
import { Op } from 'sequelize';
import { deleteFile } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

// Create a new paste
export const createPaste = async (req: Request, res: Response) => {
  try {
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    
    // Validate input
    if (!content) {
      return res.status(400).json({
        message: 'Content is required',
      });
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
    
    // Create paste without userId
    const paste = await Paste.create({
      title: title || 'Untitled Paste',
      content,
      expiresAt,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      isEditable: isEditable === 'true' || isEditable === true,
      customUrl: customUrl || null,
      userId: null,
    });
    
    // Handle file uploads
    const files = req.files as Express.Multer.File[];
    const uploadedFiles: any[] = [];
    
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} uploaded files for paste ${paste.id}`);
      
      for (const file of files) {
        console.log(`File: ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.size}, path: ${file.path}`);
        
        // Store absolute path for reliable access
        const absolutePath = path.resolve(file.path);
        
        const fileRecord = await File.create({
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: absolutePath,
          pasteId: paste.id,
        });
        
        console.log(`Created file record with ID: ${fileRecord.id}`);
        
        uploadedFiles.push({
          id: fileRecord.id,
          filename: fileRecord.originalname,
          size: fileRecord.size,
          url: `/pastes/${paste.id}/files/${fileRecord.id}`,
        });
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
        files: uploadedFiles,
      },
    });
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({
      message: 'Server error creating paste',
    });
  }
};

// Get a paste by ID or custom URL
export const getPasteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Find paste by ID or custom URL
    const paste = await Paste.findOne({
      where: {
        [Op.or]: [
          { id },
          { customUrl: id }
        ]
      },
      include: [
        {
          model: File,
          as: 'files',
          attributes: ['id', 'originalname', 'size', 'mimetype'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username'],
        },
      ],
    });
    
    if (!paste) {
      return res.status(404).json({
        message: 'Paste not found',
      });
    }
    
    // Allow access to all pastes regardless of whether they're private
    // Just check if paste is expired
    if (paste.isExpired()) {
      return res.status(404).json({
        message: 'Paste has expired',
      });
    }
    
    // Determine if this paste was just created (within the last 60 seconds)
    const justCreated = Date.now() - new Date(paste.createdAt).getTime() < 60000;
    
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
    
    // Check if current user can edit this paste
    const canEdit = paste.canEdit(null);
    
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
        user: paste.get('user'),
        files: formattedFiles,
        canEdit,
      },
    });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({
      message: 'Server error retrieving paste',
    });
  }
};

// Get recent public pastes
export const getRecentPastes = async (req: Request, res: Response) => {
  try {
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
    });
    
    return res.status(200).json({
      pastes: pastes.map((paste) => ({
        id: paste.id,
        title: paste.title,
        content: paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content,
        createdAt: paste.createdAt,
        expiresAt: paste.expiresAt,
        views: paste.views,
        customUrl: paste.customUrl,
      })),
    });
  } catch (error) {
    console.error('Get recent pastes error:', error);
    return res.status(500).json({
      message: 'Server error retrieving pastes',
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
    const { title, content } = req.body;
    
    // Find paste by ID or custom URL
    const paste = await Paste.findOne({
      where: {
        [Op.or]: [
          { id },
          { customUrl: id }
        ]
      },
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
      },
    });
  } catch (error) {
    console.error('Edit paste error:', error);
    return res.status(500).json({
      message: 'Server error updating paste',
    });
  }
}; 