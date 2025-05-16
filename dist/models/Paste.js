"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
class Paste extends sequelize_1.Model {
    incrementViews() {
        this.views += 1;
        return this.save();
    }
    isExpired() {
        if (!this.expiresAt)
            return false;
        return new Date() > this.expiresAt;
    }
    // Check if user can edit this paste
    canEdit(userId) {
        // Since we removed authentication, anyone can edit if paste is marked as editable
        return this.isEditable;
    }
}
Paste.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
        primaryKey: true,
    },
    title: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Untitled Paste',
    },
    content: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    expiresAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    isPrivate: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    views: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    userId: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: true,
    },
    customUrl: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
            is: {
                args: /^[a-zA-Z0-9_-]+$/i,
                msg: 'Custom URL can only contain letters, numbers, underscores and hyphens'
            },
            len: {
                args: [3, 50],
                msg: 'Custom URL must be between 3 and 50 characters'
            }
        }
    },
    isEditable: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    sequelize: database_1.default,
    tableName: 'pastes',
    indexes: [
        {
            fields: ['userId'],
        },
        {
            fields: ['expiresAt'],
        },
        {
            fields: ['isPrivate'],
        },
        {
            fields: ['customUrl'],
            unique: true,
        },
    ],
});
exports.default = Paste;
