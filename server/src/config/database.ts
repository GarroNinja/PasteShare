import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Process connection string to handle potential special characters
let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  try {
    // Check if URL is valid
    new URL(connectionString);
    // Valid URL, no changes needed
  } catch (error) {
    console.log('Fixing invalid connection string...');
    
    // Split the URL into parts
    const parts = connectionString.split('@');
    if (parts.length === 2) {
      const hostPart = parts[1];
      
      // Handle protocol and credentials part
      const credParts = parts[0].split('://');
      if (credParts.length === 2) {
        const protocol = credParts[0];
        const userPassParts = credParts[1].split(':');
        
        if (userPassParts.length >= 2) {
          const username = userPassParts[0];
          // Everything after the first colon and before @ is the password
          const password = credParts[1].substring(credParts[1].indexOf(':') + 1);
          
          // URL encode the password
          const encodedPassword = encodeURIComponent(password);
          connectionString = `${protocol}://${username}:${encodedPassword}@${hostPart}`;
          console.log('Connection string fixed');
        }
      }
    }
  }
}

// Use PostgreSQL for Vercel deployment
const sequelize = new Sequelize(
  connectionString || 'postgres://postgres:postgres@localhost:5432/pasteshare',
  {
    dialect: 'postgres',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  }
);

export default sequelize; 