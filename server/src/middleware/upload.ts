import multer from 'multer';
import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

// Define upload directory - use absolute path
const UPLOAD_DIR = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

console.log('Using upload directory:', UPLOAD_DIR);

// Create directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('Created upload directory:', UPLOAD_DIR);
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Create unique filename with original extension
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  },
});

// File filter to only allow certain file types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Define allowed file types
  const allowedMimeTypes = [
    // Text files
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
    'application/javascript',
    
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/svg+xml',
    'image/webp',
    
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    
    // Code files
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'application/x-httpd-php',
    'text/markdown',
    'text/x-typescript',
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log(`Rejected file type: ${file.mimetype} for file ${file.originalname}`);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
};

// Size limits
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
};

// Export the configured multer middleware
export const upload = multer({
  storage,
  fileFilter,
  limits,
});

// Create a wrapper middleware that handles Multer errors
export const uploadMiddleware = (req: any, res: any, next: any) => {
  // Check content-type to see if it's a multipart request (has files)
  const contentType = req.headers['content-type'] || '';
  
  // If not a multipart request, skip file processing and continue
  if (!contentType.includes('multipart/form-data')) {
    console.log('No files detected in request, skipping multer');
    return next();
  }
  
  // Process files if present
  const uploadHandler = upload.array('files', 3);
  uploadHandler(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'File too large. Maximum size is 10MB.',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          message: 'Too many files. Maximum is 3 files.',
        });
      }
      return res.status(400).json({
        message: `File upload error: ${err.message}`
      });
    } else if (err) {
      // An unknown error occurred
      console.error('Unknown upload error:', err);
      return res.status(500).json({
        message: 'File upload failed.'
      });
    }
    
    // Everything went fine
    next();
  });
};

// Export file deletion function
export const deleteFile = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        // If file doesn't exist, just resolve
        if (err.code === 'ENOENT') {
          resolve();
        } else {
          reject(err);
        }
      } else {
        resolve();
      }
    });
  });
}; 