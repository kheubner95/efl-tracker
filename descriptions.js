function difficultyLabel(d) {
  if (d < 0.25) return 'easy';
  if (d < 0.5) return 'average';
  if (d < 0.75) return 'tough';
  return 'very tough';
}

function formSummary(form) {
  if (!form) return null;
  const recent = form.slice(-5);
  const wins = (recent.match(/W/g) || []).length;
  const draws = (recent.match(/D/g) || []).length;
  const losses = (recent.match(/L/g) || []).length;
  if (wins >= 4) return 'in excellent form';
  if (wins >= 3) return 'in good form';
  if (losses >= 4) return 'badly out of form';
  if (losses >= 3) return 'struggling for form';
  if (wins === losses && wins >= 2) return 'inconsistent';
  return null;
}

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pointsGap(points, targetPoints) {
  const diff = targetPoints - points;
  if (diff === 0) return 'level with';
  if (diff > 0) return `${diff} point${diff > 1 ? 's' : ''} behind`;
  return `${Math.abs(diff)} point${Math.abs(diff) > 1 ? 's' : ''} ahead of`;
}

function generateDescription({ position, points, gamesRemaining, scheduleDifficulty, form, autoPct, playoffPct, relegationPct, allStandings }) {
  const pos = position;
  const gl = gamesRemaining;
  const diff = difficultyLabel(scheduleDifficulty);
  const formNote = formSummary(form);

  // Find threshold points from current standings
  const sorted = [...allStandings].sort((a, b) => a.position - b.position);
  const p2 = sorted[1]?.points;    // 2nd place points
  const p6 = sorted[5]?.points;    // 6th place points
  const p7 = sorted[6]?.points;    // 7th place
  const p21 = sorted[20]?.points;  // 21st place

  let sentence1 = '';
  let sentence2 = '';

  if (pos <= 2) {
    // Automatic promotion zone
    sentence1 = `${ordinal(pos)} in the automatic promotion places`;
    if (gl === 0) {
      sentence1 += ' — automatic promotion secured.';
    } else {
      sentence1 += ` with ${gl} game${gl !== 1 ? 's' : ''} remaining`;
      sentence1 += diff === 'easy' || diff === 'average'
        ? ' and a favourable run-in.'
        : ` and a ${diff} run-in — need to hold their nerve.`;
    }
    sentence2 = autoPct > 80 ? 'Automatic promotion looks very likely.' : 'Still in the driving seat but not safe yet.';
  } else if (pos <= 6) {
    // Playoff zone
    const gapTo2nd = p2 !== undefined ? pointsGap(points, p2) : null;
    sentence1 = `${ordinal(pos)}, in the playoff places`;
    if (gapTo2nd) sentence1 += `, ${gapTo2nd} automatic promotion`;
    if (gl > 0) sentence1 += ` with ${gl} game${gl !== 1 ? 's' : ''} to go`;
    sentence1 += '.';

    if (autoPct > 20) {
      sentence2 = `Still a realistic shot at automatic promotion with a ${diff} schedule ahead.`;
    } else if (playoffPct > 60) {
      sentence2 = `Playoff spot looks secure — aiming to climb with a ${diff} run-in.`;
    } else {
      sentence2 = `Playoff place not yet safe — ${diff} games ahead make this a nervy finish.`;
    }
  } else if (pos <= 10) {
    // Top-half fringe
    const gapTo6th = p6 !== undefined ? pointsGap(points, p6) : null;
    sentence1 = `${ordinal(pos)}`;
    if (gapTo6th) sentence1 += `, ${gapTo6th} the playoff places`;
    if (gl > 0) sentence1 += ` with ${gl} game${gl !== 1 ? 's' : ''} remaining`;
    sentence1 += '.';

    if (playoffPct > 25) {
      sentence2 = `An outside chance at the playoffs — needs to capitalise on a ${diff} run-in.`;
    } else {
      sentence2 = `Unlikely to threaten the playoffs — expecting a mid-table finish.`;
    }
  } else if (pos <= 20) {
    // Mid-table
    sentence1 = `${ordinal(pos)} in mid-table`;
    if (gl > 0) sentence1 += ` with ${gl} game${gl !== 1 ? 's' : ''} left`;
    sentence1 += '.';

    if (relegationPct > 15) {
      sentence2 = `Danger of being dragged into a relegation battle with a ${diff} schedule remaining.`;
    } else {
      sentence2 = `Comfortably placed in mid-table — a ${diff} finish expected.`;
    }
  } else {
    // Relegation zone or danger
    const gapTo21st = p21 !== undefined ? pointsGap(points, p21) : null;
    sentence1 = `${ordinal(pos)}`;
    if (pos <= 20 && gapTo21st) sentence1 += `, ${gapTo21st} the relegation zone`;
    else if (pos > 20) sentence1 += ' in the relegation zone';
    if (gl > 0) sentence1 += ` with ${gl} ${diff} game${gl !== 1 ? 's' : ''} remaining`;
    sentence1 += '.';

    if (relegationPct > 70) {
      sentence2 = 'Relegation looks very likely at this stage.';
    } else if (relegationPct > 40) {
      sentence2 = 'In serious danger — will need an immediate turnaround.';
    } else {
      sentence2 = 'In the drop zone but still fighting — safety is achievable.';
    }
  }

  // Append form note if notable
  const formAppend = formNote ? ` The team is ${formNote}.` : '';

  return `${sentence1} ${sentence2}${formAppend}`.trim();
}

module.exports = { generateDescription };
