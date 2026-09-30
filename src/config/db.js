import mysql from 'mysql2/promise';
import { config } from './env.js';

/**
 * ====================================================================
 * 🗄️ MySQL Connection Pool (Senior Software Engineer Pattern)
 * ====================================================================
 * - Uses connection pooling for high throughput and reliability.
 * - Auto-manages connections and releases them back to the pool.
 */
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: config.db.waitForConnections,
  connectionLimit: config.db.connectionLimit,
  queueLimit: config.db.queueLimit,
  namedPlaceholders: true,
});

/**
 * Test & Initialize MySQL connection on server startup
 */
export const connectDB = async () => {
  try {
    // 1. Check if database exists, create if not
    const tempConnection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
    });

    await tempConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await tempConnection.end();

    // 2. Test pool connection
    const connection = await pool.getConnection();

    // 3. Auto-create sample table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vehicle_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if table has data, if empty, seed demo data
    const [existing] = await connection.query('SELECT COUNT(*) as count FROM vehicle_models');
    if (existing[0]?.count === 0) {
      await connection.query(`
        INSERT INTO vehicle_models (name, category, status) VALUES
        ('Truck Body Model Alpha', 'Heavy Duty', 'Active'),
        ('Tipper Body Model X', 'Tipper', 'Active'),
        ('Container Body Spec-Z', 'Container', 'Pending Review')
      `);
      console.log('🌱 Initial sample data seeded into vehicle_models table');
    }

    console.log(`\n==================================================`);
    console.log(`✅ MySQL Connected Successfully!`);
    console.log(`📦 Database: ${config.db.database}`);
    console.log(`🌐 Host: ${config.db.host}:${config.db.port}`);
    console.log(`==================================================\n`);

    connection.release();
  } catch (error) {
    console.warn(`\n⚠️  [MySQL Notice]: ${error.message}`);
    console.warn(`💡 Tip: Agar MySQL (XAMPP / MySQL Service) band hai, to use start karein.`);
    console.warn(`   Backend bina crash hue smoothly chal raha hai (with fallback data).\n`);
  }
};

/**
 * Centralized Query Helper
 * Example usage:
 * const [rows] = await db.query('SELECT * FROM vehicle_models WHERE id = ?', [id]);
 */
export const db = {
  query: (sql, params) => pool.query(sql, params),
  execute: (sql, params) => pool.execute(sql, params),
  getConnection: () => pool.getConnection(),
};

export default db;
