// Database test endpoint for Vercel
const { Sequelize } = require('sequelize');

module.exports = async (req, res) => {
  console.log('Running database connection test for Vercel...');
  
  // Log environment
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DATABASE_URL available:', !!process.env.DATABASE_URL);
  
  // Don't expose the actual connection string
  if (process.env.DATABASE_URL) {
    const urlParts = process.env.DATABASE_URL.split('@');
    if (urlParts.length > 1) {
      console.log('Database URL format looks correct, connecting to:', `[credentials hidden]@${urlParts[1]}`);
    } else {
      console.log('Database URL has unexpected format');
    }
  } else {
    return res.status(500).json({ 
      error: 'DATABASE_URL environment variable not set',
      environment: process.env.NODE_ENV || 'unknown'
    });
  }
  
  try {
    // Initialize DB connection
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // Important for Vercel + Supabase
        }
      },
      pool: {
        max: 2, // Minimal pool for serverless
        min: 0,
        idle: 3000,
        acquire: 5000
      },
      retry: {
        max: 3,
      },
      logging: false
    });
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connection successful');
    
    // Check database structure
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    // Check data
    let pastesCount = 0;
    if (tables.some(t => t.table_name === 'pastes')) {
      const [result] = await sequelize.query('SELECT COUNT(*) as count FROM pastes');
      pastesCount = result[0].count;
    }
    
    const tablesFound = tables.map(t => t.table_name);
    
    // Close connection
    await sequelize.close();
    
    // Return success response
    return res.status(200).json({
      status: 'Database connection successful',
      tables: tablesFound,
      pastesCount: pastesCount
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    
    return res.status(500).json({
      error: 'Database connection failed',
      message: error.message,
      code: error.original?.code || 'unknown'
    });
  }
}; 