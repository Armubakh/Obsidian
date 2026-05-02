const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * For TiDB Cloud and Render deployment, we use the DATABASE_URL 
 * environment variable which contains the full connection string.
 */
const pool = mysql.createPool(process.env.DATABASE_URL);

// Test the connection
pool.getConnection()
    .then((connection) => {
        console.log('✅ Connected to TiDB MySQL Database');
        connection.release(); // Important to release the connection back to the pool
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err.message);
    });

module.exports = pool;