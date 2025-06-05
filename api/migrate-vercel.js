// Special migration script for Vercel deployment
require('dotenv').config();
const { createConnection } = require('./db');

console.log('Running database migration for Vercel deployment...');

async function migrateDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set. Migration aborted.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const db = createConnection();
  
  if (!db.success) {
    console.error('Failed to connect to database:', db.error);
    process.exit(1);
  }
  
  const { sequelize } = db;
  
  try {
    // Test the connection
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Check if the isJupyterStyle column exists
    const [jupyterStyleColumnExists] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'isJupyterStyle'"
    );
    
    if (jupyterStyleColumnExists.length === 0) {
      console.log('Adding isJupyterStyle column to pastes table...');
      await sequelize.query('ALTER TABLE "pastes" ADD COLUMN "isJupyterStyle" BOOLEAN DEFAULT FALSE;');
      console.log('isJupyterStyle column added successfully.');
    } else {
      console.log('isJupyterStyle column already exists in pastes table.');
    }

    // Check if content column is nullable
    const [contentColumnInfo] = await sequelize.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'content'"
    );
    
    if (contentColumnInfo.length > 0 && contentColumnInfo[0].is_nullable === 'NO') {
      console.log('Making content column nullable to support Jupyter-style pastes...');
      await sequelize.query('ALTER TABLE "pastes" ALTER COLUMN "content" DROP NOT NULL;');
      console.log('Content column modified successfully.');
    } else {
      console.log('Content column is already nullable.');
    }
    
    // Check if 'blocks' table exists
    const [blocksTableExists] = await sequelize.query(
      "SELECT to_regclass('public.blocks') IS NOT NULL as exists"
    );
    
    if (!blocksTableExists[0].exists) {
      console.log('Creating blocks table...');
      // Define the Block model
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
      console.log('Blocks table created successfully.');
    } else {
      console.log('Blocks table already exists.');
    }
    
    // Verify the schema
    console.log('Verifying database schema...');
    const [tables] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Available tables:', tables.map(t => t.table_name).join(', '));
    
    // Check pastes columns
    const [pasteColumns] = await sequelize.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'pastes'"
    );
    console.log('Paste table columns:');
    pasteColumns.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not nullable'})`);
    });
    
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    // Close the database connection
    await sequelize.close();
  }
}

// Run the migration
migrateDatabase()
  .then(() => {
    console.log('Migration script completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  }); 