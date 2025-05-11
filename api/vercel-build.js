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
console.log('Running Vercel build verification...');

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('FATAL ERROR: DATABASE_URL is not set');
  console.error('The application requires a valid PostgreSQL connection string in DATABASE_URL');
  process.exit(1);
}

// Validate DATABASE_URL format
try {
  const url = new URL(process.env.DATABASE_URL);
  
  // Check for postgres protocol
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    console.error(`Invalid database protocol: ${url.protocol}`);
    console.error('DATABASE_URL must start with postgres:// or postgresql://');
    process.exit(1);
  }
  
  // Check for host
  if (!url.hostname) {
    console.error('DATABASE_URL is missing hostname');
    process.exit(1);
  }
  
  // Check for pathname (database name)
  if (!url.pathname || url.pathname === '/') {
    console.error('DATABASE_URL is missing database name');
    process.exit(1);
  }
  
  // Log sanitized connection info
  console.log('Vercel build - Database configuration:');
  console.log('- Host:', url.hostname);
  console.log('- Port:', url.port || '5432 (default)');
  console.log('- Database:', url.pathname.substring(1));
  console.log('- SSL:', url.hostname.includes('supabase') ? 'Enabled' : 'Auto-detect');
} catch (error) {
  console.error('Invalid DATABASE_URL format:', error.message);
  process.exit(1);
}

// All checks passed
console.log('DATABASE_URL validation successful'); 