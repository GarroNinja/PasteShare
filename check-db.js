const { Sequelize } = require('sequelize');
require('dotenv').config();

// Utility function to process connection string
function processConnectionString(url) {
  // First check if URL is valid
  try {
    new URL(url);
    return url; // URL is valid, return as is
  } catch (error) {
    console.log('Connection string may need encoding, attempting to fix...');
    
    // Split the URL into parts
    const parts = url.split('@');
    if (parts.length === 2) {
      const credentials = parts[0];
      const hostPart = parts[1];
      
      // Split credentials into protocol, user, and password
      const protocolParts = credentials.split('://');
      const protocol = protocolParts[0];
      const userPassParts = protocolParts[1].split(':');
      
      if (userPassParts.length >= 2) {
        const username = userPassParts[0];
        // Everything after first colon is the password
        const password = protocolParts[1].substring(protocolParts[1].indexOf(':') + 1);
        
        // URL encode the password
        const encodedPassword = encodeURIComponent(password);
        return `${protocol}://${username}:${encodedPassword}@${hostPart}`;
      }
    }
    
    // If we couldn't fix it, return original
    return url;
  }
}

async function testConnection() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    return;
  }

  const connectionString = processConnectionString(process.env.DATABASE_URL);
  console.log('Testing connection to database...');
  
  try {
    // Initialize Sequelize with the connection URL
    const sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        },
        keepAlive: true
      },
      logging: false // Disable query logging to avoid exposing credentials
    });

    // Test the connection
    await sequelize.authenticate();
    console.log('✅ Connection successful!');
    
    // Check existing tables
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Existing tables:', results.map(r => r.table_name));
    
    // Check for pastes table specifically
    const pastesTable = results.find(r => 
      r.table_name.toLowerCase() === 'pastes' || r.table_name.toLowerCase() === 'Pastes'
    );
    
    if (pastesTable) {
      // Count pastes if table exists
      const [pasteCount] = await sequelize.query(`SELECT COUNT(*) FROM "${pastesTable.table_name}"`);
      console.log(`Total pastes in database: ${pasteCount[0].count}`);
      
      // Check recent pastes
      const [recentPastes] = await sequelize.query(`
        SELECT id, title, "createdAt" 
        FROM "${pastesTable.table_name}" 
        ORDER BY "createdAt" DESC 
        LIMIT 5
      `);
      
      console.log('Recent pastes:', recentPastes);
    } else {
      console.log('⚠️ Paste table not found!');
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

testConnection(); 