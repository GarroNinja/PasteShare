"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = exports.login = exports.register = void 0;
const models_1 = require("../models");
const jwt_1 = require("../utils/jwt");
const sequelize_1 = require("sequelize");
const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({
                message: 'Username, email, and password are required',
            });
        }
        // Check if user already exists
        const existingUser = await models_1.User.findOne({
            where: {
                [sequelize_1.Op.or]: [{ username }, { email }],
            },
        });
        if (existingUser) {
            return res.status(409).json({
                message: 'Username or email already exists',
            });
        }
        // Create new user
        const user = await models_1.User.create({
            username,
            email,
            password,
        });
        // Generate JWT token
        const token = (0, jwt_1.generateToken)({
            userId: user.id,
            username: user.username,
        });
        return res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
            message: 'Server error during registration',
        });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required',
            });
        }
        // Find user by email
        const user = await models_1.User.findOne({
            where: { email },
        });
        if (!user) {
            return res.status(401).json({
                message: 'Invalid credentials',
            });
        }
        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                message: 'Invalid credentials',
            });
        }
        // Generate JWT token
        const token = (0, jwt_1.generateToken)({
            userId: user.id,
            username: user.username,
        });
        return res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            message: 'Server error during login',
        });
    }
};
exports.login = login;
const getProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }
        const user = await models_1.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            });
        }
        return res.status(200).json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({
            message: 'Server error retrieving profile',
        });
    }
};
exports.getProfile = getProfile;
