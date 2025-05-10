// test-supabase.js
// Utility to test Supabase connectivity with multiple configurations
const { Sequelize } = require('sequelize');
require('dotenv').config();

async function testSupabaseConnection() {
  console.log('===== Supabase Connection Test =====');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
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
      console.log('⚠️ Not using connection pooler URL (might have issues on Vercel)');
    }
  } else {
    console.warn('⚠️ DATABASE_URL has unexpected format');
  }
  
  // Define connection configurations to test
  const connectionConfigs = [
    {
      name: 'Default',
      config: {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      }
    },
    {
      name: 'Minimal Pool',
      config: {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        },
        pool: {
          max: 1,
          min: 0,
          idle: 1000,
          acquire: 3000
        }
      }
    },
    {
      name: 'With Timeouts',
      config: {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          },
          connectTimeout: 5000,
          statement_timeout: 10000
        },
        pool: {
          max: 2,
          min: 0,
          idle: 3000,
          acquire: 5000
        }
      }
    },
    {
      name: 'Vercel Optimized',
      config: {
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          },
          connectTimeout: 5000,
          statement_timeout: 5000,
          idle_in_transaction_session_timeout: 5000
        },
        pool: {
          max: 1,
          min: 0,
          idle: 1000,
          acquire: 3000
        }
      }
    }
  ];
  
  // Test each configuration
  for (const config of connectionConfigs) {
    console.log(`\nTesting configuration: ${config.name}`);
    
    try {
      const sequelize = new Sequelize(process.env.DATABASE_URL, config.config);
      
      console.log('Attempting connection...');
      const startTime = Date.now();
      
      await sequelize.authenticate();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Connection successful! (${duration}ms)`);
      
      // Try a simple query
      try {
        console.log('Testing a simple query...');
        const queryStartTime = Date.now();
        
        const [tables] = await sequelize.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          LIMIT 10
        `);
        
        const queryDuration = Date.now() - queryStartTime;
        console.log(`✅ Query successful! (${queryDuration}ms)`);
        console.log(`Found ${tables.length} tables:`, tables.map(t => t.table_name).join(', '));
        
        // Check for our specific tables
        const hasPastes = tables.some(t => t.table_name === 'pastes' || t.table_name === 'Pastes');
        const hasFiles = tables.some(t => t.table_name === 'files' || t.table_name === 'Files');
        
        if (hasPastes && hasFiles) {
          console.log('✅ Required tables found');
        } else {
          console.log('⚠️ Some required tables are missing:');
          if (!hasPastes) console.log('  - Missing pastes table');
          if (!hasFiles) console.log('  - Missing files table');
        }
      } catch (queryError) {
        console.error('❌ Query failed:', queryError.message);
      }
      
      await sequelize.close();
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      
      if (error.original) {
        console.error('Original error:', error.original.message);
        console.error('Error code:', error.original.code);
      }
    }
  }
}

// Run the test
testSupabaseConnection(); 