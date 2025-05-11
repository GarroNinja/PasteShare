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

// Check for required DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set!');
}

// Initialize Sequelize with DATABASE_URL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: process.env.NODE_ENV === 'development',
  pool: {
    max: 3,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Test connection function for health checks
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