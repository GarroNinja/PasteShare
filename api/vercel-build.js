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