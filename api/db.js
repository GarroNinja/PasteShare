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
    
    // Use standard connection string, just adjust the port for Supabase
    let connectionString = process.env.DATABASE_URL;
    if (urlObj.hostname.includes('supabase')) {
      // Use connection pooler port for Supabase
      connectionString = connectionString.replace(/:5432\//g, ':6543/').replace(/:5432$/g, ':6543');
    }

    // Initialize a new Sequelize instance
    const sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 3,
        min: 0,
        acquire: 30000,
        idle: 10000
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
        allowNull: true, // Make content optional as we'll now store content in blocks
        defaultValue: null
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
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true
      }
    }, {
      tableName: 'pastes',
      timestamps: true,
      freezeTableName: true
    });

    // Add isJupyterStyle method to Paste model prototype
    Paste.prototype.isJupyterStyle = function() {
      return this.content === null || this.content === ''; // If content is empty/null, assume Jupyter-style
    };

    // Define Block model for Jupyter-style notebook blocks
    const Block = sequelize.define('Block', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      language: {
        type: DataTypes.STRING,
        defaultValue: 'text'
      },
      order: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      pasteId: {
        type: DataTypes.UUID,
        allowNull: false
      }
    }, {
      tableName: 'blocks',
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

    // Blocks association
    Paste.hasMany(Block, {
      foreignKey: 'pasteId',
      as: 'Blocks',
      onDelete: 'CASCADE'
    });

    Block.belongsTo(Paste, {
      foreignKey: 'pasteId',
      as: 'Paste'
    });

    return {
      success: true,
      sequelize,
      models: {
        Paste,
        File,
        Block
      },
      // Simple connection test
      async testConnection() {
        try {
          // Test basic connectivity
          await sequelize.authenticate();
          
          // Try a simple query
          const [tables] = await sequelize.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
          );
          
          const hasPastesTable = tables.some(t => t.table_name === 'pastes');
          const hasFilesTable = tables.some(t => t.table_name === 'files');
          const hasBlocksTable = tables.some(t => t.table_name === 'blocks');
          
          return {
            connected: true,
            tables: tables.map(t => t.table_name),
            hasPastesTable,
            hasFilesTable,
            hasBlocksTable
          };
        } catch (error) {
          console.error('Database connection test failed:', error.message);
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