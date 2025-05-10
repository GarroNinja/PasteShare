const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

async function initializeDatabase() {
  console.log('Initializing database tables...');
  
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
    tableName: 'Pastes',
    timestamps: true,
    freezeTableName: true
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
    }
  }, {
    tableName: 'Files',
    timestamps: true,
    freezeTableName: true
  });

  // Define relationships
  Paste.hasMany(File, { 
    onDelete: 'CASCADE',
    foreignKey: 'PasteId'
  });
  File.belongsTo(Paste, {
    foreignKey: 'PasteId'
  });

  try {
    // Tables don't exist, sync them (never force in production)
    const forceSync = false; // Never force in production
    await sequelize.sync(); // Remove the parameter to use defaults
    console.log('Database tables synchronized successfully');
    
    // Verify tables were created
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Database tables:', results.map(r => r.table_name));
    
  } catch (error) {
    console.error('Failed to create tables:', error);
  } finally {
    await sequelize.close();
  }
}

initializeDatabase();
