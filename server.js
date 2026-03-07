require('dotenv').config();
const express = require('express');
const path = require('path');
const { pool, initDB } = require('./db');
const { start: startScheduler } = require('./scheduler');
const { computeStrength, computeContextStrength, blendStrength, matchProbs } = require('./simulation');

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

// API: remaining fixtures with win/draw/loss probabilities for a given team
app.get('/api/fixtures/:teamId', async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  if (!teamId) return res.status(400).json({ ok: false, error: 'Invalid teamId' });

  try {
    const [standings] = await pool.query(`
      SELECT s.*
      FROM standings s
      INNER JOIN (
        SELECT team_id, MAX(scraped_at) AS max_at
        FROM standings
        GROUP BY team_id
      ) latest ON s.team_id = latest.team_id AND s.scraped_at = latest.max_at
    `);

    const [remainingFixtures] = await pool.query(`
      SELECT * FROM fixtures
      WHERE (home_team_id = ? OR away_team_id = ?)
        AND (status = 'SCHEDULED' OR status = 'TIMED')
      ORDER BY match_date ASC
    `, [teamId, teamId]);

    const [finishedFixtures] = await pool.query(`
      SELECT * FROM fixtures WHERE status = 'FINISHED' AND home_score IS NOT NULL
    `);

    // Build season strength + home/away context strength per team
    const homeStats = {};
    const awayStats = {};
    const seasonStrengthMap = {};
    const nameMap = {};
    for (const t of standings) {
      seasonStrengthMap[t.team_id] = computeStrength(t);
      nameMap[t.team_id] = t.team_name;
      homeStats[t.team_id] = { played: 0, won: 0, drawn: 0, goals_for: 0, goals_against: 0 };
      awayStats[t.team_id] = { played: 0, won: 0, drawn: 0, goals_for: 0, goals_against: 0 };
    }
    for (const f of finishedFixtures) {
      const h = f.home_team_id, a = f.away_team_id;
      if (homeStats[h]) {
        homeStats[h].played++;
        homeStats[h].goals_for += f.home_score;
        homeStats[h].goals_against += f.away_score;
        if (f.home_score > f.away_score) homeStats[h].won++;
        else if (f.home_score === f.away_score) homeStats[h].drawn++;
      }
      if (awayStats[a]) {
        awayStats[a].played++;
        awayStats[a].goals_for += f.away_score;
        awayStats[a].goals_against += f.home_score;
        if (f.away_score > f.home_score) awayStats[a].won++;
        else if (f.away_score === f.home_score) awayStats[a].drawn++;
      }
    }
    const homeStrengthMap = {};
    const awayStrengthMap = {};
    for (const t of standings) {
      const s = seasonStrengthMap[t.team_id];
      homeStrengthMap[t.team_id] = blendStrength(s, homeStats[t.team_id]);
      awayStrengthMap[t.team_id] = blendStrength(s, awayStats[t.team_id]);
    }

    const data = remainingFixtures.map(f => {
      const isHome = f.home_team_id === teamId;
      const oppId = isHome ? f.away_team_id : f.home_team_id;
      const myH = homeStrengthMap[teamId] || 0.5;
      const myA = awayStrengthMap[teamId] || 0.5;
      const oppH = homeStrengthMap[oppId] || 0.5;
      const oppA = awayStrengthMap[oppId] || 0.5;
      const { h, d, a } = isHome
        ? matchProbs(myH, oppA)
        : matchProbs(oppH, myA);
      const winProb = isHome ? h : a;
      return {
        date: f.match_date,
        opponent: nameMap[oppId] || 'Unknown',
        home_away: isHome ? 'H' : 'A',
        win_pct: winProb * 100,
        draw_pct: d * 100,
        loss_pct: (isHome ? a : h) * 100,
        xpts: (3 * winProb + d).toFixed(2)
      };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('[api] /api/fixtures error:', err.message);
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
