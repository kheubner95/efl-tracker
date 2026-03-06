const cron = require('node-cron');
const { fetchStandings, fetchFixtures } = require('./fetcher');
const { run: runSimulation } = require('./simulation');

async function runAll() {
  try {
    console.log('[scheduler] Starting hourly update...');
    await fetchStandings();
    await fetchFixtures();
    await runSimulation();
    console.log('[scheduler] Hourly update complete.');
  } catch (err) {
    console.error('[scheduler] Error during update:', err.message);
  }
}

function start() {
  // Run immediately on startup
  runAll();

  // Then every hour on the hour
  cron.schedule('0 * * * *', () => {
    runAll();
  });

  console.log('[scheduler] Hourly cron job started.');
}

module.exports = { start, runAll };
