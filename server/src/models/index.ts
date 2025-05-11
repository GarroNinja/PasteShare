import Paste from './Paste';
import File from './File';
import sequelize from '../config/database';

// Define associations
Paste.hasMany(File, {
  foreignKey: 'pasteId',
  as: 'files',
});

File.belongsTo(Paste, {
  foreignKey: 'pasteId',
  as: 'paste',
});

// Export models and connection
export { Paste, File, sequelize };
