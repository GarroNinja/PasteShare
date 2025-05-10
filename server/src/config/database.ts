import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Use PostgreSQL for Vercel deployment
const sequelize = new Sequelize(
  process.env.NODE_ENV === 'production' ? (process.env.DATABASE_URL || '') : 'postgres://postgres:postgres@localhost:5432/pasteshare',
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