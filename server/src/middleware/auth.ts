import { Request, Response, NextFunction } from 'express';

// Extend Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Authentication middleware
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // For now, we'll just pass through since we don't have real authentication
  // This is a placeholder for future authentication implementation
  req.user = null;
  next();
};

// Optional authentication middleware
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  // For now, we'll just pass through since we don't have real authentication
  // This is a placeholder for future authentication implementation
  req.user = null;
  next();
}; 