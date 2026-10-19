// Goals and their milestones (Home page). Pure functions, no React, no browser APIs: used by the
// browser (form, timeline), the server (validation) and scripts/check-goals.mjs.
//
// A goal: { id, type: 'exam'|'vocab'|'grammar', level, title, startDate, endDate, scope, milestones }
//   scope      { section, list, rules }  – optional: the word section / list or the grammar rules it covers
//   milestone  { id, date, title, target (0–100, percent), status: 'open'|'done' }
// Dates are plain days like "2026-11-30" (no time zone).
// The progress percent of a goal is worked out by the app (lib/home-stats.js), never by the model.

export const GOAL_TYPES = ['exam', 'vocab', 'grammar'];
export const GOAL_LEVELS = ['A1', 'A2', 'B1'];
export const MAX_GOALS = 12;
export const MAX_MILESTONES = 12;
export const DEFAULT_MILESTONES = 4;
const DAY = 86_400_000;
const MAX_SPAN_DAYS = 3 * 366;

// ---------- days ----------
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const dayNum = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
export const dayOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
// today in the reader's own calendar
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => dayOf(dayNum(s) + n);

const text = (x, max) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const cleanGoalId = (x) => (typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x) ? x : null);
export const newGoalId = (prefix = 'g') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------- validation ----------
export function cleanMilestone(raw, goal) {
  const id = cleanGoalId(raw?.id);
  const title = text(raw?.title, 80);
  const target = Math.round(Number(raw?.target));
  if (!id || !title || !isDay(raw?.date) || !Number.isFinite(target)) return null;
  if (dayNum(raw.date) < dayNum(goal.startDate) || dayNum(raw.date) > dayNum(goal.endDate)) return null; // inside the goal's time frame
  return { id, date: raw.date, title, target: Math.max(0, Math.min(100, target)), status: raw.status === 'done' ? 'done' : 'open' };
}

// Anything from the browser → a clean goal, or null when it is not usable.
export function cleanGoal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = cleanGoalId(raw.id);
  const title = text(raw.title, 80);
  if (!id || !title || !GOAL_TYPES.includes(raw.type) || !GOAL_LEVELS.includes(raw.level)) return null;
  if (!isDay(raw.startDate) || !isDay(raw.endDate)) return null;
  const span = dayNum(raw.endDate) - dayNum(raw.startDate);
  if (span < 1 || span > MAX_SPAN_DAYS) return null;
  const sc = raw.scope && typeof raw.scope === 'object' ? raw.scope : {};
  const goal = {
    id, title, type: raw.type, level: raw.level, startDate: raw.startDate, endDate: raw.endDate,
    scope: {
      section: text(sc.section, 120) || null,
      list: text(sc.section, 120) ? text(sc.list, 120) || null : null,
      rules: (Array.isArray(sc.rules) ? sc.rules : []).slice(0, 12).map((r) => text(r, 80)).filter(Boolean),
    },
  };
  const seen = new Set();
  goal.milestones = (Array.isArray(raw.milestones) ? raw.milestones : []).slice(0, MAX_MILESTONES)
    .map((m) => cleanMilestone(m, goal))
    .filter((m) => m && !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.target - b.target);
  return goal;
}

// The default plan of a new goal: `count` milestones, evenly spaced in time, with evenly spaced targets
// (25 / 50 / 75 / 100 %). titleOf(target, i) gives the text. The timeline is never empty.
export function defaultMilestones(goal, titleOf, count = DEFAULT_MILESTONES) {
  const start = dayNum(goal.startDate);
  const span = dayNum(goal.endDate) - start;
  const n = Math.max(1, Math.min(count, span));
  return Array.from({ length: n }, (_, i) => {
    const target = Math.round(((i + 1) / n) * 100);
    return {
      id: newGoalId('m'),
      date: dayOf(start + Math.round((span * (i + 1)) / n)),
      title: titleOf(target, i),
      target,
      status: 'open',
    };
  });
}

