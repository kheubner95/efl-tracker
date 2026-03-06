require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS standings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        team_name VARCHAR(100) NOT NULL,
        position INT, played INT, won INT, drawn INT, lost INT,
        goals_for INT, goals_against INT, goal_difference INT,
        points INT, form VARCHAR(20),
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS fixtures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        match_id INT NOT NULL UNIQUE,
        home_team_id INT, away_team_id INT,
        home_team_name VARCHAR(100), away_team_name VARCHAR(100),
        match_date DATETIME, status VARCHAR(20),
        home_score INT, away_score INT,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS simulation_results (
        team_id INT NOT NULL UNIQUE,
        team_name VARCHAR(100), position INT,
        played INT, points INT, goal_difference INT, games_remaining INT,
        schedule_difficulty DECIMAL(5,3),
        auto_promotion_pct DECIMAL(5,2),
        playoff_pct DECIMAL(5,2),
        mid_table_pct DECIMAL(5,2),
        relegation_pct DECIMAL(5,2),
        description TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`ALTER TABLE simulation_results ADD COLUMN expected_points DECIMAL(5,2)`)
      .catch(err => { if (err.errno !== 1060) throw err; }); // 1060 = column already exists

    console.log('Database tables initialized.');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
