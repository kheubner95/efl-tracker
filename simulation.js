const { pool } = require('./db');
const { generateDescription } = require('./descriptions');

const ITERATIONS = 10000;
// Championship base rates (home win ~44%, draw ~26%, away win ~30%)
const BASE_HOME = 0.44;
const BASE_DRAW = 0.26;
const BASE_AWAY = 0.30;

function computeStrength(team) {
  // Weighted: 50% pts/game, 25% goals scored/game, 25% goals conceded/game (inverted)
  const played = team.played || 1;
  const ppg = team.points / played;
  const gfpg = team.goals_for / played;
  const gapg = team.goals_against / played;
  // Higher = stronger; less goals conceded is better, so we invert by using 3 - gapg
  return (ppg / 3) * 0.5 + (gfpg / 3) * 0.25 + ((3 - gapg) / 3) * 0.25;
}

function matchProbs(homeStrength, awayStrength) {
  const ratio = homeStrength / (awayStrength || 0.001);
  // Scale base rates by strength ratio, then renormalize
  let h = BASE_HOME * ratio;
  let d = BASE_DRAW;
  let a = BASE_AWAY / ratio;
  const total = h + d + a;
  h /= total; d /= total; a /= total;
  return { h, d, a };
}

function simulate(standings, fixtures) {
  const teamMap = {};
  for (const t of standings) {
    teamMap[t.team_id] = {
      team_id: t.team_id,
      team_name: t.team_name,
      points: t.points,
      goals_for: t.goals_for,
      goals_against: t.goals_against,
      goal_difference: t.goal_difference,
      played: t.played,
      strength: computeStrength(t)
    };
  }

  const remaining = fixtures.filter(f => f.status === 'SCHEDULED' || f.status === 'TIMED');

  // Games remaining per team
  const gamesLeft = {};
  for (const f of remaining) {
    gamesLeft[f.home_team_id] = (gamesLeft[f.home_team_id] || 0) + 1;
    gamesLeft[f.away_team_id] = (gamesLeft[f.away_team_id] || 0) + 1;
  }

  // Schedule difficulty: average opponent strength per team
  const oppStrengthSum = {};
  const oppCount = {};
  for (const f of remaining) {
    const hs = teamMap[f.home_team_id]?.strength || 0.5;
    const as_ = teamMap[f.away_team_id]?.strength || 0.5;
    oppStrengthSum[f.home_team_id] = (oppStrengthSum[f.home_team_id] || 0) + as_;
    oppStrengthSum[f.away_team_id] = (oppStrengthSum[f.away_team_id] || 0) + hs;
    oppCount[f.home_team_id] = (oppCount[f.home_team_id] || 0) + 1;
    oppCount[f.away_team_id] = (oppCount[f.away_team_id] || 0) + 1;
  }

  const rawDifficulty = {};
  for (const id of Object.keys(teamMap)) {
    const tid = parseInt(id);
    rawDifficulty[tid] = oppCount[tid]
      ? oppStrengthSum[tid] / oppCount[tid]
      : 0.5;
  }

  // Normalize difficulty 0–1
  const vals = Object.values(rawDifficulty);
  const minD = Math.min(...vals);
  const maxD = Math.max(...vals);
  const range = maxD - minD || 1;
  const schedDifficulty = {};
  for (const [id, val] of Object.entries(rawDifficulty)) {
    schedDifficulty[parseInt(id)] = (val - minD) / range;
  }

  // Monte Carlo
  const counts = { auto: {}, playoff: {}, mid: {}, rel: {} };
  for (const id of Object.keys(teamMap)) {
    const tid = parseInt(id);
    counts.auto[tid] = 0;
    counts.playoff[tid] = 0;
    counts.mid[tid] = 0;
    counts.rel[tid] = 0;
  }

  for (let i = 0; i < ITERATIONS; i++) {
    // Deep-copy current points + GD
    const pts = {};
    const gd = {};
    const gf = {};
    for (const [id, t] of Object.entries(teamMap)) {
      const tid = parseInt(id);
      pts[tid] = t.points;
      gd[tid] = t.goal_difference;
      gf[tid] = t.goals_for;
    }

    // Simulate each remaining fixture
    for (const f of remaining) {
      const hTeam = teamMap[f.home_team_id];
      const aTeam = teamMap[f.away_team_id];
      if (!hTeam || !aTeam) continue;

      const { h, d, a } = matchProbs(hTeam.strength, aTeam.strength);
      const r = Math.random();

      if (r < h) {
        // Home win
        pts[f.home_team_id] += 3;
        const goals = 2 + Math.floor(Math.random() * 2);
        const conceded = Math.floor(Math.random() * 2);
        gd[f.home_team_id] += goals - conceded;
        gd[f.away_team_id] += conceded - goals;
        gf[f.home_team_id] += goals;
        gf[f.away_team_id] += conceded;
      } else if (r < h + d) {
        // Draw
        const goals = Math.floor(Math.random() * 3);
        gf[f.home_team_id] += goals;
        gf[f.away_team_id] += goals;
      } else {
        // Away win
        pts[f.away_team_id] += 3;
        const goals = 2 + Math.floor(Math.random() * 2);
        const conceded = Math.floor(Math.random() * 2);
        gd[f.away_team_id] += goals - conceded;
        gd[f.home_team_id] += conceded - goals;
        gf[f.away_team_id] += goals;
        gf[f.home_team_id] += conceded;
      }
    }

    // Sort simulated final table
    const teamIds = Object.keys(pts).map(Number);
    teamIds.sort((a, b) => {
      if (pts[b] !== pts[a]) return pts[b] - pts[a];
      if (gd[b] !== gd[a]) return gd[b] - gd[a];
      return gf[b] - gf[a];
    });

    for (let pos = 0; pos < teamIds.length; pos++) {
      const tid = teamIds[pos];
      const rank = pos + 1;
      if (rank <= 2) counts.auto[tid]++;
      else if (rank <= 6) counts.playoff[tid]++;
      else if (rank <= 21) counts.mid[tid]++;
      else counts.rel[tid]++;
    }
  }

  // Build results
  const results = [];
  for (const [id, t] of Object.entries(teamMap)) {
    const tid = parseInt(id);
    const autoPct = ((counts.auto[tid] || 0) / ITERATIONS * 100).toFixed(2);
    const playPct = ((counts.playoff[tid] || 0) / ITERATIONS * 100).toFixed(2);
    const midPct = ((counts.mid[tid] || 0) / ITERATIONS * 100).toFixed(2);
    const relPct = ((counts.rel[tid] || 0) / ITERATIONS * 100).toFixed(2);
    const gl = gamesLeft[tid] || 0;
    const diff = parseFloat((schedDifficulty[tid] || 0).toFixed(3));

    const standingRow = standings.find(s => s.team_id === tid);
    const description = generateDescription({
      teamName: t.team_name,
      position: standingRow.position,
      points: t.points,
      gamesRemaining: gl,
      scheduleDifficulty: diff,
      form: standingRow.form || '',
      autoPct: parseFloat(autoPct),
      playoffPct: parseFloat(playPct),
      relegationPct: parseFloat(relPct),
      allStandings: standings
    });

    results.push({
      team_id: tid,
      team_name: t.team_name,
      position: standingRow.position,
      played: t.played,
      points: t.points,
      goal_difference: t.goal_difference,
      games_remaining: gl,
      schedule_difficulty: diff,
      auto_promotion_pct: autoPct,
      playoff_pct: playPct,
      mid_table_pct: midPct,
      relegation_pct: relPct,
      description
    });
  }

  return results;
}

