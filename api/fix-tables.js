// Fix duplicate tables in Supabase
const { Sequelize } = require('sequelize');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('Connecting to database...');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log
});

async function fixDuplicateTables() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // List all tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Current tables:', tables.map(t => t.table_name));
    
    // Check if we have duplicate tables with different casing
    const lowerCaseTables = tables.filter(t => 
      t.table_name === 'pastes' || t.table_name === 'files'
    );
    
    const upperCaseTables = tables.filter(t => 
      t.table_name === 'Pastes' || t.table_name === 'Files'
    );
    
    if (upperCaseTables.length > 0) {
      console.log('Found uppercase tables that need to be dropped:', upperCaseTables.map(t => t.table_name));
      
      // Check if lowercase tables exist and have data
      for (const lcTable of lowerCaseTables) {
        const [count] = await sequelize.query(`SELECT COUNT(*) as count FROM "${lcTable.table_name}"`);
        console.log(`Table ${lcTable.table_name} has ${count[0].count} rows`);
      }
      
      const confirmation = process.argv.includes('--confirm');
      
      if (!confirmation) {
        console.log('To drop the uppercase tables, run this script with --confirm');
        return;
      }
      
      // If confirmed, drop the uppercase tables
      for (const table of upperCaseTables) {
        await sequelize.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
        console.log(`Dropped table ${table.table_name}`);
      }
      
      console.log('All uppercase tables have been dropped');
    } else {
      console.log('No duplicate tables found');
    }
    
    // Close connection
    await sequelize.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

fixDuplicateTables(); 