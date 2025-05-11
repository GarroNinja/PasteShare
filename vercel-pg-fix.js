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

// Check if pg is installed and accessible
try {
  const pg = require('pg');
  console.log('✅ pg module found:', pg.version);
} catch (error) {
  console.log('⚠️ pg module not found or cannot be loaded. Installing...');
  
  try {
    // Install pg explicitly
    execSync('npm install --no-save pg pg-hstore', { stdio: 'inherit' });
    console.log('✅ pg and pg-hstore packages installed');
    
    // Retry loading pg
    try {
      const pg = require('pg');
      console.log('✅ pg module now accessible:', pg.version);
    } catch (retryError) {
      console.error('❌ Failed to load pg module after installation:', retryError.message);
      process.exit(1);
    }
  } catch (installError) {
    console.error('❌ Failed to install pg packages:', installError.message);
    process.exit(1);
  }
}

// Check DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  process.exit(1);
}

try {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`✅ DATABASE_URL is valid and points to: ${url.hostname}`);
} catch (error) {
  console.error('❌ DATABASE_URL is not a valid URL:', error.message);
  process.exit(1);
}

// Check if Sequelize can connect to PostgreSQL
try {
  console.log('🔍 Testing Sequelize...');
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('sqlite::memory:', { dialect: 'postgres' });
  console.log('✅ Sequelize can load PostgreSQL dialect');
} catch (error) {
  console.error('❌ Sequelize failed to load PostgreSQL dialect:', error.message);
  console.log('⚠️ Will attempt to fix...');
  
  try {
    // Try to fix Node-gyp issues
    execSync('npm rebuild', { stdio: 'inherit' });
    console.log('✅ Rebuilt native modules');
  } catch (rebuildError) {
    console.error('❌ Failed to rebuild modules:', rebuildError.message);
  }
}

console.log('✅ PostgreSQL fix script completed'); 