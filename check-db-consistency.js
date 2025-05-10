// check-db-consistency.js
// Utility to check database table consistency
const { Sequelize } = require('sequelize');
require('dotenv').config();

async function checkDatabaseConsistency() {
  console.log('Checking database configuration consistency...');
  
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Check tables
    const [tables] = await sequelize.query(`
      SELECT table_name, table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\nDatabase tables:');
    console.table(tables);
    
    // Check if we have duplicate tables with different casing
    const tableNames = tables.map(t => t.table_name.toLowerCase());
    const uniqueTableNames = [...new Set(tableNames)];
    
    if (tableNames.length !== uniqueTableNames.length) {
      console.error('⚠️ WARNING: Duplicate tables with different casing detected');
      
      // Identify the duplicates
      const duplicates = [];
      const seen = new Set();
      
      for (const table of tables) {
        const lowercase = table.table_name.toLowerCase();
        if (seen.has(lowercase)) {
          duplicates.push(table.table_name);
        } else {
          seen.add(lowercase);
        }
      }
      
      console.log('Duplicate tables:', duplicates);
      console.log('Run fix-db-tables.js to resolve this issue');
    } else {
      console.log('✅ No duplicate tables detected');
    }
    
    // Check paste table columns
    try {
      const [pasteColumns] = await sequelize.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'pastes'
        ORDER BY ordinal_position
      `);
      
      console.log('\nPaste table columns:');
      console.table(pasteColumns);
      
      // Check for expected columns
      const requiredColumns = [
        'id', 'title', 'content', 'isPrivate', 'expiresAt', 
        'createdAt', 'updatedAt', 'customUrl', 'userId'
      ];
      
      const missingColumns = requiredColumns.filter(
        col => !pasteColumns.some(c => c.column_name === col)
      );
      
      if (missingColumns.length > 0) {
        console.error('⚠️ WARNING: Missing required columns in pastes table:', missingColumns);
      } else {
        console.log('✅ All required paste columns present');
      }
    } catch (error) {
      console.error('❌ Error checking paste table:', error.message);
    }
    
    // Check files table columns
    try {
      const [fileColumns] = await sequelize.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'files'
        ORDER BY ordinal_position
      `);
      
      console.log('\nFile table columns:');
      console.table(fileColumns);
      
      // Check foreign key column
      const pasteIdColumn = fileColumns.find(c => c.column_name === 'pasteId');
      const capitalPasteIdColumn = fileColumns.find(c => c.column_name === 'PasteId');
      
      if (pasteIdColumn) {
        console.log('✅ Correct lowercase pasteId foreign key present');
      } else if (capitalPasteIdColumn) {
        console.error('⚠️ WARNING: Found capitalized PasteId instead of lowercase pasteId');
        console.log('Run fix-db-tables.js to migrate data to the correct schema');
      } else {
        console.error('❌ ERROR: No foreign key column found in files table');
      }
    } catch (error) {
      console.error('❌ Error checking files table:', error.message);
    }
    
    // Check foreign key constraints
    try {
      const [constraints] = await sequelize.query(`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM
          information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE
          tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('files', 'pastes')
      `);
      
      console.log('\nForeign key constraints:');
      console.table(constraints);
      
      // Check file-to-paste relationship
      const fileToPasteFK = constraints.find(
        c => c.table_name === 'files' && c.foreign_table_name === 'pastes'
      );
      
      if (fileToPasteFK) {
        console.log('✅ Foreign key from files to pastes exists');
      } else {
        console.error('⚠️ WARNING: No foreign key from files to pastes found');
      }
    } catch (error) {
      console.error('❌ Error checking foreign keys:', error.message);
    }
    
    // Check for data
    try {
      const [pasteCounts] = await sequelize.query(`
        SELECT COUNT(*) as count FROM pastes
      `);
      console.log('\nData summary:');
      console.log(`- Pastes: ${pasteCounts[0].count}`);
      
      const [fileCounts] = await sequelize.query(`
        SELECT COUNT(*) as count FROM files
      `);
      console.log(`- Files: ${fileCounts[0].count}`);
    } catch (error) {
      console.error('❌ Error checking data counts:', error.message);
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await sequelize.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the function
checkDatabaseConsistency(); 