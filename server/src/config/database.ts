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
  
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ERROR: DATABASE_URL is not set in production environment');
      throw new Error('DATABASE_URL is not set in production environment');
    } else {
      console.warn('WARNING: DATABASE_URL not set, using local development database');
    }
  }
  
  // Use DATABASE_URL in all environments if available
  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pasteshare';
  
  try {
    // Log sanitized URL (without password)
    const urlObj = new URL(dbUrl);
    console.log(`Connecting to database at ${urlObj.host}${urlObj.pathname} (${process.env.NODE_ENV} mode)`);
  } catch (e: any) {
    console.error('Invalid DATABASE_URL format:', e.message);
  }
  
  const isSupabase = dbUrl.includes('supabase');
  
  return {
    url: dbUrl,
    options: {
      dialect: 'postgres' as const,
      dialectOptions: {
        ssl: isSupabase ? {
          require: true,
          rejectUnauthorized: false
        } : false,
        keepAlive: true
      },
      logging: process.env.NODE_ENV === 'development',
      pool: {
        max: process.env.NODE_ENV === 'production' ? 3 : 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      retry: {
        max: 5
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
    await sequelize.authenticate();
    return { connected: true, message: 'Database connection is healthy' };
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return { connected: false, message: 'Database connection failed', error };
  }
};

export { sequelize };
export default sequelize; 