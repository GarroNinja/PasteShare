import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Get database connection string
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Create Sequelize instance
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function runMigrations() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .sort();
    
    console.log(`Found ${migrationFiles.length} migration files`);
    
    // Create migrations table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Get executed migrations
    const [executedMigrations] = await sequelize.query(
      'SELECT name FROM migrations'
    );
    
    const executedMigrationNames = (executedMigrations as any[]).map(m => m.name);
    console.log('Executed migrations:', executedMigrationNames);
    
    // Run pending migrations
    for (const file of migrationFiles) {
      if (!executedMigrationNames.includes(file)) {
        console.log(`Running migration: ${file}`);
        
        // Import migration file
        const migration = require(path.join(migrationsDir, file));
        
        // Run migration
        await migration.up(sequelize.getQueryInterface());
        
        // Mark migration as executed
        await sequelize.query(
          'INSERT INTO migrations (name) VALUES (:name)',
          {
            replacements: { name: file }
          }
        );
        
        console.log(`Migration ${file} executed successfully`);
      } else {
        console.log(`Migration ${file} already executed, skipping`);
      }
    }
    
    console.log('All migrations have been executed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigrations(); 