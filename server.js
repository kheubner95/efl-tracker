require('dotenv').config();
const express = require('express');
const path = require('path');
const { pool, initDB } = require('./db');
const { start: startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname)));

// API: get simulation results (sorted by position)
app.get('/api/table', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM simulation_results ORDER BY position ASC'
    );
    res.json({ data: rows, ok: true });
  } catch (err) {
    console.error('[api] /api/table error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: last updated timestamp
app.get('/api/status', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT MAX(last_updated) AS last_updated FROM simulation_results'
    );
    res.json({ last_updated: rows[0]?.last_updated || null, ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function main() {
  await initDB();
  startScheduler();
  app.listen(PORT, () => {
    console.log(`[server] EFL Tracker running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
