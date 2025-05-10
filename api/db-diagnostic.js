// Database diagnostic tool for Vercel deployment
const { Sequelize } = require('sequelize');

module.exports = async (req, res) => {
  console.log('==== VERCEL DATABASE DIAGNOSTIC TOOL ====');
  console.log('Running complete database diagnostics...');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Vercel environment:', process.env.VERCEL_ENV || 'not on Vercel');
  console.log('Region:', process.env.VERCEL_REGION || 'unknown');
  
  // Collect environment info
  const diagnosticInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel: {
      env: process.env.VERCEL_ENV || 'not on Vercel',
      region: process.env.VERCEL_REGION || 'unknown',
      id: process.env.VERCEL_ID,
      url: process.env.VERCEL_URL,
    },
    database: {
      url_available: !!process.env.DATABASE_URL,
      connection_results: [],
    },
    tests: {},
    recommendations: []
  };
  
  // Safely log partial connection string 
  if (process.env.DATABASE_URL) {
    const urlParts = process.env.DATABASE_URL.split('@');
    if (urlParts.length > 1) {
      diagnosticInfo.database.host_info = urlParts[1].split('/')[0]; // host:port
      
      const isPooler = urlParts[1].includes('pooler');
      diagnosticInfo.database.using_pooler = isPooler;
      
      if (!isPooler) {
        diagnosticInfo.recommendations.push(
          "Use Supabase connection pooler URL (contains 'pooler' in the hostname)"
        );
      }
    } else {
      diagnosticInfo.database.url_format = 'invalid';
      diagnosticInfo.recommendations.push(
        "Check DATABASE_URL format - should be postgresql://user:password@host:port/database"
      );
    }
  } else {
    diagnosticInfo.recommendations.push(
      "DATABASE_URL environment variable is not set"
    );
    
    return res.status(500).json(diagnosticInfo);
  }
  
  // Test 1: Basic connection with default settings
  console.log('Test 1: Basic connection with default settings');
  try {
    const sequelize1 = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false  // Required for Supabase
        }
      },
      pool: {
        max: 2,
        min: 0,
        idle: 5000,
        acquire: 10000
      },
      logging: false
    });
    
    await sequelize1.authenticate();
    await sequelize1.close();
    
    diagnosticInfo.tests.basic_connection = 'SUCCESS';
    console.log('Basic connection test: SUCCESS');
  } catch (error) {
    diagnosticInfo.tests.basic_connection = {
      status: 'FAILED',
      error: error.message,
      code: error.original?.code
    };
    console.log('Basic connection test: FAILED -', error.message);
    
    // Add recommendations based on error
    if (error.original?.code === 'ENOTFOUND') {
      diagnosticInfo.recommendations.push(
        "Database host not found - check hostname in DATABASE_URL"
      );
    } else if (error.original?.code === 'ETIMEDOUT' || error.original?.code === 'ECONNREFUSED') {
      diagnosticInfo.recommendations.push(
        "Connection timeout - check if database allows connections from Vercel IP addresses"
      );
    } else if (error.original?.code === '28P01') {
      diagnosticInfo.recommendations.push(
        "Authentication failed - check username and password in DATABASE_URL"
      );
    }
  }
  
  // Test 2: Connection with restricted pool and timeout settings
  console.log('Test 2: Connection with restricted pool and timeout');
  try {
    const sequelize2 = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        },
        connectTimeout: 5000, // 5 second timeout
        statement_timeout: 5000, // 5 second statement timeout
        idle_in_transaction_session_timeout: 5000 // 5 second idle timeout
      },
      pool: {
        max: 1, // Minimal pool
        min: 0,
        idle: 3000,
        acquire: 5000
      },
      logging: false
    });
    
    await sequelize2.authenticate();
    await sequelize2.close();
    
    diagnosticInfo.tests.restricted_connection = 'SUCCESS';
    console.log('Restricted connection test: SUCCESS');
  } catch (error) {
    diagnosticInfo.tests.restricted_connection = {
      status: 'FAILED',
      error: error.message,
      code: error.original?.code
    };
    console.log('Restricted connection test: FAILED -', error.message);
  }

  // If at least one test was successful, try querying for tables
  if (diagnosticInfo.tests.basic_connection === 'SUCCESS' || 
      diagnosticInfo.tests.restricted_connection === 'SUCCESS') {
    try {
      console.log('Testing database queries...');
      const sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          },
          statement_timeout: 5000
        },
        pool: { max: 1, min: 0 },
        logging: false
      });
      
      // Get tables
      const [tables] = await sequelize.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      diagnosticInfo.database.tables = tables.map(t => t.table_name);
      
      // Look for our tables
      const hasPastes = tables.some(t => t.table_name === 'pastes');
      const hasFiles = tables.some(t => t.table_name === 'files');
      const hasCapitalizedPastes = tables.some(t => t.table_name === 'Pastes');
      const hasCapitalizedFiles = tables.some(t => t.table_name === 'Files');
      
      diagnosticInfo.database.has_pastes_table = hasPastes;
      diagnosticInfo.database.has_files_table = hasFiles;
      diagnosticInfo.database.has_capitalized_tables = hasCapitalizedPastes || hasCapitalizedFiles;
      
      if (!hasPastes || !hasFiles) {
        diagnosticInfo.recommendations.push(
          "Required tables are missing. Run init-db.js to create tables."
        );
      }
      
      if (hasCapitalizedPastes || hasCapitalizedFiles) {
        diagnosticInfo.recommendations.push(
          "Found capitalized tables. Run fix-db-tables.js to normalize table names."
        );
      }
      
      // Try a real query
      if (hasPastes) {
        try {
          const [count] = await sequelize.query("SELECT COUNT(*) as count FROM pastes");
          diagnosticInfo.database.paste_count = parseInt(count[0].count, 10);
          diagnosticInfo.tests.query_execution = 'SUCCESS';
        } catch (queryError) {
          diagnosticInfo.tests.query_execution = {
            status: 'FAILED',
            error: queryError.message
          };
        }
      }
      
      await sequelize.close();
    } catch (error) {
      diagnosticInfo.tests.table_query = {
        status: 'FAILED',
        error: error.message
      };
    }
  }
  
  // Return all diagnostic info
  return res.status(200).json(diagnosticInfo);
}; 