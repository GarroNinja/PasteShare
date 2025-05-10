import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try to load env vars from multiple potential locations
const envPaths = [
  path.resolve(process.cwd(), '.env'),            // Root directory .env
  path.resolve(process.cwd(), '../.env'),         // Parent directory .env
  path.resolve(process.cwd(), '../../.env'),      // Grandparent directory .env
  path.resolve(__dirname, '../../.env'),          // Two levels up from current file
  path.resolve(__dirname, '../../../.env')        // Three levels up from current file
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('No .env file found, using process.env directly');
  dotenv.config(); // Try loading from default location as last resort
}

// Check if environment variable exists
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL is not defined in environment. Database functionality will be disabled.');
  console.warn('Set DATABASE_URL in your .env file or environment variables.');
  
  // Log all available environment variables in development (redacted for security)
  if (process.env.NODE_ENV === 'development') {
    console.log('Available environment variables:', 
      Object.keys(process.env)
        .filter(key => !key.includes('SECRET') && !key.includes('KEY') && !key.includes('TOKEN') && !key.includes('PASS'))
    );
  }
}

// Get connection string
let connectionString = process.env.DATABASE_URL;

// Log connection details (safely)
if (connectionString) {
  const urlParts = connectionString.split('@');
  if (urlParts.length > 1) {
    console.log('Database connection:', `[credentials hidden]@${urlParts[1]}`);
    
    // Check for pooler in the URL (preferred for Vercel)
    if (urlParts[1].includes('pooler')) {
      console.log('Using connection pooler URL (recommended for serverless)');
    } else {
      console.log('Not using connection pooler URL (might cause connection issues in serverless)');
    }
  }
}

// Check required environment variables
const requiredVars = ['DATABASE_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`Missing required environment variables: ${missingVars.join(', ')}`);
  console.warn('Some functionality may be limited.');
}

// Create Sequelize instance with proper error handling
let sequelize: Sequelize;

if (connectionString) {
  sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false  // Required for Supabase
      },
      // Timeout settings
      statement_timeout: 10000,    // 10s query timeout
      idle_in_transaction_session_timeout: 10000  // 10s idle timeout
    },
    pool: {
      max: 3,
      min: 0,
      acquire: 10000,
      idle: 5000,
    },
    logging: process.env.NODE_ENV === 'development',
    retry: {
      max: 3,
      match: [/Deadlock/i, /Lock/i, /Timeout/i, /Connection/i]
    }
  });
} else {
  // Create a dummy sequelize instance that will throw errors when used
  sequelize = new Sequelize('sqlite::memory:', { 
    logging: false,
    define: {
      timestamps: false
    }
  });
  
  // Override authenticate to provide clear error
  const originalAuth = sequelize.authenticate.bind(sequelize);
  sequelize.authenticate = async () => {
    throw new Error('DATABASE_URL not configured. Please set the DATABASE_URL environment variable.');
  };
}

// Test connection when this module is first imported
(async () => {
  try {
    if (connectionString) {
      // Set a timeout to avoid hanging
      const timeout = setTimeout(() => {
        console.error('❌ Database connection attempt timed out after 5s');
      }, 5000);
      
      await sequelize.authenticate();
      clearTimeout(timeout);
      console.log('✅ Database connection established successfully');
      
      // Log some info about the database tables
      try {
        const [results] = await sequelize.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        console.log('Available tables:', results.map((r: any) => r.table_name));
      } catch (queryError) {
        console.error('Failed to query database tables:', queryError);
      }
    } else {
      console.warn('⚠️ Skipping database connection test - DATABASE_URL not set');
    }
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
})();

export default sequelize; 