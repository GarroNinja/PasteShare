// fix-db-tables.js
// Script to fix the table name inconsistency issue
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

async function fixDatabaseTables() {
  console.log('Starting database table fix...');
  
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

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

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Check which tables exist
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Existing tables:', tables.map(t => t.table_name));
    
    // Check if we have both uppercase and lowercase variants
    const hasCapitalizedPastes = tables.some(t => t.table_name === 'Pastes');
    const hasLowercasePastes = tables.some(t => t.table_name === 'pastes');
    const hasCapitalizedFiles = tables.some(t => t.table_name === 'Files');
    const hasLowercaseFiles = tables.some(t => t.table_name === 'files');
    
    console.log('Table status:');
    console.log('- Capitalized Pastes:', hasCapitalizedPastes);
    console.log('- Lowercase pastes:', hasLowercasePastes);
    console.log('- Capitalized Files:', hasCapitalizedFiles);
    console.log('- Lowercase files:', hasLowercaseFiles);

    // Define temporary models for data migration
    const CapitalizedPaste = sequelize.define('Paste', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      title: DataTypes.STRING,
      content: DataTypes.TEXT,
      expiresAt: DataTypes.DATE,
      isPrivate: DataTypes.BOOLEAN,
      isEditable: DataTypes.BOOLEAN,
      customUrl: DataTypes.STRING,
      userId: DataTypes.UUID,
      views: DataTypes.INTEGER,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    }, {
      tableName: 'Pastes',
      timestamps: false
    });

    const LowercasePaste = sequelize.define('paste', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      title: DataTypes.STRING,
      content: DataTypes.TEXT,
      expiresAt: DataTypes.DATE,
      isPrivate: DataTypes.BOOLEAN,
      isEditable: DataTypes.BOOLEAN,
      customUrl: DataTypes.STRING,
      userId: DataTypes.UUID,
      views: DataTypes.INTEGER,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    }, {
      tableName: 'pastes',
      timestamps: false
    });

    const CapitalizedFile = sequelize.define('File', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      filename: DataTypes.STRING,
      originalname: DataTypes.STRING,
      mimetype: DataTypes.STRING,
      size: DataTypes.INTEGER,
      content: DataTypes.TEXT,
      PasteId: DataTypes.UUID,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    }, {
      tableName: 'Files',
      timestamps: false
    });

    const LowercaseFile = sequelize.define('file', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      filename: DataTypes.STRING,
      originalname: DataTypes.STRING,
      mimetype: DataTypes.STRING,
      size: DataTypes.INTEGER,
      path: DataTypes.STRING,
      pasteId: DataTypes.UUID,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    }, {
      tableName: 'files',
      timestamps: false
    });

    // If we have both table variants, migrate data from capitalized to lowercase
    if (hasCapitalizedPastes && hasLowercasePastes) {
      console.log('Migrating data from Pastes to pastes...');
      
      // Get data from capitalized table
      const capitalizedPastes = await CapitalizedPaste.findAll();
      console.log(`Found ${capitalizedPastes.length} pastes in Pastes table`);
      
      // Check if there's data to migrate
      if (capitalizedPastes.length > 0) {
        // Migrate each paste
        for (const paste of capitalizedPastes) {
          const pasteData = paste.get({ plain: true });
          
          try {
            // Check if already exists in lowercase table
            const existingPaste = await LowercasePaste.findByPk(pasteData.id);
            
            if (!existingPaste) {
              await LowercasePaste.create(pasteData);
              console.log(`Migrated paste ${pasteData.id}`);
            } else {
              console.log(`Paste ${pasteData.id} already exists in lowercase table`);
            }
          } catch (error) {
            console.error(`Error migrating paste ${pasteData.id}:`, error.message);
          }
        }
      }
    }

    // Migrate Files to files
    if (hasCapitalizedFiles && hasLowercaseFiles) {
      console.log('Migrating data from Files to files...');
      
      // Get data from capitalized table
      const capitalizedFiles = await CapitalizedFile.findAll();
      console.log(`Found ${capitalizedFiles.length} files in Files table`);
      
      // Check if there's data to migrate
      if (capitalizedFiles.length > 0) {
        // Migrate each file
        for (const file of capitalizedFiles) {
          const fileData = file.get({ plain: true });
          
          try {
            // Check if already exists in lowercase table
            const existingFile = await LowercaseFile.findByPk(fileData.id);
            
            if (!existingFile) {
              // Transform data: PasteId -> pasteId and add missing path field
              const transformedData = {
                ...fileData,
                pasteId: fileData.PasteId,
                path: fileData.filename // Use filename as path if not available
              };
              delete transformedData.PasteId;
              
              await LowercaseFile.create(transformedData);
              console.log(`Migrated file ${fileData.id}`);
            } else {
              console.log(`File ${fileData.id} already exists in lowercase table`);
            }
          } catch (error) {
            console.error(`Error migrating file ${fileData.id}:`, error.message);
          }
        }
      }
    }

    console.log('Migration complete');
    
    // Ask for confirmation before dropping capitalized tables
    console.log('');
    console.log('IMPORTANT: Review the migration results above before dropping the capitalized tables.');
    console.log('To drop the capitalized tables after confirming data was migrated properly,');
    console.log('run this script with the DROP_TABLES=true environment variable.');
    
    // Drop capitalized tables if confirmation flag is set
    if (process.env.DROP_TABLES === 'true') {
      if (hasCapitalizedPastes) {
        console.log('Dropping Pastes table...');
        await sequelize.query('DROP TABLE IF EXISTS "Pastes" CASCADE');
      }
      
      if (hasCapitalizedFiles) {
        console.log('Dropping Files table...');
        await sequelize.query('DROP TABLE IF EXISTS "Files" CASCADE');
      }
      
      console.log('Capitalized tables dropped successfully');
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await sequelize.close();
    console.log('Database connection closed');
  }
}

// Run the function
fixDatabaseTables(); 