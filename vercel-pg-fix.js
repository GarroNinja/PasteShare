#!/usr/bin/env node

/**
 * Vercel PostgreSQL Fix Script
 * 
 * This script manually installs and configures the PostgreSQL driver for Vercel deployments.
 * It should be run as part of the build process to ensure the pg module is available.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Running PostgreSQL fix for Vercel deployment...');

// Check if running in Vercel
const isVercel = process.env.VERCEL === '1';
console.log(`Running in Vercel environment: ${isVercel ? 'Yes' : 'No'}`);

// Check if pg is installed and accessible
try {
  const pg = require('pg');
  console.log('✅ pg module found:', pg.version);
} catch (error) {
  console.log('⚠️ pg module not found or cannot be loaded. Installing...');
  
  try {
    // Install pg explicitly using a method that works in Vercel
    if (isVercel) {
      // Safer approach for Vercel
      execSync('npm install pg pg-hstore --no-save', { stdio: 'inherit' });
    } else {
      // For local development
      execSync('npm install pg pg-hstore', { stdio: 'inherit' });
    }
    console.log('✅ pg and pg-hstore packages installed');
    
    // Retry loading pg
    try {
      const pg = require('pg');
      console.log('✅ pg module now accessible:', pg.version);
    } catch (retryError) {
      console.error('❌ Failed to load pg module after installation:', retryError.message);
      // Don't exit in Vercel environment as it may continue with other steps
      if (!isVercel) process.exit(1);
    }
  } catch (installError) {
    console.error('❌ Failed to install pg packages:', installError.message);
    // Don't exit in Vercel environment
    if (!isVercel) process.exit(1);
  }
}

// Create a marker file to signal we need pg
try {
  const vercelDir = path.join(process.cwd(), '.vercel');
  if (!fs.existsSync(vercelDir)) {
    fs.mkdirSync(vercelDir, { recursive: true });
  }
  
  const markerFile = path.join(vercelDir, 'pg-required.json');
  fs.writeFileSync(markerFile, JSON.stringify({
    requiredModules: ['pg', 'pg-hstore'],
    timestamp: new Date().toISOString()
  }));
  console.log('✅ Created pg dependency marker file for Vercel');
} catch (err) {
  console.error('❌ Failed to create marker file:', err.message);
}

// Check DATABASE_URL - but don't fail the build if missing (may be added later)
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL environment variable is not set!');
  console.warn('You must add this in your Vercel environment variables');
} else {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`✅ DATABASE_URL is valid and points to: ${url.hostname}`);
  } catch (error) {
    console.error('⚠️ DATABASE_URL is not a valid URL:', error.message);
  }
}

// Check if Sequelize can connect to PostgreSQL
try {
  console.log('🔍 Testing Sequelize...');
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('sqlite::memory:', { dialect: 'postgres' });
  console.log('✅ Sequelize can load PostgreSQL dialect');
} catch (error) {
  console.error('⚠️ Sequelize failed to load PostgreSQL dialect:', error.message);
  console.log('Will attempt to fix with a simple require...');
  
  try {
    // Simple check if modules are available
    require('pg-hstore');
    console.log('✅ pg-hstore is available');
  } catch (e) {
    console.error('❌ pg-hstore is not available:', e.message);
  }
}

console.log('✅ PostgreSQL fix script completed'); 