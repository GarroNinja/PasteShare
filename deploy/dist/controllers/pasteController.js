"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editPaste = exports.deletePaste = exports.downloadFile = exports.getUserPastes = exports.getRecentPastes = exports.getPasteById = exports.createPaste = void 0;
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
const upload_1 = require("../middleware/upload");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Create a new paste
const createPaste = async (req, res) => {
    try {
        const { title, content, expiresIn, isPrivate, customUrl, isEditable } = req.body;
        // Validate input
        if (!content) {
            return res.status(400).json({
                message: 'Content is required',
            });
        }
        // If custom URL is provided, check if it's already taken
        if (customUrl) {
            const existingPaste = await models_1.Paste.findOne({
                where: { customUrl },
            });
            if (existingPaste) {
                return res.status(400).json({
                    message: 'Custom URL is already taken',
                });
            }
        }
        // Calculate expiry date if provided
        let expiresAt = null;
        if (expiresIn && parseInt(expiresIn) > 0) {
            expiresAt = new Date(Date.now() + parseInt(expiresIn) * 1000);
        }
        // Create paste without userId
        const paste = await models_1.Paste.create({
            title: title || 'Untitled Paste',
            content,
            expiresAt,
            isPrivate: isPrivate === 'true' || isPrivate === true,
            isEditable: isEditable === 'true' || isEditable === true,
            customUrl: customUrl || null,
            userId: null,
        });
        // Handle file uploads
        const files = req.files;
        const uploadedFiles = [];
        if (files && files.length > 0) {
            console.log(`Processing ${files.length} uploaded files for paste ${paste.id}`);
            for (const file of files) {
                console.log(`File: ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.size}, path: ${file.path}`);
                // Store absolute path for reliable access
                const absolutePath = path_1.default.resolve(file.path);
                const fileRecord = await models_1.File.create({
                    filename: file.filename,
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    path: absolutePath,
                    content: Buffer.from("").toString("base64"),
                    pasteId: paste.id,
                });
                console.log(`Created file record with ID: ${fileRecord.id}`);
                uploadedFiles.push({
                    id: fileRecord.id,
                    filename: fileRecord.originalname,
                    size: fileRecord.size,
                    url: `/pastes/${paste.id}/files/${fileRecord.id}`,
                });
            }
        }
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
                files: uploadedFiles,
            },
        });
    }
    catch (error) {
        console.error('Create paste error:', error);
        return res.status(500).json({
            message: 'Server error creating paste',
        });
    }
};
exports.createPaste = createPaste;
// Get a paste by ID or custom URL
const getPasteById = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if the ID is a valid UUID format
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        // Build the query condition based on whether id is a UUID
        const whereCondition = isValidUUID
            ? { [sequelize_1.Op.or]: [{ id }, { customUrl: id }] }
            : { customUrl: id }; // Only check customUrl if not a UUID
        // Find paste using the appropriate condition
        const paste = await models_1.Paste.findOne({
            where: whereCondition,
            include: [
                {
                    model: models_1.File,
                    as: 'files',
                    attributes: ['id', 'originalname', 'size', 'mimetype'],
                },
            ],
        });
        if (!paste) {
            return res.status(404).json({
                message: 'Paste not found',
            });
        }
        // Allow access to all pastes regardless of whether they're private
        // Just check if paste is expired
        if (paste.isExpired()) {
            return res.status(404).json({
                message: 'Paste has expired',
            });
        }
        // Determine if this paste was just created (within the last 60 seconds)
        const justCreated = Date.now() - new Date(paste.createdAt).getTime() < 60000;
        // Increment view count
        await paste.incrementViews();
        // Format files
        const files = paste.get('files');
        const formattedFiles = files.map((file) => ({
            id: file.id,
            filename: file.originalname,
            size: file.size,
            url: `/pastes/${paste.id}/files/${file.id}`,
        }));
        // Check if current user can edit this paste
        const canEdit = paste.canEdit(null);
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
                files: formattedFiles,
                canEdit,
            },
        });
    }
    catch (error) {
        console.error('Get paste error:', error);
        return res.status(500).json({
            message: 'Server error retrieving paste',
        });
    }
};
exports.getPasteById = getPasteById;
// Get recent public pastes
const getRecentPastes = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        const pastes = await models_1.Paste.findAll({
            where: {
                isPrivate: false,
                [sequelize_1.Op.or]: [
                    { expiresAt: null },
                    { expiresAt: { [sequelize_1.Op.gt]: new Date() } },
                ],
            },
            limit,
            offset,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'title', 'content', 'createdAt', 'expiresAt', 'views', 'customUrl'],
        });
        return res.status(200).json({
            pastes: pastes.map((paste) => ({
                id: paste.id,
                title: paste.title,
                content: paste.content.length > 200 ? `${paste.content.slice(0, 200)}...` : paste.content,
                createdAt: paste.createdAt,
                expiresAt: paste.expiresAt,
                views: paste.views,
                customUrl: paste.customUrl,
            })),
        });
    }
    catch (error) {
        console.error('Get recent pastes error:', error);
        return res.status(500).json({
            message: 'Server error retrieving pastes',
        });
    }
};
exports.getRecentPastes = getRecentPastes;
// Get user pastes
const getUserPastes = async (req, res) => {
    try {
        // Since we're removing auth, just return an empty array
        return res.status(200).json({
            pastes: [],
        });
    }
    catch (error) {
        console.error('Get user pastes error:', error);
        return res.status(500).json({
            message: 'Server error retrieving pastes',
        });
    }
};
exports.getUserPastes = getUserPastes;
// Download a file
const downloadFile = async (req, res) => {
    try {
        const { pasteId, fileId } = req.params;
        console.log(`Download request for file ${fileId} from paste ${pasteId}`);
        console.log('Request headers:', req.headers);
        // First check if paste exists and is accessible
        const paste = await models_1.Paste.findByPk(pasteId);
        if (!paste) {
            console.log(`Paste ${pasteId} not found`);
            return res.status(404).json({
                message: 'Paste not found',
            });
        }
        if (paste.isExpired()) {
            console.log(`Paste ${pasteId} has expired`);
            return res.status(404).json({
                message: 'Paste has expired',
            });
        }
        // Determine if this paste was just created (within the last 10 minutes)
        // Use a longer window for file access
        const justCreated = Date.now() - new Date(paste.createdAt).getTime() < 600000; // 10 minutes
        // Get the file
        const file = await models_1.File.findOne({
            where: {
                id: fileId,
                pasteId,
            },
        });
        if (!file) {
            console.log(`File ${fileId} not found`);
            return res.status(404).json({
                message: 'File not found',
            });
        }
        console.log(`Sending file: ${file.originalname}, path: ${file.path}`);
        // Check if file exists on disk
        if (!fs_1.default.existsSync(file.path)) {
            console.error(`File not found on disk: ${file.path}`);
            // Try with absolute path if the relative path doesn't work
            const absolutePath = path_1.default.resolve(file.path);
            console.log(`Trying absolute path: ${absolutePath}`);
            if (!fs_1.default.existsSync(absolutePath)) {
                return res.status(404).json({
                    message: 'File not found on disk',
                });
            }
            else {
                // Use the absolute path instead
                file.path = absolutePath;
            }
        }
        // Add CORS headers if not present
        if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        // Set appropriate headers
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalname)}"`);
        res.setHeader('Content-Length', file.size.toString());
        console.log('Response headers before sending:', res.getHeaders());
        // Stream the file instead of loading it all into memory
        const fileStream = fs_1.default.createReadStream(file.path);
        // Handle stream errors before piping
        fileStream.on('error', (error) => {
            console.error(`Error streaming file: ${error}`);
            if (!res.headersSent) {
                res.status(500).json({
                    message: 'Error streaming file',
                });
            }
        });
        // Log when streaming is finished
        fileStream.on('end', () => {
            console.log(`Finished streaming file: ${file.originalname}`);
        });
        fileStream.pipe(res);
    }
    catch (error) {
        console.error('Download file error:', error);
        return res.status(500).json({
            message: 'Server error downloading file',
        });
    }
};
exports.downloadFile = downloadFile;
// Delete a paste
const deletePaste = async (req, res) => {
    try {
        const { id } = req.params;
        const paste = await models_1.Paste.findByPk(id, {
            include: [
                {
                    model: models_1.File,
                    as: 'files',
                },
            ],
        });
        if (!paste) {
            return res.status(404).json({
                message: 'Paste not found',
            });
        }
        // Delete associated files from disk
        const files = paste.get('files');
        for (const file of files) {
            await (0, upload_1.deleteFile)(file.path);
            await file.destroy();
        }
        // Delete paste from database
        await paste.destroy();
        return res.status(200).json({
            message: 'Paste deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete paste error:', error);
        return res.status(500).json({
            message: 'Server error deleting paste',
        });
    }
};
exports.deletePaste = deletePaste;
// Edit an existing paste
const editPaste = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        // Check if the ID is a valid UUID format
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        // Build the query condition based on whether id is a UUID
        const whereCondition = isValidUUID
            ? { [sequelize_1.Op.or]: [{ id }, { customUrl: id }] }
            : { customUrl: id }; // Only check customUrl if not a UUID
        // Find paste using the appropriate condition
        const paste = await models_1.Paste.findOne({
            where: whereCondition,
        });
        if (!paste) {
            return res.status(404).json({
                message: 'Paste not found',
            });
        }
        // Check if paste is expired
        if (paste.isExpired()) {
            return res.status(404).json({
                message: 'Paste has expired',
            });
        }
        // For editable check, use the canEdit method but pass null as userId
        if (!paste.canEdit(null)) {
            return res.status(403).json({
                message: 'You do not have permission to edit this paste',
            });
        }
        // Update paste
        if (title)
            paste.title = title;
        if (content)
            paste.content = content;
        await paste.save();
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
                updatedAt: paste.updatedAt,
            },
        });
    }
    catch (error) {
        console.error('Edit paste error:', error);
        return res.status(500).json({
            message: 'Server error updating paste',
        });
    }
};
exports.editPaste = editPaste;