// ---------- state of a goal today ----------
// progress = percent 0–100 computed by the app. → what the Home page shows
export function goalState(goal, progress, today) {
  const start = dayNum(goal.startDate);
  const end = dayNum(goal.endDate);
  const now = dayNum(today);
  const span = Math.max(1, end - start);
  const elapsed = Math.max(0, Math.min(100, Math.round(((now - start) / span) * 100)));
  const pct = Math.max(0, Math.min(100, Math.round(progress || 0)));
  let tag = 'onTrack';
  if (now < start) tag = 'upcoming';
  else if (pct >= 100) tag = 'done';
  else if (pct < elapsed - 10) tag = 'behind';
  return { pct, elapsed, tag, weeksLeft: now > end ? 0 : Math.ceil((end - now) / 7), ended: now > end };
}

// One status per milestone: 'reached' | 'missed' | 'next' | 'coming'
export function milestoneStates(goal, progress, today) {
  const now = dayNum(today);
  const states = goal.milestones.map((m) => {
    if (m.status === 'done' || progress >= m.target) return 'reached';
    return dayNum(m.date) < now ? 'missed' : 'coming';
  });
  const next = states.indexOf('coming');
  if (next >= 0) states[next] = 'next';
  return states;
}

// ---------- the timeline ----------
// Month ticks between two days: [{ day, label (month index 0–11), year, pos (0–1) }]. Long plans get fewer ticks.
export function monthTicks(fromDay, toDay) {
  const from = dayNum(fromDay);
  const to = dayNum(toDay);
  const span = Math.max(1, to - from);
  const months = span / 30.4;
  const every = months > 30 ? 6 : months > 14 ? 3 : months > 7 ? 2 : 1;
  const out = [];
  const d = new Date(`${fromDay}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  let i = 0;
  while (Math.round(d.getTime() / DAY) < to) {
    const n = Math.round(d.getTime() / DAY);
    if (i % every === 0) out.push({ day: dayOf(n), month: d.getUTCMonth(), year: d.getUTCFullYear(), pos: (n - from) / span });
    d.setUTCMonth(d.getUTCMonth() + 1);
    i += 1;
  }
  return out;
}

// Whole plan: from the earliest start to the latest end of all goals.
// Still to do: from today to the latest end; goals that have ended are left out, and milestones
// before today are folded: reached ones into "✓ N reached", missed ones into "N missed".
// → { from, to, rows: [{ goal, progress, state, folded: { reached, missed }, dots: [{ m, status, pos }] }] }
export function buildTimeline(goals, progressOf, today, mode = 'whole') {
  const still = mode === 'still';
  const list = goals.filter((g) => !still || g.endDate >= today);
  if (!list.length) return { from: today, to: addDays(today, 30), rows: [] };
  let from = still ? today : list.map((g) => g.startDate).sort()[0];
  let to = list.map((g) => g.endDate).sort().at(-1);
  if (to <= from) to = addDays(from, 30);
  const span = dayNum(to) - dayNum(from);
  const pos = (day) => Math.max(0, Math.min(1, (dayNum(day) - dayNum(from)) / span));
  const rows = list.map((goal) => {
    const progress = progressOf(goal);
    const states = milestoneStates(goal, progress, today);
    const folded = { reached: 0, missed: 0 };
    const dots = [];
    goal.milestones.forEach((m, i) => {
      const status = states[i];
      if (still && m.date < today) {
        if (status === 'reached') folded.reached += 1;
        else folded.missed += 1;
        return;
      }
      dots.push({ m, status, pos: pos(m.date) });
    });
    return {
      goal, progress, state: goalState(goal, progress, today), folded, dots,
      start: pos(goal.startDate), end: pos(goal.endDate),
    };
  });
  return { from, to, today: pos(today), todayInside: today >= from && today <= to, rows };
}
