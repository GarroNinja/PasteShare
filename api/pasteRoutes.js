// Paste routes for Vercel serverless functions
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Allow most common file types
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

// Simple in-memory store for pastes (will reset on function restart)
const pastes = [];

// Create a new paste
router.post('/', upload.array('files', 5), (req, res) => {
  try {
    const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
    
    // Validate input
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    // Check if custom URL is taken
    if (customUrl && pastes.some(p => p.customUrl === customUrl)) {
      return res.status(400).json({ message: 'Custom URL is already taken' });
    }
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn && parseInt(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
    }
    
    // Create paste
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
        buffer: file.buffer
      }));
    }
    
    // Add to store
    pastes.push(paste);
    
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
        files: paste.files.map(f => ({
          id: f.id,
          filename: f.originalname,
          size: f.size,
          url: `/api/pastes/${paste.id}/files/${f.id}`
        }))
      }
    });
  } catch (error) {
    console.error('Create paste error:', error);
    return res.status(500).json({ message: 'Server error creating paste' });
  }
});

// Get all recent public pastes
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const now = new Date();
    
    const publicPastes = pastes
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
        customUrl: paste.customUrl
      }));
    
    return res.status(200).json(publicPastes);
  } catch (error) {
    console.error('Get pastes error:', error);
    return res.status(500).json({ message: 'Server error retrieving pastes' });
  }
});

// Get a paste by ID or custom URL
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    
    // Find by ID or custom URL
    const paste = pastes.find(p => 
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
        canEdit: paste.isEditable
      }
    });
  } catch (error) {
    console.error('Get paste error:', error);
    return res.status(500).json({ message: 'Server error retrieving paste' });
  }
});

// Edit a paste
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const now = new Date();
    
    // Find by ID or custom URL
    const pasteIndex = pastes.findIndex(p => 
      (p.id === id || p.customUrl === id) && 
      (!p.expiresAt || p.expiresAt > now)
    );
    
    if (pasteIndex === -1) {
      return res.status(404).json({ message: 'Paste not found or has expired' });
    }
    
    const paste = pastes[pasteIndex];
    
    // Check if editable
    if (!paste.isEditable) {
      return res.status(403).json({ message: 'This paste is not editable' });
    }
    
    // Update paste
    if (title) paste.title = title;
    if (content) paste.content = content;
    paste.updatedAt = new Date();
    
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
        updatedAt: paste.updatedAt
      }
    });
  } catch (error) {
    console.error('Edit paste error:', error);
    return res.status(500).json({ message: 'Server error updating paste' });
  }
});

// Get a file from a paste
router.get('/:pasteId/files/:fileId', (req, res) => {
  try {
    const { pasteId, fileId } = req.params;
    const now = new Date();
    
    // Find paste
    const paste = pastes.find(p => 
      (p.id === pasteId || p.customUrl === pasteId) && 
      (!p.expiresAt || p.expiresAt > now)
    );
    
    if (!paste) {
      return res.status(404).json({ message: 'Paste not found or has expired' });
    }
    
    // Find file
    const file = paste.files.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Set headers
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalname)}"`);
    res.setHeader('Content-Length', file.size.toString());
    
    // Send file buffer
    return res.send(file.buffer);
  } catch (error) {
    console.error('Download file error:', error);
    return res.status(500).json({ message: 'Server error downloading file' });
  }
});

module.exports = router; 