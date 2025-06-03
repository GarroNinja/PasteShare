import Paste from './Paste';
import File from './File';
import Block from './Block';
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

// Define Block associations
Paste.hasMany(Block, {
  foreignKey: 'pasteId',
  as: 'blocks',
});

Block.belongsTo(Paste, {
  foreignKey: 'pasteId',
  as: 'paste',
});

// Export models and connection
export { Paste, File, Block, sequelize };
