"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pasteController_1 = require("../controllers/pasteController");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// Debug route to test API connectivity
router.get('/debug', (req, res) => {
    res.status(200).json({
        message: 'API is working correctly',
        timestamp: new Date().toISOString(),
        headers: req.headers
    });
});
// Create a new paste with optional file uploads (files field is an array of files)
router.post('/', upload_1.uploadMiddleware, pasteController_1.createPaste);
// Get a paste by ID or custom URL
router.get('/:id', pasteController_1.getPasteById);
// Edit a paste by ID or custom URL
router.put('/:id', pasteController_1.editPaste);
// Get recent public pastes
router.get('/', pasteController_1.getRecentPastes);
// Get user's pastes (protected route)
router.get('/user/pastes', pasteController_1.getUserPastes);
// Download a file
router.get('/:pasteId/files/:fileId', (req, res, next) => {
    console.log(`File download route hit for paste ${req.params.pasteId}, file ${req.params.fileId}`);
    console.log('Request URL:', req.originalUrl);
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    (0, pasteController_1.downloadFile)(req, res);
});
// Delete a paste
router.delete('/:id', pasteController_1.deletePaste);
exports.default = router;
