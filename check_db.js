const mysql = require('mysql2/promise');
require('dotenv').config();
async function test() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    const [tables] = await conn.query('SHOW TABLES');
    for (const row of tables) {
      const tableName = Object.values(row)[0];
      const [fields] = await conn.query(`DESCRIBE ${tableName}`);
      console.log(`\nTable: ${tableName}`);
      fields.forEach(f => console.log(`- ${f.Field} (${f.Type})`));
    }
    await conn.end();
  } catch (e) {
    console.error('DB Error:', e.message);
    process.exit(1);
  }
}
test();
