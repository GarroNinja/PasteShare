import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from multiple potential locations
const loadEnvFiles = () => {
  // Try root directory .env
  const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
  // Try server directory .env
  const serverEnvPath = path.resolve(process.cwd(), '.env');
  
  if (fs.existsSync(rootEnvPath)) {
    console.log('Loading .env from root directory');
    dotenv.config({ path: rootEnvPath });
  }
  
  if (fs.existsSync(serverEnvPath)) {
    console.log('Loading .env from server directory');
    dotenv.config({ path: serverEnvPath });
  }
  
  // Default load which works in some environments
  dotenv.config();
};

loadEnvFiles();

// Enhanced database URL validation and configuration
const getDatabaseConfig = () => {
  console.log('Environment: ', process.env.NODE_ENV);
  console.log('DATABASE_URL exists: ', !!process.env.DATABASE_URL);
  
  // Strict check for DATABASE_URL - no fallbacks
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set in environment');
    throw new Error('DATABASE_URL is not set in environment');
  }
  
  // Only use DATABASE_URL - no localhost fallbacks
  const dbUrl = process.env.DATABASE_URL;
  
  try {
    // Log sanitized URL (without password)
    const urlObj = new URL(dbUrl);
    console.log(`Connecting to database at ${urlObj.host}${urlObj.pathname} (${process.env.NODE_ENV} mode)`);
    
    // Force port 6543 for Supabase connection pooling if needed
    let connectionString = dbUrl;
    if (urlObj.hostname.includes('supabase') && urlObj.port !== '6543') {
      connectionString = connectionString.replace(/:5432\//g, ':6543/').replace(/:5432$/g, ':6543');
      console.log('Using Supabase connection pooler at port 6543');
    }
  } catch (e: any) {
    console.error('Invalid DATABASE_URL format:', e.message);
    throw e; // Rethrow to prevent application from starting with bad URL
  }
  
  const isSupabase = dbUrl.includes('supabase');
  
  return {
    url: dbUrl,
    options: {
      dialect: 'postgres' as const,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        },
        keepAlive: true,
        connectTimeout: 30000 // Increased timeout for Supabase
      },
      logging: process.env.NODE_ENV === 'development',
      pool: {
        max: process.env.NODE_ENV === 'production' ? 3 : 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      retry: {
        max: 10, // Increase max retries
        timeout: 30000 // Extend retry timeout
      }
    }
  };
};

// Initialize database connection
const dbConfig = getDatabaseConfig();
const sequelize = new Sequelize(dbConfig.url, dbConfig.options);

// Test connection function that can be used for health checks
export const testConnection = async () => {
  try {
    // Add timeout to prevent hanging
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 15000)
    );
    
    // Race the authentication with the timeout
    await Promise.race([sequelize.authenticate(), timeout]);
    
    return { connected: true, message: 'Database connection is healthy' };
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return { connected: false, message: 'Database connection failed', error };
  }
};

export { sequelize };
export default sequelize; 