// Database initialization script for direct Cloud SQL connection
const { Sequelize, DataTypes } = require('sequelize');

// Main function
async function main() {
  try {
    // Check if DATABASE_URL is provided
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('Starting database initialization with Cloud SQL direct connection...');
    console.log('Database URL configured:', !!process.env.DATABASE_URL);
    
    // Parse the URL to determine connection type
    try {
      const url = new URL(process.env.DATABASE_URL);
      console.log('Connection type:', url.host === '/cloudsql' ? 'Cloud SQL Unix Socket' : 'TCP Connection');
    } catch (e) {
      console.log('Could not parse DATABASE_URL format');
    }
    
    // Initialize Sequelize with the database URL
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: console.log,
      dialectOptions: {
        ssl: {
          require: false,
          rejectUnauthorized: false
        }
      }
    });
    
    // Define Paste model
    const Paste = sequelize.define('pastes', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Untitled Paste',
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      isPrivate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      views: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      customUrl: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      isEditable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    }, {
      tableName: 'pastes',
      timestamps: true,
    });

    // Define File model
    const File = sequelize.define('files', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      originalname: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      mimetype: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
      },
      path: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '',
      },
      pasteId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    }, {
      tableName: 'files',
      timestamps: true,
    });

    // Define relationships
    Paste.hasMany(File, {
      foreignKey: 'pasteId',
      as: 'files',
      onDelete: 'CASCADE'
    });

    File.belongsTo(Paste, {
      foreignKey: 'pasteId',
      as: 'paste'
    });

    // Test connection
    try {
      await sequelize.authenticate();
      console.log('Database connection has been established successfully.');
    } catch (error) {
      console.error('Unable to connect to the database:', error.message);
      throw error;
    }

    // Check for existing tables
    try {
      const [results] = await sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      console.log('Existing tables:', results.map(r => r.table_name));
    } catch (e) {
      console.error('Error checking tables:', e.message);
    }

    // Check if the verification is enough or if we should proceed with syncing
    const shouldSync = process.env.FORCE_SYNC === 'true';
    
    if (shouldSync) {
      // Sync models with force:true to recreate tables
      console.log('Syncing database models with force:true...');
      try {
        await sequelize.sync({ force: true });
        console.log('Database tables have been created successfully.');
        
        // Create a sample paste for testing
        const paste = await Paste.create({
          title: 'Test Paste',
          content: 'This is a test paste to verify database initialization',
          isPrivate: false,
          isEditable: true,
        });
        console.log('Created test paste with ID:', paste.id);
      } catch (error) {
        console.error('Error syncing database models:', error.message);
        throw error;
      }
    } else {
      console.log('Skipping table creation - set FORCE_SYNC=true to recreate tables');
      
      // Just sync without force to update any schema changes
      await sequelize.sync({ alter: false });
      console.log('Database schema verified without making changes');
    }

    console.log('Database initialization completed successfully!');
    await sequelize.close();
    return true;
  } catch (error) {
    console.error('Error initializing database:', error.message);
    return false;
  }
}

// Run the main function
main()
  .then(success => {
    console.log('Exit status:', success ? 'SUCCESS' : 'FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }); 