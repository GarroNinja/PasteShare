// This script ensures pg dependencies are correctly installed for Vercel
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running Vercel build script for PostgreSQL dependencies...');

// Check if pg is installed
try {
  require('pg');
  console.log('✅ pg module is already installed and available');
} catch (error) {
  console.log('⚠️ pg module not found, installing manually...');
  
  try {
    // Install pg and pg-hstore explicitly
    execSync('npm install pg pg-hstore --no-save', { stdio: 'inherit' });
    console.log('✅ pg and pg-hstore installed successfully');
  } catch (installError) {
    console.error('❌ Failed to install pg:', installError.message);
    process.exit(1);
  }
}

// Verify Sequelize can load PostgreSQL dialect
try {
  const { Sequelize } = require('sequelize');
  // Try to instantiate Sequelize with PostgreSQL dialect
  const sequelize = new Sequelize('sqlite::memory:', { dialect: 'postgres' });
  console.log('✅ Sequelize can load PostgreSQL dialect');
} catch (error) {
  console.error('❌ Sequelize failed to load PostgreSQL dialect:', error.message);
  console.error('This may indicate missing native dependencies or compatibility issues');
}

// Create a special .vercel directory to signal to Vercel that we need these files
const vercelDir = path.join(__dirname, '.vercel');
if (!fs.existsSync(vercelDir)) {
  fs.mkdirSync(vercelDir, { recursive: true });
}

// Write a marker file that instructs Vercel to include pg modules
const markerFile = path.join(vercelDir, 'pg-dependencies.json');
fs.writeFileSync(markerFile, JSON.stringify({
  dependencies: ['pg', 'pg-hstore'],
  dialectModule: 'postgres'
}));

console.log('✅ PostgreSQL dependencies build script completed successfully');

// Vercel build verification script
console.log('Running Vercel build verification for PostgreSQL...');

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL ERROR: DATABASE_URL is not set');
  console.error('The application requires a valid PostgreSQL connection string in DATABASE_URL');
  process.exit(1);
}

// Validate DATABASE_URL format
try {
  const url = new URL(process.env.DATABASE_URL);
  
  // Check for postgres protocol
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    console.error('❌ Invalid database protocol:', url.protocol);
    console.error('DATABASE_URL must start with postgres:// or postgresql://');
    process.exit(1);
  }
  
  // Check for host
  if (!url.hostname) {
    console.error('❌ DATABASE_URL is missing hostname');
    process.exit(1);
  }
  
  // Check for pathname (database name)
  if (!url.pathname || url.pathname === '/') {
    console.error('❌ DATABASE_URL is missing database name');
    process.exit(1);
  }
  
  // Log sanitized connection info
  console.log('Vercel build - Database configuration:');
  console.log('- Host:', url.hostname);
  console.log('- Port:', url.port || '5432 (default)');
  console.log('- Database:', url.pathname.substring(1));
  console.log('- SSL:', url.hostname.includes('supabase') ? 'Enabled' : 'Auto-detect');
} catch (error) {
  console.error('❌ Invalid DATABASE_URL format:', error.message);
  process.exit(1);
}

console.log('✅ DATABASE_URL validation successful');
console.log('✅ Build verification completed successfully');

// This file runs during Vercel build to ensure database tables are created
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const { createConnection } = require('./db');

console.log('Running Vercel build script to set up database...');

// Function to create tables if they don't exist
async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set. Database setup aborted.');
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
    
    // Check if 'pastes' table exists
    const [pastesTableExists] = await sequelize.query(
      "SELECT to_regclass('public.pastes') IS NOT NULL as exists"
    );
    
    if (!pastesTableExists[0].exists) {
      console.log('Creating pastes table...');
      // Define the Paste model
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "pastes" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL DEFAULT 'Untitled Paste',
          content TEXT NOT NULL,
          "expiresAt" TIMESTAMP WITH TIME ZONE,
          "isPrivate" BOOLEAN DEFAULT FALSE,
          "isEditable" BOOLEAN DEFAULT FALSE,
          "customUrl" VARCHAR(255) UNIQUE,
          "userId" UUID,
          views INTEGER DEFAULT 0,
          password VARCHAR(255),
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);
      console.log('Pastes table created successfully.');
    } else {
      console.log('Pastes table already exists.');
      
      // Check if the password column exists
      const [passwordColumnExists] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'pastes' AND column_name = 'password'"
      );
      
      if (passwordColumnExists.length === 0) {
        console.log('Adding password column to pastes table...');
        await sequelize.query('ALTER TABLE "pastes" ADD COLUMN password VARCHAR(255);');
        console.log('Password column added successfully.');
      } else {
        console.log('Password column already exists in pastes table.');
      }
    }
    
    // Check if 'files' table exists
    const [filesTableExists] = await sequelize.query(
      "SELECT to_regclass('public.files') IS NOT NULL as exists"
    );
    
    if (!filesTableExists[0].exists) {
      console.log('Creating files table...');
      // Define the File model
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "files" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          filename VARCHAR(255) NOT NULL,
          originalname VARCHAR(255) NOT NULL,
          mimetype VARCHAR(255) NOT NULL,
          size INTEGER NOT NULL,
          content TEXT NOT NULL,
          "pasteId" UUID NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);
      console.log('Files table created successfully.');
    } else {
      console.log('Files table already exists.');
    }
    
    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Unable to connect to the database or create tables:', error.message);
    process.exit(1);
  } finally {
    // Close the database connection
    await sequelize.close();
  }
}

// Run the function
setupDatabase()
  .then(() => {
    console.log('Vercel build script completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Vercel build script failed:', error);
    process.exit(1);
  }); 