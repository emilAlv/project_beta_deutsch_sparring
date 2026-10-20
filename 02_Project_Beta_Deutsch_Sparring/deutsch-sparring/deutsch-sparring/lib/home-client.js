// The browser's side of the Home page: goals and the numbers on it.
//   logged in    goals live in the database (/api/goals), numbers from GET /api/stats
//   accounts off goals live in localStorage (lib/storage.js); the browser sends a compact copy of its goals,
//                word scores and answer log to POST /api/stats, which only calculates (nothing is stored there)
import {
  usesServer, loadGoalsLocal, saveGoalLocal, deleteGoalLocal, loadScores, loadAnswerLog, loadRuleLog, progressSaved,
} from './storage';
import { postNow } from './progress-client';

// Accounts off: the compact copy of the browser's own goals, word scores and answer log, from which the
// server works out the numbers (nothing is stored there). The coach gets the same copy.
export function localNumbers() {
  const scores = {};
  for (const [id, rec] of Object.entries(loadScores())) scores[id] = [rec?.v?.s ?? 1, rec?.g?.s ?? null];
  return { goals: loadGoalsLocal(), scores, log: loadAnswerLog(), rulelog: loadRuleLog() };
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
    return res.ok ? await res.json() : null;
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

// → true when saved
export async function saveGoal(goal) {
  if (!usesServer()) {
    saveGoalLocal(goal);
    return true;
  }
  const answer = await postNow('/api/goals', { goal });
  return Boolean(answer?.ok);
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
