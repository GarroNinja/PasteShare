import User from './User';
import Paste from './Paste';
import File from './File';
import sequelize from '../config/database';

// Define associations
User.hasMany(Paste, {
  foreignKey: 'userId',
  as: 'pastes',
});

Paste.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

Paste.hasMany(File, {
  foreignKey: 'pasteId',
  as: 'files',
});

File.belongsTo(Paste, {
  foreignKey: 'pasteId',
  as: 'paste',
});

// Export models and connection
export { User, Paste, File, sequelize }; 