const BASE_ELO = 1500;
const K = 20;
const HOME_ADVANTAGE = 100;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function computeEloRatings(fixtures) {
  const ratings = {};

  const finished = fixtures
    .filter(f => f.status === 'FINISHED' && f.home_score != null)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  for (const f of finished) {
    const h = f.home_team_id, a = f.away_team_id;
    if (!ratings[h]) ratings[h] = BASE_ELO;
    if (!ratings[a]) ratings[a] = BASE_ELO;

    let sH, sA;
    if (f.home_score > f.away_score)       { sH = 1;   sA = 0;   }
    else if (f.home_score === f.away_score) { sH = 0.5; sA = 0.5; }
    else                                    { sH = 0;   sA = 1;   }

    const eH = expectedScore(ratings[h] + HOME_ADVANTAGE, ratings[a]);
    const eA = expectedScore(ratings[a], ratings[h] + HOME_ADVANTAGE);

    ratings[h] += K * (sH - eH);
    ratings[a] += K * (sA - eA);
  }

  return ratings; // { teamId: eloRating }
}

module.exports = { computeEloRatings, BASE_ELO };
