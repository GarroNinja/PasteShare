import { Router } from 'express';
import {
  createPaste,
  getPasteById,
  getRecentPastes,
  getUserPastes,
  downloadFile,
  deletePaste,
  editPaste
} from '../controllers/pasteController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';

const router = Router();

// Debug route to test API connectivity
router.get('/debug', (req, res) => {
  res.status(200).json({
    message: 'API is working correctly',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Create a new paste with optional file uploads (files field is an array of files)
router.post('/', optionalAuth, uploadMiddleware, createPaste);

// Get a paste by ID or custom URL
router.get('/:id', optionalAuth, getPasteById);

// Edit a paste by ID or custom URL
router.put('/:id', optionalAuth, editPaste);

// Get recent public pastes
router.get('/', getRecentPastes);

// Get user's pastes (protected route)
router.get('/user/pastes', authenticate, getUserPastes);

// Download a file
router.get('/:pasteId/files/:fileId', optionalAuth, (req, res, next) => {
  console.log(`File download route hit for paste ${req.params.pasteId}, file ${req.params.fileId}`);
  console.log('Request URL:', req.originalUrl);
  console.log('Request method:', req.method);
  console.log('Request query:', req.query);
  downloadFile(req, res);
});

// Delete a paste (protected route)
router.delete('/:id', authenticate, deletePaste);

export default router; 