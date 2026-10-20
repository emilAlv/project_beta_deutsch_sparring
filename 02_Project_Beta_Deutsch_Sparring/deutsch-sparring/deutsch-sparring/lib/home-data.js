// The Home page numbers for one student, worked out by the app (server only). Used by /api/stats (the Home
// page) and /api/coach (the context the coach gets).
//  - logged in: everything comes from the database; a student only gets their own data.
//  - accounts off: the browser sends a compact copy of its goals, word scores and answer log
//    (see lib/home-client.js); nothing is stored on the server.
import { progress } from './progress';
import { goalsStore } from './goals-store';
import { cleanGoal, MAX_GOALS, isDay, dayNum, todayKey } from './goals';
import { withLegacyFields, PLAN_VERSION } from './plan';
import { cleanPlan, upgradeGoal } from './plan-templates';
import { computePlans, applyReached } from './plan-progress';
import { grammarStatsFromLog, slimStats } from './grammar-stats';
import { computeHome, aggregateAnswers, answersFromLog, scoresFromCompact } from './home-stats';
import { getWords, listSections } from './words';

// What the plan generator (lib/plan-templates.js) needs for one student: the word list, the word scores and the
// per-topic grammar counts (review R10). Used by /api/plan and, from R12, by the Coach. Stores nothing.
//  - logged in: scores and grammarStats from the database;
//  - accounts off: from the browser's compact copy (body.scores, body.rulelog), like /api/stats.
export async function planContext(user, body, today) {
  const base = { words: getWords(), sections: listSections(), today };
  if (user) {
    const [scores, grammarStats] = await Promise.all([progress().scores(user.id), progress().grammarStats(user.id)]);
    return { ...base, scores, grammarStats };
  }
  return { ...base, scores: scoresFromCompact(body?.scores), grammarStats: grammarStatsFromLog(body?.rulelog) };
}

// accounts off: a goal from the browser – a new plan (version 2) or an old-style goal
const cleanAnyGoal = (raw) => {
  if (raw?.version === PLAN_VERSION) {
    const plan = cleanPlan(raw);
    return plan ? withLegacyFields(plan) : null;
  }
  return cleanGoal(raw);
};

// Old-style goals (R12, redesign §4.8): for each one the new plan it would become, made from the same kind, level and scope.
// Nothing is saved: Home asks the student first, and the old "% ready" milestones are dropped when they say yes.
function upgradesFor(goals, ctx) {
  const out = {};
  for (const g of goals) {
    if (Number(g.version) === PLAN_VERSION) continue;
    const r = upgradeGoal(g, ctx);
    if (r) out[g.id] = { goal: r.goal, fits: !r.tight };
  }
  return out;
}

// The plans' progress (lib/plan-progress.js) for the goals that are new plans: { plans, newlyReached }
function plansFor(goals, { scores, grammarStats, today, lastPractice }) {
  return computePlans({ goals, words: getWords(), scores, grammarStats, today, lastPractice });
}

export async function homeData(user, body) {
  // the browser's own day when it is at most one day from the server's (time zones), as in /api/plan
  const server = todayKey();
  const today = isDay(body?.today) && Math.abs(dayNum(body.today) - dayNum(server)) <= 1 ? body.today : server;
  if (user) {
    const [goals, agg, scores, grammarStats] = await Promise.all([
      goalsStore().list(user.id), progress().answerStats(user.id), progress().scores(user.id), progress().grammarStats(user.id),
    ]);
    const { plans, newlyReached } = plansFor(goals, { scores, grammarStats, today });
    // latching: a milestone that is reached for the first time is saved now and stays reached (a failure here must not break Home)
    await Promise.all(Object.entries(newlyReached).map(([goalId, ids]) => goalsStore().markReached(user.id, goalId, ids, today)
      .catch((e) => console.error('markReached failed:', e?.message))));
    const upgrades = upgradesFor(goals, { words: getWords(), sections: listSections(), today, scores, grammarStats });
    return { goals: goals.map((g) => applyReached(g, newlyReached[g.id], today)), ...computeHome({ goals, scores, agg }), grammarStats: slimStats(grammarStats), plans, newlyReached, upgrades };
  }
  const goals = (Array.isArray(body?.goals) ? body.goals : []).slice(0, MAX_GOALS).map(cleanAnyGoal).filter(Boolean);
  const agg = aggregateAnswers(answersFromLog(body?.log));
  // accounts off: the per-topic log (wort_rulelog) comes from the browser
  const scores = scoresFromCompact(body?.scores);
  const grammarStats = grammarStatsFromLog(body?.rulelog);
  const lastPractice = Math.max(0, ...(Array.isArray(body?.log) ? body.log : []).map((e) => Number(e?.t) || 0));
  const { plans, newlyReached } = plansFor(goals, { scores, grammarStats, today, lastPractice });
  const upgrades = upgradesFor(goals, { words: getWords(), sections: listSections(), today, scores, grammarStats });
  return { goals, ...computeHome({ goals, scores, agg }), grammarStats: slimStats(grammarStats), plans, newlyReached, upgrades };
}
