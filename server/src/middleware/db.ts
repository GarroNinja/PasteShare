import { Request, Response, NextFunction } from 'express';
import { sequelize } from '../models';

// Database middleware to attach database connection to request
export const attachDb = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check database connection
    await sequelize.authenticate();
    
    // Attach database connection to request object
    (req as any).db = {
      sequelize,
      success: true
    };
    
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error);
    (req as any).db = {
      success: false,
      error
    };
    next();
  }
}; 