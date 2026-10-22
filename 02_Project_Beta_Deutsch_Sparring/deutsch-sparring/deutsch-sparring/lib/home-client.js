// The browser's side of the Home page: goals and the numbers on it.
//   logged in    goals live in the database (/api/goals), numbers from GET /api/stats
//   accounts off goals live in localStorage (lib/storage.js); the browser sends a compact copy of its goals,
//                word scores and answer log to POST /api/stats, which only calculates (nothing is stored there)
import {
  usesServer, loadGoalsLocal, saveGoalLocal, deleteGoalLocal, loadScores, loadAnswerLog, loadRuleLog, progressSaved, markReachedLocal,
} from './storage';
import { postWithCode } from './progress-client';
import { compactOf } from './scores';
import { todayKey } from './goals';
import { tickExam } from './home-plan';

// Accounts off: the compact copy of the browser's own goals, word scores and answer log, from which the
// server works out the numbers (nothing is stored there). The coach gets the same copy.
export function localNumbers() {
  const scores = {};
  for (const [id, rec] of Object.entries(loadScores())) scores[id] = compactOf(rec); // [Meaning, Sentence, Article, Plural]
  return { goals: loadGoalsLocal(), scores, log: loadAnswerLog(), rulelog: loadRuleLog(), today: todayKey() };
}

// → { goals, tiles, progress, strengths, gaps } or null when the server could not be reached
export async function loadHome() {
  try {
    if (usesServer()) {
      await progressSaved(); // the answers just given are on the server first
      const res = await fetch('/api/stats', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    }
    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localNumbers()),
    });
    const data = res.ok ? await res.json() : null;
    // a milestone reached for the first time stays reached: save it here (the server stores nothing)
    if (data?.newlyReached) markReachedLocal(data.newlyReached, todayKey());
    return data;
  } catch {
    return null;
  }
}

// A small copy of the goal progress, taken when a session starts: the summary screen compares it with the
// numbers after the session. → { progress: { [goalId]: percent }, learnt } or null
export async function goalSnapshot() {
  const d = await loadHome();
  return d ? { progress: d.progress || {}, learnt: d.tiles?.learnt ?? 0 } : null;
}

// ---------- goals through the Coach (R12): the plan generator on the server, nothing is stored there ----------
// Accounts off: the browser also sends its word scores and rulelog, so the plan knows what is already solid.
async function planCall(payload) {
  try {
    const { scores, rulelog, today } = usesServer() ? { today: todayKey() } : localNumbers();
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, today, ...(scores ? { scores, rulelog } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ...data, ok: true } : { ok: false, code: data.code || 'server' };
  } catch {
    return { ok: false, code: 'network' };
  }
}
// Accept: the request of the preview → the goal to save (names and dates made by the templates)
export const buildGoal = (request) => planCall({ draft: request });
// a "doesn't fit" fix picked → the same goal previewed again: { ok, proposal }
export const previewFix = (request, lever) => planCall({ fix: { request, lever } });
// Apply: the goal as it is now + the change → the new goal to save
export const changeGoal = (goal, levers, label) => planCall({ goal, levers, label });

// → { ok } – or { ok: false, code } (code 'limit' = today's save limit reached, see lib/progress-api.js)
export async function saveGoal(goal) {
  if (!usesServer()) return { ok: Boolean(saveGoalLocal(goal)) };
  const { ok, code } = await postWithCode('/api/goals', { goal });
  return ok ? { ok: true } : { ok: false, code };
}

export async function removeGoal(id) {
  if (!usesServer()) {
    deleteGoalLocal(id);
    return true;
  }
  try {
    const res = await fetch(`/api/goals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// The student ticks an exam milestone done (a mock exam, Schreiben/Sprechen done outside the app), with optional points.
// → true when saved
export async function tickMilestone(goal, milestoneId, result) {
  if (!usesServer()) {
    const next = tickExam(goal, milestoneId, todayKey(), result);
    return Boolean(next) && saveGoalLocal(next);
  }
  try {
    const res = await fetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId: goal.id, milestoneId, result: result || null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
