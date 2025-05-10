// Initialize database tables
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('Connecting to database...');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log
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
  tableName: 'pastes'
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
    type: DataTypes.TEXT('long'),
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
  tableName: 'files'
});

// Set up associations
Paste.hasMany(File, { foreignKey: 'pasteId', as: 'Files' });
File.belongsTo(Paste, { foreignKey: 'pasteId', as: 'Paste' });

async function init() {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Sync models with database
    console.log('Syncing database models...');
    await sequelize.sync({ alter: true });
    
    console.log('Database tables have been created/updated successfully.');
    
    // Check if tables exist
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Available tables:', results.map(r => r.table_name));
    
    // Close connection
    await sequelize.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

init(); 