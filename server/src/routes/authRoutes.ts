import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Register a new user
router.post('/register', register);

// Login
router.post('/login', login);

// Get user profile (protected route)
router.get('/profile', authenticate, getProfile);

export default router; 