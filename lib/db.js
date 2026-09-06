const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    const config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'deployflow',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+08:00',
    };
    pool = mysql.createPool(config);
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

module.exports = { getPool, query, queryOne, run };
