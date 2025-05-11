#!/usr/bin/env node

// This script updates all existing file records with a default path value
// Run this script before starting the server

const { Pool } = require('pg');
require('dotenv').config();

async function fixFilesTable() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Check if 'path' column exists
    const checkColumnResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'files' AND column_name = 'path'
    `);

    if (checkColumnResult.rows.length === 0) {
      // Column doesn't exist, add it with DEFAULT '' constraint
      console.log("Adding 'path' column to 'files' table...");
      await pool.query(`
        ALTER TABLE files
        ADD COLUMN path VARCHAR(255) DEFAULT ''
      `);
      console.log("Column 'path' added successfully with default value");
    } else {
      // Column exists, update NULL values
      console.log("Updating NULL values in 'path' column...");
      await pool.query(`
        UPDATE files
        SET path = ''
        WHERE path IS NULL
      `);
      console.log("Updated NULL values in 'path' column");
    }

    console.log('Files table migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixFilesTable().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
}); 