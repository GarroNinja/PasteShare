import express from 'express';
import pasteRoutes from './pasteRoutes';

const router = express.Router();

// Mount route groups
router.use('/pastes', pasteRoutes);

export default router; 