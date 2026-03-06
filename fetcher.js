require('dotenv').config();
const axios = require('axios');
const { pool } = require('./db');

const API_BASE = 'https://api.football-data.org/v4';
const headers = { 'X-Auth-Token': process.env.FOOTBALL_API_KEY };

async function fetchStandings() {
  console.log('[fetcher] Fetching standings...');
  const res = await axios.get(`${API_BASE}/competitions/ELC/standings`, { headers });
  const table = res.data.standings.find(s => s.type === 'TOTAL').table;

  const conn = await pool.getConnection();
  try {
    for (const row of table) {
      await conn.query(
        `INSERT INTO standings
          (team_id, team_name, position, played, won, drawn, lost,
           goals_for, goals_against, goal_difference, points, form)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.team.id, row.team.name, row.position, row.playedGames,
          row.won, row.draw, row.lost, row.goalsFor, row.goalsAgainst,
          row.goalDifference, row.points, row.form || ''
        ]
      );
    }
    console.log(`[fetcher] Saved ${table.length} standings rows.`);
  } finally {
    conn.release();
  }

  return table;
}

async function fetchFixtures() {
  console.log('[fetcher] Fetching fixtures...');
  const res = await axios.get(`${API_BASE}/competitions/ELC/matches`, { headers });
  const matches = res.data.matches;

  const conn = await pool.getConnection();
  try {
    for (const m of matches) {
      const homeScore = m.score?.fullTime?.home ?? null;
      const awayScore = m.score?.fullTime?.away ?? null;
      await conn.query(
        `INSERT INTO fixtures
          (match_id, home_team_id, away_team_id, home_team_name, away_team_name,
           match_date, status, home_score, away_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status=VALUES(status),
           home_score=VALUES(home_score),
           away_score=VALUES(away_score),
           match_date=VALUES(match_date)`,
        [
          m.id, m.homeTeam.id, m.awayTeam.id,
          m.homeTeam.name, m.awayTeam.name,
          new Date(m.utcDate), m.status,
          homeScore, awayScore
        ]
      );
    }
    console.log(`[fetcher] Upserted ${matches.length} fixtures.`);
  } finally {
    conn.release();
  }

  return matches;
}

module.exports = { fetchStandings, fetchFixtures };
