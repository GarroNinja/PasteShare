// Database initialization script for Cloud SQL (local proxy version)
const { Sequelize, DataTypes } = require('sequelize');
const readline = require('readline');

// Create readline interface for password input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask for database password
const promptPassword = () => new Promise((resolve) => {
  rl.question('Enter database password: ', (password) => {
    console.log(''); // New line after password
    resolve(password);
    rl.close();
  });
});

// Main function
async function main() {
  try {
    // Get password from user
    const password = await promptPassword();
    
    // First try connecting to postgres to create the pasteshare database if it doesn't exist
    console.log('Checking if database exists...');
    const rootConnection = new Sequelize(`postgres://postgres:${password}@localhost:5432/postgres`, {
      dialect: 'postgres',
      logging: false
    });
    
    try {
      await rootConnection.authenticate();
      console.log('Connected to postgres database successfully.');
      
      // Check if database exists
      const [results] = await rootConnection.query(
        "SELECT 1 FROM pg_database WHERE datname = 'pasteshare'"
      );
      
      if (results.length === 0) {
        console.log('Database "pasteshare" does not exist. Creating it...');
        await rootConnection.query('CREATE DATABASE pasteshare;');
        console.log('Database created successfully.');
      } else {
        console.log('Database "pasteshare" already exists.');
      }
      
      await rootConnection.close();
    } catch (error) {
      console.error('Failed to connect to postgres database:', error.message);
      if (rootConnection) await rootConnection.close();
      throw new Error('Database connection failed. Please check your password and try again.');
    }
    
    // Construct the database URL for local connection via Cloud SQL Proxy
    const localDbUrl = `postgres://postgres:${password}@localhost:5432/pasteshare`;
    console.log('Database URL configured:', !!localDbUrl);
    
    console.log('Starting database initialization...');
    
    // Initialize Sequelize with the database URL
    const sequelize = new Sequelize(localDbUrl, {
      dialect: 'postgres',
      logging: console.log
    });
    
    // Define Paste model exactly as shown in the schema
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

    // Define File model exactly as shown in the schema
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

    // Test connection to pasteshare database
    try {
      await sequelize.authenticate();
      console.log('Database connection to pasteshare has been established successfully.');
    } catch (error) {
      console.error('Unable to connect to pasteshare database:', error.message);
      throw error;
    }

    // Check for existing tables
    try {
      const [results] = await sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      console.log('Existing tables:', results.map(r => r.table_name));
    } catch (e) {
      console.error('Error checking tables:', e.message);
    }

    // Ask for confirmation before proceeding with force sync
    const confirmForceSync = await new Promise((resolve) => {
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl2.question('This will DROP and recreate all tables. Are you sure? (y/n): ', (answer) => {
        resolve(answer.toLowerCase() === 'y');
        rl2.close();
      });
    });
    
    if (!confirmForceSync) {
      console.log('Operation cancelled by user.');
      await sequelize.close();
      return false;
    }

    // Sync models with force:true to recreate tables
    console.log('Syncing database models...');
    try {
      await sequelize.sync({ force: true });
      console.log('Database tables have been created successfully.');
    } catch (error) {
      console.error('Error syncing database models:', error.message);
      throw error;
    }

    // Verify tables were created
    const [tables] = await sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables after sync:', tables.map(t => t.table_name));

    // Verify columns in pastes table
    const [pasteColumns] = await sequelize.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pastes'");
    console.log('Paste table columns:', pasteColumns.map(c => `${c.column_name} (${c.data_type})`));

    // Verify columns in files table
    const [fileColumns] = await sequelize.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'files'");
    console.log('File table columns:', fileColumns.map(c => `${c.column_name} (${c.data_type})`));

    // Create a sample paste for testing
    try {
      const paste = await Paste.create({
        title: 'Test Paste',
        content: 'This is a test paste to verify database initialization',
        isPrivate: false,
        isEditable: true,
      });
      console.log('Created test paste with ID:', paste.id);
    } catch (error) {
      console.error('Error creating test paste:', error.message);
      // Continue even if test paste creation fails
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