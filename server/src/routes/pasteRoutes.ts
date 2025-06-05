import { Router } from 'express';
import {
  createPaste,
  getPasteById,
  getRecentPastes,
  getUserPastes,
  downloadFile,
  deletePaste,
  editPaste,
  verifyPastePassword
} from '../controllers/pasteController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';
import { attachDb } from '../middleware/db';

const router = Router();

// Apply database middleware to all routes
router.use(attachDb);

// Debug route to test API connectivity
router.get('/debug', (req, res) => {
  res.status(200).json({
    message: 'API is working correctly',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Public routes
router.get('/recent', getRecentPastes);

// Create a new paste with optional file uploads (files field is an array of files)
router.post('/', uploadMiddleware, createPaste);

// Get a paste by ID or custom URL
router.get('/:id', getPasteById);

// Verify paste password
router.post('/:id/verify-password', verifyPastePassword);

// Download a file from a paste
router.get('/:pasteId/files/:fileId', downloadFile);

// Protected routes
router.get('/user/:userId', authenticate, getUserPastes);
router.delete('/:id', optionalAuth, deletePaste);
router.put('/:id', optionalAuth, editPaste);

export default router; 