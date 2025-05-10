// verify-vercel-db.js
// Utility to verify database connection with Vercel configuration
const { Sequelize } = require('sequelize');
require('dotenv').config();

async function verifyVercelDatabase() {
  console.log('==== Vercel Database Configuration Test ====');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.log('Please check your .env file and environment variables');
    process.exit(1);
  }
  
  // Log connection info (safely)
  const urlParts = process.env.DATABASE_URL.split('@');
  if (urlParts.length > 1) {
    console.log('Database URL:', `[credentials hidden]@${urlParts[1]}`);
    
    // Check if using pooler
    if (urlParts[1].includes('pooler')) {
      console.log('✅ Using connection pooler URL (recommended for Vercel)');
    } else {
      console.warn('⚠️ Not using connection pooler URL (preferred for serverless environments)');
      console.log('Recommendation: Use the pooler URL format for Supabase in Vercel deployments');
    }
  } else {
    console.warn('⚠️ DATABASE_URL has unexpected format');
  }
  
  // Test connection with Vercel configuration
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      statement_timeout: 10000
    },
    pool: {
      max: 2,
      min: 0,
      idle: 5000,
      acquire: 10000
    },
    retry: {
      max: 3
    },
    logging: false
  });
  
  try {
    // Test connection with timeout
    console.log('Testing connection...');
    const timeout = setTimeout(() => {
      console.error('❌ Connection attempt timed out after 5 seconds');
      process.exit(1);
    }, 5000);
    
    await sequelize.authenticate();
    clearTimeout(timeout);
    console.log('✅ Database connection successful');
    
    // Check tables
    console.log('Checking database tables...');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    if (tables.length === 0) {
      console.warn('⚠️ No tables found in database');
    } else {
      console.log('Tables found:', tables.map(t => t.table_name).join(', '));
      
      // Check for our expected tables with correct casing
      const hasPastes = tables.some(t => t.table_name === 'pastes');
      const hasFiles = tables.some(t => t.table_name === 'files');
      
      // Check for capitalized tables (potential issue)
      const hasCapitalizedPastes = tables.some(t => t.table_name === 'Pastes');
      const hasCapitalizedFiles = tables.some(t => t.table_name === 'Files');
      
      if (hasPastes && hasFiles) {
        console.log('✅ Required tables present with correct casing');
      } else {
        console.error('❌ Missing required tables with correct casing:');
        if (!hasPastes) console.error('  - lowercase "pastes" table not found');
        if (!hasFiles) console.error('  - lowercase "files" table not found');
      }
      
      if (hasCapitalizedPastes || hasCapitalizedFiles) {
        console.warn('⚠️ Found capitalized tables which may cause issues:');
        if (hasCapitalizedPastes) console.warn('  - Capitalized "Pastes" table found');
        if (hasCapitalizedFiles) console.warn('  - Capitalized "Files" table found');
        console.log('Run fix-db-tables.js to resolve this issue');
      }
      
      // Check foreign key
      try {
        if (hasFiles) {
          const [columns] = await sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'files'
          `);
          
          const hasPasteId = columns.some(c => c.column_name === 'pasteId');
          const hasCapitalizedPasteId = columns.some(c => c.column_name === 'PasteId');
          
          if (hasPasteId) {
            console.log('✅ Foreign key "pasteId" has correct casing');
          } else if (hasCapitalizedPasteId) {
            console.warn('⚠️ Foreign key "PasteId" has incorrect casing');
            console.log('Run fix-db-tables.js to resolve this issue');
          } else {
            console.error('❌ No foreign key to pastes found in files table');
          }
        }
      } catch (error) {
        console.error('Error checking columns:', error.message);
      }
    }
    
    // Close connection
    await sequelize.close();
    console.log('Database connection closed');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (error.original) {
      console.error('Original error:', error.original.message);
      console.error('Error code:', error.original.code);
      
      if (error.original.code === 'ENOTFOUND') {
        console.log('Recommendation: Check if the database host is correct and accessible');
      } else if (error.original.code === 'ECONNREFUSED') {
        console.log('Recommendation: Check if the database is running and accessible from your network');
      } else if (error.original.code === '28P01') {
        console.log('Recommendation: Check if the database credentials are correct');
      } else if (error.original.code === '3D000') {
        console.log('Recommendation: Check if the database name is correct');
      }
    }
    
    process.exit(1);
  }
}

// Run the verification
verifyVercelDatabase(); 