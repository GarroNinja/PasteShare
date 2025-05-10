// Minimal Vercel-compatible database connection test
const { Sequelize } = require('sequelize');

// Simplify for Vercel Functions
module.exports = async (req, res) => {
  console.log('Running database connection test on Vercel...');
  
  // Get database URL from environment
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({
      success: false,
      error: 'DATABASE_URL environment variable is not set'
    });
  }
  
  // Try parsing URL to check format
  try {
    const url = new URL(dbUrl);
    console.log(`Protocol: ${url.protocol}`);
    console.log(`Host: ${url.hostname}`);
    console.log(`Database: ${url.pathname.slice(1)}`);
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: `Invalid DATABASE_URL format: ${e.message}`
    });
  }
  
  // Initialize sequelize
  const sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: (...msg) => console.log(msg),
    pool: {
      max: 1,
      min: 0,
      acquire: 10000,
      idle: 5000
    }
  });
  
  try {
    // Test authentication
    console.log('Testing database authentication...');
    await sequelize.authenticate();
    console.log('Authentication successful!');
    
    // Get table list to verify schema
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Available tables:', tables.map(t => t.table_name));
    
    // Success response
    return res.status(200).json({
      success: true,
      message: 'Database connection successful',
      tables: tables.map(t => t.table_name),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION
      }
    });
  } catch (error) {
    console.error('Database connection error:', error);
    
    // Error response with details
    return res.status(500).json({
      success: false,
      error: error.message,
      hint: error.original ? error.original.message : null,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION
      }
    });
  } finally {
    // Close connection
    try {
      await sequelize.close();
    } catch (e) {
      console.error('Error closing connection:', e);
    }
  }
}; 