async function run() {
  console.log('[simulation] Loading data from DB...');

  const conn = await pool.getConnection();
  let standings, fixtures;
  try {
    // Get most recent standing per team
    const [rows] = await conn.query(`
      SELECT s.*
      FROM standings s
      INNER JOIN (
        SELECT team_id, MAX(scraped_at) AS max_at
        FROM standings
        GROUP BY team_id
      ) latest ON s.team_id = latest.team_id AND s.scraped_at = latest.max_at
      ORDER BY s.position
    `);
    standings = rows;

    const [fxRows] = await conn.query(`SELECT * FROM fixtures`);
    fixtures = fxRows;
  } finally {
    conn.release();
  }

  if (!standings.length) {
    console.log('[simulation] No standings data — skipping.');
    return;
  }

  console.log(`[simulation] Running ${ITERATIONS} iterations over ${standings.length} teams, ${fixtures.filter(f => f.status === 'SCHEDULED' || f.status === 'TIMED').length} remaining fixtures...`);
  const results = simulate(standings, fixtures);

  // Save to DB
  const conn2 = await pool.getConnection();
  try {
    for (const r of results) {
      await conn2.query(`
        INSERT INTO simulation_results
          (team_id, team_name, position, played, points, goal_difference,
           games_remaining, schedule_difficulty, auto_promotion_pct, playoff_pct,
           mid_table_pct, relegation_pct, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          team_name=VALUES(team_name), position=VALUES(position),
          played=VALUES(played), points=VALUES(points),
          goal_difference=VALUES(goal_difference),
          games_remaining=VALUES(games_remaining),
          schedule_difficulty=VALUES(schedule_difficulty),
          auto_promotion_pct=VALUES(auto_promotion_pct),
          playoff_pct=VALUES(playoff_pct),
          mid_table_pct=VALUES(mid_table_pct),
          relegation_pct=VALUES(relegation_pct),
          description=VALUES(description),
          last_updated=CURRENT_TIMESTAMP
      `, [
        r.team_id, r.team_name, r.position, r.played, r.points,
        r.goal_difference, r.games_remaining, r.schedule_difficulty,
        r.auto_promotion_pct, r.playoff_pct, r.mid_table_pct,
        r.relegation_pct, r.description
      ]);
    }
    console.log(`[simulation] Saved ${results.length} simulation results.`);
  } finally {
    conn2.release();
  }

  return results;
}

module.exports = { run };
