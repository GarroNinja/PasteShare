"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFile = exports.uploadMiddleware = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Define upload directory - use absolute path
const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path_1.default.resolve(process.env.UPLOAD_DIR)
    : path_1.default.resolve(process.cwd(), 'uploads');
console.log('Using upload directory:', UPLOAD_DIR);
// Create directory if it doesn't exist
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('Created upload directory:', UPLOAD_DIR);
}
// Configure storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // Create unique filename with original extension
        const fileExt = path_1.default.extname(file.originalname);
        const fileName = `${(0, uuid_1.v4)()}${fileExt}`;
        cb(null, fileName);
    },
});
// File filter to only allow certain file types
const fileFilter = (req, file, cb) => {
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
    }
    else {
        console.log(`Rejected file type: ${file.mimetype} for file ${file.originalname}`);
        cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
};
// Size limits
const limits = {
    fileSize: 10 * 1024 * 1024, // 10MB
};
// Export the configured multer middleware
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits,
});
// Create a wrapper middleware that handles Multer errors
const uploadMiddleware = (req, res, next) => {
    // Check content-type to see if it's a multipart request (has files)
    const contentType = req.headers['content-type'] || '';
    // If not a multipart request, skip file processing and continue
    if (!contentType.includes('multipart/form-data')) {
        console.log('No files detected in request, skipping multer');
        return next();
    }
    // Process files if present
    const uploadHandler = exports.upload.array('files', 3);
    uploadHandler(req, res, function (err) {
        if (err instanceof multer_1.default.MulterError) {
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
        }
        else if (err) {
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
exports.uploadMiddleware = uploadMiddleware;
// Export file deletion function
const deleteFile = (filePath) => {
    return new Promise((resolve, reject) => {
        fs_1.default.unlink(filePath, (err) => {
            if (err) {
                // If file doesn't exist, just resolve
                if (err.code === 'ENOENT') {
                    resolve();
                }
                else {
                    reject(err);
                }
            }
            else {
                resolve();
            }
        });
    });
};
exports.deleteFile = deleteFile;
