// Simplified database connection module for Vercel deployment
const { Sequelize, DataTypes } = require('sequelize');

// Get database URL from environment
const dbUrl = process.env.DATABASE_URL;

// Create Sequelize instance with optimal Vercel configuration
const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    },
    keepAlive: true
  },
  pool: {
    max: 2, // Keep pool size small for serverless
    min: 0,
    idle: 10000,
    acquire: 30000,
    evict: 10000
  },
  logging: false,
  retry: {
    max: 3
  }
});

// Define Paste model
const Paste = sequelize.define('Paste', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Untitled Paste'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isEditable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  customUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'pastes',
  timestamps: true
});

// Define File model
const File = sequelize.define('File', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originalname: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mimetype: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  pasteId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'pastes',
      key: 'id'
    }
  }
}, {
  tableName: 'files',
  timestamps: true
});

// Set up associations
Paste.hasMany(File, { foreignKey: 'pasteId', as: 'Files' });
File.belongsTo(Paste, { foreignKey: 'pasteId', as: 'Paste' });

// Test database connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return false;
  }
}

// Export models and utilities
module.exports = {
  sequelize,
  Paste,
  File,
  testConnection
}; 