"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = exports.File = exports.Paste = void 0;
const Paste_1 = __importDefault(require("./Paste"));
exports.Paste = Paste_1.default;
const File_1 = __importDefault(require("./File"));
exports.File = File_1.default;
const database_1 = __importDefault(require("../config/database"));
exports.sequelize = database_1.default;
// Define associations
Paste_1.default.hasMany(File_1.default, {
    foreignKey: 'pasteId',
    as: 'files',
});
File_1.default.belongsTo(Paste_1.default, {
    foreignKey: 'pasteId',
    as: 'paste',
});
