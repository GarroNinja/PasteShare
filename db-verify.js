// Database connection verification script
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Check environment setup
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  console.log('Please set DATABASE_URL to your Supabase PostgreSQL connection string');
  process.exit(1);
}

// Log connection info (safely)
const dbUrlParts = process.env.DATABASE_URL.split('@');
if (dbUrlParts.length > 1) {
  console.log('Attempting to connect to:', `[credentials hidden]@${dbUrlParts[1]}`);
} else {
  console.warn('DATABASE_URL has unexpected format');
}

// Try to connect with simplified options
async function testConnection() {
  console.log('Testing database connection...');
  
  // Create connection with minimal options
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
  
  try {
    // Try to authenticate
    await sequelize.authenticate();
    console.log('✅ CONNECTION SUCCESSFUL!');
    
    // Check existing tables
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    if (results && results.length) {
      console.log('Existing tables:');
      results.forEach(row => {
        console.log(`- ${row.table_name}`);
      });
      
      // Check for our specific tables
      const tableNames = results.map(r => r.table_name.toLowerCase());
      const hasPastes = tableNames.includes('pastes');
      const hasFiles = tableNames.includes('files');
      
      console.log(`Pastes table exists: ${hasPastes ? 'YES' : 'NO'}`);
      console.log(`Files table exists: ${hasFiles ? 'YES' : 'NO'}`);
      
      if (!hasPastes || !hasFiles) {
        console.log('Some required tables are missing! Tables need to be created.');
      }
    } else {
      console.log('No tables found in database. Tables need to be created.');
    }
    
    await sequelize.close();
    return true;
  } catch (error) {
    console.error('❌ CONNECTION FAILED!');
    console.error('Error details:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    await sequelize.close();
    return false;
  }
}

// Run tests
(async () => {
  try {
    const success = await testConnection();
    if (!success) {
      console.log('\nRecommendations:');
      console.log('1. Check DATABASE_URL format (should be like postgres://user:pass@host:port/dbname)');
      console.log('2. Verify Supabase credentials and database permissions');
      console.log('3. Ensure SSL configuration matches Supabase requirements');
    }
  } catch (e) {
    console.error('Test script error:', e);
  }
  process.exit(0);
})(); 