// The Home page numbers for one student, worked out by the app (server only). Used by /api/stats (the Home
// page) and /api/coach (the context the coach gets).
//  - logged in: everything comes from the database; a student only gets their own data.
//  - accounts off: the browser sends a compact copy of its goals, word scores and answer log
//    (see lib/home-client.js); nothing is stored on the server.
import { progress } from './progress';
import { goalsStore } from './goals-store';
import { cleanGoal, MAX_GOALS } from './goals';
import { computeHome, aggregateAnswers, answersFromLog, scoresFromCompact } from './home-stats';

export async function homeData(user, body) {
  if (user) {
    const [goals, agg, scores] = await Promise.all([goalsStore().list(user.id), progress().answerStats(user.id), progress().scores(user.id)]);
    return { goals, ...computeHome({ goals, scores, agg }) };
  }
  const goals = (Array.isArray(body?.goals) ? body.goals : []).slice(0, MAX_GOALS).map(cleanGoal).filter(Boolean);
  const agg = aggregateAnswers(answersFromLog(body?.log));
  return { goals, ...computeHome({ goals, scores: scoresFromCompact(body?.scores), agg }) };
}
