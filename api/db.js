// Database connection module for serverless environment
const { Sequelize, DataTypes } = require('sequelize');
const { Op } = Sequelize;

// Create a database connection
const createConnection = () => {
  // Check if DATABASE_URL is present
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    return { success: false, error: 'Database URL not configured' };
  }

  try {
    // Parse and validate the URL
    const urlObj = new URL(process.env.DATABASE_URL);
    
    // Always use Supabase's connection pooler on port 6543
    let connectionString = process.env.DATABASE_URL;
    if (urlObj.hostname.includes('supabase')) {
      // Force port 6543 for connection pooling
      connectionString = connectionString.replace(/:5432\//g, ':6543/').replace(/:5432$/g, ':6543');
      console.log('Using Supabase connection pooler');
    }

    // Initialize a new Sequelize instance
    const sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        },
        keepAlive: true,
        connectTimeout: 30000,
        statement_timeout: 60000, // 60s statement timeout
        idle_in_transaction_session_timeout: 60000 // 60s idle timeout
      },
      pool: {
        max: 5,         // Increase max connections for large uploads
        min: 0,         // Start with 0 connections
        acquire: 60000,  // Increased time to get a connection
        idle: 10000,     // Increased time before removing unused connections
        evict: 1000      // Check for idle connections every 1s
      },
      retry: {
        max: 5          // Increased retry attempts
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
        defaultValue: false
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
      timestamps: true,
      freezeTableName: true
    });

    // Define File model with optimized type for large file content
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
        type: DataTypes.TEXT('long'),  // For PostgreSQL, this becomes TEXT which can store GB of data
        allowNull: false
      },
      pasteId: {
        type: DataTypes.UUID,
        allowNull: false
      }
    }, {
      tableName: 'files',
      timestamps: true,
      freezeTableName: true
    });

    // Define associations
    Paste.hasMany(File, {
      foreignKey: 'pasteId',
      as: 'Files',
      onDelete: 'CASCADE'
    });

    File.belongsTo(Paste, {
      foreignKey: 'pasteId',
      as: 'Paste'
    });

    return {
      success: true,
      sequelize,
      models: {
        Paste,
        File
      },
      // Helper to test the connection
      async testConnection() {
        try {
          const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 10000)  // Increased timeout
          );
          
          await Promise.race([sequelize.authenticate(), timeout]);
          
          // Try a simple query to check tables
          const [tables] = await sequelize.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
          );
          
          return {
            connected: true,
            tables: tables.map(t => t.table_name),
            hasPastesTable: tables.some(t => t.table_name === 'pastes'),
            hasFilesTable: tables.some(t => t.table_name === 'files')
          };
        } catch (error) {
          console.error('Connection test failed:', error.message);
          return {
            connected: false,
            error: error.message
          };
        }
      }
    };
  } catch (error) {
    console.error('Database configuration error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createConnection,
  Sequelize,
  Op
}; 