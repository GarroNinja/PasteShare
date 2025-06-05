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
    
    // Build connection string with correct parameters for Supabase
    let connectionString = process.env.DATABASE_URL;
    
    // Add connection pooling for Supabase environments
    if (urlObj.hostname.includes('supabase')) {
      // Force port 6543 for connection pooling
      connectionString = connectionString.replace(/:5432\//g, ':6543/').replace(/:5432$/g, ':6543');
      
      // Add connection parameters if not already present
      if (!urlObj.searchParams.has('pool')) {
        const connector = connectionString.includes('?') ? '&' : '?';
        connectionString += `${connector}pool=true&sslmode=require`;
      }
      console.log('Using Supabase connection pooler with enhanced configuration');
    }

    // Initialize a new Sequelize instance with optimized settings for serverless
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
        statement_timeout: 30000, // Reduce to 30s to ensure completion within function time limit
        idle_in_transaction_session_timeout: 30000, // Reduce to 30s
        // Add better handling for transaction issues
        query_timeout: 30000,
        application_name: 'pasteshare_serverless'
      },
      pool: {
        max: 3,         // Reduced to conserve memory
        min: 0,         // Start with 0 connections
        acquire: 30000,  // Reduced acquire timeout
        idle: 10000,     // Keep idle time reasonable
        evict: 1000,     // Check for idle connections every 1s
        // Handle connection errors gracefully
        validate: async (client) => {
          try {
            // Check if connection is still valid
            await client.query('SELECT 1');
            return true;
          } catch (e) {
            console.error('Connection validation failed:', e.message);
            return false;
          }
        }
      },
      retry: {
        max: 3,          // Reduced retry attempts to conserve function time
        match: [/Deadlock/i, /Lock wait timeout/i, /current transaction is aborted/i]
      },
      // Add hooks for better transaction management
      hooks: {
        afterConnect: async (connection) => {
          // Set reasonable statement timeout
          await connection.query('SET statement_timeout = 30000');
          // Set reasonable idle in transaction timeout
          await connection.query('SET idle_in_transaction_session_timeout = 30000');
        }
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
      },
      isJupyterStyle: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'pastes',
      timestamps: true,
      freezeTableName: true
    });

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
      // Helper to test the connection
      async testConnection() {
        try {
          const startTime = Date.now();
          const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 10000)  // Increased timeout
          );
          
          // First test basic authentication
          await Promise.race([sequelize.authenticate(), timeout]);
          const authTime = Date.now() - startTime;
          
          // Now try a simple query to check tables
          let tablesResult = [];
          let queryTime = 0;
          let tableCount = 0;
          let queryWorking = false;
          
          try {
            const queryStartTime = Date.now();
            const [tables] = await sequelize.query(
              "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            );
            
            queryTime = Date.now() - queryStartTime;
            tablesResult = tables.map(t => t.table_name);
            tableCount = tables.length;
            queryWorking = true;
          } catch (queryError) {
            console.error('Query error during connection test:', queryError);
            return {
              connected: true,
              queryWorking: false,
              authTime,
              queryError: queryError.message,
              fullError: process.env.NODE_ENV === 'development' ? queryError : undefined
            };
          }
          
          const hasPastesTable = tablesResult.some(t => t.toLowerCase() === 'pastes');
          const hasFilesTable = tablesResult.some(t => t.toLowerCase() === 'files');
          const hasBlocksTable = tablesResult.some(t => t.toLowerCase() === 'blocks');
          
          // Check additional details about columns in pastes table
          let pastesColumns = [];
          let hasJupyterStyleColumn = false;
          
          if (hasPastesTable) {
            try {
              // Get column names from pastes table with case-insensitive comparison
              const [columns] = await sequelize.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes'"
              );
              
              pastesColumns = columns.map(c => c.column_name);
              
              // Check for isJupyterStyle column (case-insensitive)
              hasJupyterStyleColumn = pastesColumns.some(c => 
                c.toLowerCase() === 'isjupyterstyle' || c.toLowerCase() === 'is_jupyter_style'
              );
              
              // If column doesn't exist, try to add it
              if (!hasJupyterStyleColumn) {
                try {
                  console.log('isJupyterStyle column not found, attempting to add it...');
                  await sequelize.query('ALTER TABLE "pastes" ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE');
                  console.log('Successfully added isJupyterStyle column');
                  hasJupyterStyleColumn = true;
                } catch (alterError) {
                  console.error('Failed to add isJupyterStyle column:', alterError.message);
                }
              }
            } catch (columnsError) {
              console.error('Error checking paste columns:', columnsError);
            }
          }
          
          // Check additional details about blocks table if it exists
          let blocksTableDetails = null;
          if (hasBlocksTable) {
            try {
              const [columns] = await sequelize.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'blocks'"
              );
              blocksTableDetails = {
                columnCount: columns.length,
                columns: columns.map(c => c.column_name)
              };
            } catch (e) {
              blocksTableDetails = { error: e.message };
            }
          } else {
            // If blocks table doesn't exist, try to create it
            try {
              console.log('blocks table not found, attempting to create it...');
              await sequelize.query(`
                CREATE TABLE IF NOT EXISTS "blocks" (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  content TEXT NOT NULL,
                  language VARCHAR(50) DEFAULT 'text',
                  "order" INTEGER NOT NULL,
                  "pasteId" UUID NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
                  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
              `);
              console.log('Successfully created blocks table');
              hasBlocksTable = true;
            } catch (createError) {
              console.error('Failed to create blocks table:', createError.message);
            }
          }
          
          return {
            connected: true,
            queryWorking: true,
            tables: tablesResult,
            tableCount,
            hasPastesTable,
            hasFilesTable,
            hasBlocksTable,
            hasJupyterStyleColumn,
            pastesColumns,
            connectionStats: {
              authTime,
              queryTime,
              totalTime: Date.now() - startTime
            },
            blocksTableDetails,
            url: process.env.DATABASE_URL ? 
              (new URL(process.env.DATABASE_URL)).hostname : 
              'unknown'
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