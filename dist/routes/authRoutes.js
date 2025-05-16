"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Register a new user
router.post('/register', authController_1.register);
// Login
router.post('/login', authController_1.login);
// Get user profile (protected route)
router.get('/profile', auth_1.authenticate, authController_1.getProfile);
exports.default = router;
