import { Router } from 'express';
import authRoutes from './authRoutes';
import pasteRoutes from './pasteRoutes';

const router = Router();

// API routes
router.use('/auth', authRoutes);
router.use('/pastes', pasteRoutes);

export default router; 