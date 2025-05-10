// Comprehensive Supabase connection diagnostic tool
const { Sequelize } = require('sequelize');
const https = require('https');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Check environment
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables!');
  process.exit(1);
}

console.log('🔍 Starting Supabase connection diagnostics...');

// Sanitize URL for display (hide credentials)
function sanitizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.username ? '***' : ''}${urlObj.password ? ':***' : ''}${urlObj.username || urlObj.password ? '@' : ''}${urlObj.host}${urlObj.pathname}`;
  } catch (e) {
    return 'Invalid URL format';
  }
}

// Parse the DATABASE_URL
function parseDbUrl(url) {
  try {
    const urlObj = new URL(url);
    return {
      protocol: urlObj.protocol,
      host: urlObj.hostname,
      port: urlObj.port,
      database: urlObj.pathname.slice(1),
      username: urlObj.username,
      hasPassword: !!urlObj.password,
      isPooled: urlObj.hostname.includes('pooler')
    };
  } catch (e) {
    console.error('❌ Invalid DATABASE_URL format:', e.message);
    return null;
  }
}

// Test basic connectivity to host
function testHostConnectivity(host, port) {
  return new Promise((resolve) => {
    const req = https.request({
      host,
      port,
      method: 'HEAD',
      timeout: 5000
    }, (res) => {
      resolve({
        success: true,
        statusCode: res.statusCode,
        message: `Host is reachable (Status: ${res.statusCode})`
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        message: `Failed to reach host: ${err.message}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        message: 'Connection timed out after 5 seconds'
      });
    });

    req.end();
  });
}

// Test database connection with Sequelize
async function testDbConnection(url) {
  const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false,
    pool: {
      max: 1,
      min: 0,
      acquire: 10000,
      idle: 5000
    }
  });

  try {
    await sequelize.authenticate();
    
    // Try running a simple query
    try {
      const [result] = await sequelize.query('SELECT NOW() as current_time');
      
      // Try accessing the tables
      const [tables] = await sequelize.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      await sequelize.close();
      
      return {
        success: true,
        serverTime: result[0].current_time,
        tables: tables.map(t => t.table_name)
      };
    } catch (queryError) {
      await sequelize.close();
      return {
        success: false,
        stage: 'query',
        error: queryError.message,
        hint: 'Authentication succeeded but query failed - likely a permissions issue'
      };
    }
  } catch (error) {
    try {
      await sequelize.close();
    } catch (e) {
      // Ignore close errors
    }
    
    return {
      success: false,
      stage: 'authentication',
      error: error.message,
      hint: error.original ? error.original.message : 'No additional details'
    };
  }
}

// Run all diagnostic tests
async function runDiagnostics() {
  console.log('📋 Environment:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  
  const dbInfo = parseDbUrl(DB_URL);
  
  // URL parsing check
  console.log('\n📋 DATABASE_URL check:');
  if (!dbInfo) {
    console.log('   ❌ Invalid DATABASE_URL format');
    return;
  }
  
  console.log(`   ✓ Protocol: ${dbInfo.protocol}`);
  console.log(`   ✓ Host: ${dbInfo.host}`);
  console.log(`   ✓ Port: ${dbInfo.port}`);
  console.log(`   ✓ Database: ${dbInfo.database}`);
  console.log(`   ✓ Username: ${dbInfo.username}`);
  console.log(`   ✓ Password: ${dbInfo.hasPassword ? 'provided' : 'missing'}`);
  console.log(`   ✓ Connection type: ${dbInfo.isPooled ? 'pooled' : 'direct'}`);
  
  // Basic connectivity test
  console.log('\n📋 Network connectivity test:');
  const connectivityResult = await testHostConnectivity(dbInfo.host, dbInfo.port);
  if (connectivityResult.success) {
    console.log(`   ✓ ${connectivityResult.message}`);
  } else {
    console.log(`   ❌ ${connectivityResult.message}`);
    console.log('     This could indicate network issues or firewall restrictions');
  }
  
  // Database authentication test
  console.log('\n📋 Database authentication test:');
  const connectionResult = await testDbConnection(DB_URL);
  
  if (connectionResult.success) {
    console.log('   ✓ Successfully connected to database');
    console.log(`   ✓ Server time: ${connectionResult.serverTime}`);
    console.log(`   ✓ Available tables: ${connectionResult.tables.join(', ')}`);
    
    // Check for our required tables
    const requiredTables = ['pastes', 'files'];
    const missingTables = requiredTables.filter(
      table => !connectionResult.tables.includes(table)
    );
    
    if (missingTables.length > 0) {
      console.log(`   ❌ Missing required tables: ${missingTables.join(', ')}`);
      console.log('     You might need to run the init-tables.js script');
    } else {
      console.log('   ✓ All required tables exist');
    }
  } else {
    console.log(`   ❌ Connection failed at ${connectionResult.stage} stage`);
    console.log(`     Error: ${connectionResult.error}`);
    if (connectionResult.hint) {
      console.log(`     Hint: ${connectionResult.hint}`);
    }
  }
  
  // Summary
  console.log('\n📋 Diagnosis Summary:');
  if (!dbInfo || !connectivityResult.success || !connectionResult.success) {
    console.log('   ❌ Database connection issues detected');
    console.log('   Recommended actions:');
    
    if (!dbInfo) {
      console.log('   1. Fix the format of your DATABASE_URL environment variable');
    }
    
    if (dbInfo && !connectivityResult.success) {
      console.log('   1. Check if the Supabase host is accessible from your environment');
      console.log('   2. Verify IP allowlists if configured in Supabase');
    }
    
    if (dbInfo && connectivityResult.success && !connectionResult.success) {
      console.log('   1. Verify your database credentials are correct');
      console.log('   2. Check if the database user has appropriate permissions');
      console.log('   3. Try creating a new database password in Supabase dashboard');
    }
  } else {
    console.log('   ✓ All tests passed successfully');
    console.log('   If your application is still having issues:');
    console.log('   1. Check application logs for specific error messages');
    console.log('   2. Verify the DATABASE_URL in your Vercel environment variables');
    console.log('   3. Ensure the same DATABASE_URL format is used across all environments');
  }
}

runDiagnostics(); 