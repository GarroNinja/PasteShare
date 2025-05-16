"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = exports.testConnection = void 0;
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load environment variables from multiple potential locations
const loadEnvFiles = () => {
    // Try root directory .env
    const rootEnvPath = path_1.default.resolve(process.cwd(), '..', '.env');
    // Try server directory .env
    const serverEnvPath = path_1.default.resolve(process.cwd(), '.env');
    if (fs_1.default.existsSync(rootEnvPath)) {
        console.log('Loading .env from root directory');
        dotenv_1.default.config({ path: rootEnvPath });
    }
    if (fs_1.default.existsSync(serverEnvPath)) {
        console.log('Loading .env from server directory');
        dotenv_1.default.config({ path: serverEnvPath });
    }
    // Default load which works in some environments
    dotenv_1.default.config();
};
loadEnvFiles();
// Check for required DATABASE_URL
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set!');
}
// Initialize Sequelize with DATABASE_URL
const sequelize = new sequelize_1.Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: process.env.NODE_ENV === 'development',
    pool: {
        max: 3,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});
exports.sequelize = sequelize;
// Test connection function for health checks
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        return { connected: true, message: 'Database connection is healthy' };
    }
    catch (error) {
        console.error('Unable to connect to the database:', error);
        return { connected: false, message: 'Database connection failed', error };
    }
};
exports.testConnection = testConnection;
exports.default = sequelize;
