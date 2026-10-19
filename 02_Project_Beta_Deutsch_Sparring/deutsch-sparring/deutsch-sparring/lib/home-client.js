// The browser's side of the Home page: goals and the numbers on it.
//   logged in    goals live in the database (/api/goals), numbers from GET /api/stats
//   accounts off goals live in localStorage (lib/storage.js); the browser sends a compact copy of its goals,
//                word scores and answer log to POST /api/stats, which only calculates (nothing is stored there)
import {
  usesServer, loadGoalsLocal, saveGoalLocal, deleteGoalLocal, loadScores, loadAnswerLog, progressSaved,
} from './storage';
import { postNow } from './progress-client';

// → { goals, tiles, progress, strengths, gaps } or null when the server could not be reached
export async function loadHome() {
  try {
    if (usesServer()) {
      await progressSaved(); // the answers just given are on the server first
      const res = await fetch('/api/stats', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    }
    const scores = {};
    for (const [id, rec] of Object.entries(loadScores())) scores[id] = [rec?.v?.s ?? 1, rec?.g?.s ?? null];
    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: loadGoalsLocal(), scores, log: loadAnswerLog() }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
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
