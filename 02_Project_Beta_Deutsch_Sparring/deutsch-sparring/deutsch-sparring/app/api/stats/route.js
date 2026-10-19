import { progressRoute } from '../../../lib/progress-api';
import { progress } from '../../../lib/progress';
import { goalsStore } from '../../../lib/goals-store';
import { cleanGoal, MAX_GOALS } from '../../../lib/goals';
import { computeHome, aggregateAnswers, answersFromLog, scoresFromCompact } from '../../../lib/home-stats';

export const dynamic = 'force-dynamic';

// The numbers for the Home page: tiles, goal progress, strengths & gaps (last 30 days), worked out by the app.
//  - logged in: GET → everything comes from the database ({ goals, ...stats }); a student only gets their own data.
//  - accounts off: POST { goals, scores, log } from the browser's own storage → the same numbers
//    (nothing is stored on the server; the browser sends a compact copy, see lib/home-client.js).
async function home(user, body) {
  if (user) {
    const [goals, agg, scores] = await Promise.all([goalsStore().list(user.id), progress().answerStats(user.id), progress().scores(user.id)]);
    return { goals, ...computeHome({ goals, scores, agg }) };
  }
  const goals = (Array.isArray(body?.goals) ? body.goals : []).slice(0, MAX_GOALS).map(cleanGoal).filter(Boolean);
  const agg = aggregateAnswers(answersFromLog(body?.log));
  return { goals, ...computeHome({ goals, scores: scoresFromCompact(body?.scores), agg }) };
}

export const GET = (req) => progressRoute(req, {}, ({ user, body }) => home(user, body));
export const POST = (req) => progressRoute(req, { write: true, maxBytes: 400_000, allowOff: true }, ({ user, body }) => home(user, body));
