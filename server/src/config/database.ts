import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Simple connection string logging - don't try to manipulate it
let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  const urlParts = connectionString.split('@');
  if (urlParts.length > 1) {
    console.log('Database connection:', `[credentials hidden]@${urlParts[1]}`);
  }
} else {
  console.warn('DATABASE_URL environment variable is not set!');
}

// Use PostgreSQL for both local and production
const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pasteshare',
  {
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
  }
);

// Test connection when this module is first imported
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
})();

export default sequelize; 