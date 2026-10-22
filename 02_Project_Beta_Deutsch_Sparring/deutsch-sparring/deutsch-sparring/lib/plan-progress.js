// How far a student is with a PLAN (review R11, redesign §2.4 and §4.3). The ONE place where "is this milestone
// reached?" is decided: change the rules here, nowhere else. Pure functions, no React, no fs, no database: used by the
// server (/api/stats, the Coach later), the generator (lib/plan-templates.js asks the same questions to mark
// "already solid") and the checks.
//
// Input   computePlans({ goals, words, scores, grammarStats, today, lastPractice? })
//           goals          clean v2 goals (lib/plan.js); old-style goals are ignored
//           words          the word list (vocab/words.json via lib/words.js)
//           scores         { [wordId]: record } as in lib/scores.js
//           grammarStats   { [topicId]: { n, points, pct, recent: [[ok, hinted, t], …] } } (lib/grammar-stats.js);
//                          situation lessons are in it under their lesson id
//           today          "YYYY-MM-DD"
//           lastPractice   optional: ms of the last answer (if missing it is taken from scores and grammarStats)
// Output  { plans: { [goalId]: { status, progressShare, nextMilestoneId, reached, total,
//                                parts: { [partId]: { reached, total, nextId, behindDays, aheadDays } },
//                                milestones: { [milestoneId]: { have, need, total, unit, state, refresh, … } } } },
//           newlyReached: { [goalId]: [milestoneId, …] } }
//
// Milestone `state`: 'reached' | 'refresh' (reached, but it needs a refresh session) | 'introduced' (grammar, not yet
// solid) | 'open' | 'skipped'. A milestone that has `reachedAt` NEVER goes back: the tick stays, only `refresh` shows.
import { dayNum, isDay } from './goals.js';
import { curriculumEntry, topicThreshold } from './curriculum.js';
import { vScore, isDue } from './scores.js';
import { isReached } from './plan.js';

// ---------- the numbers (redesign §2.4, D3, D4) ----------
export const LEARNT_FROM = 8; // a word is "learnt" with V >= 8 (the same as the Home tile, lib/home-stats.js)
export const CHUNK_REACHED = 0.9; // D3: a word chunk is reached with 90 % of its words learnt
export const SOLID_ANSWERS = 20; // grammar "solid": at least 20 counted answers …
export const SOLID_DAYS = 2; // … on at least 2 different days …
export const SOLID_LAST = 20; // … and the last 20 answers at the topic's threshold (80 % productive, 70 % receptive)
export const INTRODUCED_ANSWERS = 10;
export const INTRODUCED_PCT = 60;
export const LESSON_DONE_ANSWERS = 10;
export const LESSON_DONE_PCT = 60;
export const REFRESH_WORDS = 0.2; // a reached chunk needs a refresh when more than 20 % of its words are due or below 8
export const REFRESH_LAST = 10; // a reached topic needs a refresh when its last 10 answers fall below …
export const REFRESH_PCT = 70; // … 70 %
export const BEHIND_DAYS = 7; // behind: more than a week behind the plan
export const AHEAD_DAYS = 14; // ahead: more than two weeks ahead
export const IDLE_DAYS = 7; // behind: 7 days without practice
export const MISSING_SHOWN = 100; // word ids listed as "not learnt yet" per milestone (all of them: a milestone has fewer words)
const DAY_MS = 86_400_000;
// work weights for `progressShare` (answers it takes, roughly like the generator's pace numbers)
const WEIGHT = { solid: 50, introduced: 15, lesson: 10, exam: 30, other: 1 };

// ---------- words of a chunk (§2.3) ----------
export const SOURCES_OF = { goethe: ['goethe-a1', 'goethe-a2', 'goethe-b1'], kurs: ['kurs'], both: null };
export const SEP = ' › ';
export function wordMatches(w, c) {
  if (w.level !== c.level) return false;
  const src = SOURCES_OF[c.sources];
  if (src && !(w.sources || []).some((s) => src.includes(s))) return false;
  if (!c.section) return true;
  return (w.topics || []).some((t) => {
    const [sec, lst] = String(t).split(SEP);
    return sec === c.section && (!c.lists || c.lists.includes(lst));
  });
}
const groupKey = (c) => `${c.level}|${c.section || '*'}|${(c.lists || []).join('+')}|${c.sources}`;

// Each word belongs to ONE milestone per part: the first one in the part's milestone list (the claim order, which the
// generator keeps). Parts of a split list share the list's words, sorted by id. Words added later join their chunk.
// → Map(milestoneId → [wordId])
export function chunkWords(subPlan, words) {
  const claimed = new Set();
  const groups = new Map();
  const out = new Map();
  for (const m of subPlan?.milestones || []) {
    const c = m.criterion;
    if (c?.kind !== 'words') continue;
    const key = groupKey(c);
    if (!groups.has(key)) {
      const pool = (words || []).filter((w) => !claimed.has(w.id) && wordMatches(w, c)).map((w) => w.id).sort();
      pool.forEach((id) => claimed.add(id));
      groups.set(key, pool);
    }
    const pool = groups.get(key);
    if (!c.part) out.set(m.id, pool);
    else out.set(m.id, pool.slice(Math.floor(((c.part.i - 1) * pool.length) / c.part.n), Math.floor((c.part.i * pool.length) / c.part.n)));
  }
  return out;
}

// ---------- words ----------
export const isLearnt = (rec) => Boolean(rec) && vScore(rec) >= LEARNT_FROM;
export const wordsNeeded = (size) => Math.ceil(CHUNK_REACHED * size);

// → { size, have, need, met, due, weak, missingIds }  (weak = not learnt now; due = learnt-looking words that are due)
export function wordProgress(ids, scores, now = Date.now()) {
  let have = 0;
  let due = 0;
  const missingIds = [];
  for (const id of ids) {
    const rec = scores?.[id];
    if (isLearnt(rec)) {
      have += 1;
      if (isDue(rec, now)) due += 1;
    } else if (missingIds.length < MISSING_SHOWN) missingIds.push(id);
  }
  const need = wordsNeeded(ids.length);
  const weak = ids.length - have;
  return { size: ids.length, have, need, met: ids.length > 0 && have >= need, due, weak, missingIds };
}

// ---------- grammar ----------
const daysOf = (recent) => new Set((recent || []).map((r) => Math.floor((Number(r[2]) || 0) / DAY_MS))).size;
export const lastPoints = (recent, n) => (recent || []).slice(-n).reduce((s, [ok, h]) => s + (ok ? (h ? 0.5 : 1) : 0), 0);

// → { n, pct, days, last, need, solid, introduced }
//   last/need: points in the last 20 answers / points needed ("16 of last 20 right · needs 16")
export function grammarProgress(stats, threshold) {
  const need = Math.ceil((threshold * SOLID_LAST) / 100);
  if (!stats) return { n: 0, pct: 0, days: 0, last: 0, need, solid: false, introduced: false };
  const days = daysOf(stats.recent);
  const last = lastPoints(stats.recent, SOLID_LAST);
  return {
    n: stats.n, pct: stats.pct, days, last, need,
    solid: stats.n >= SOLID_ANSWERS && days >= SOLID_DAYS && last >= need,
    introduced: stats.n >= INTRODUCED_ANSWERS && stats.pct >= INTRODUCED_PCT,
  };
}

// is a topic milestone met now? target 'solid' | 'introduced'
export function topicMet(stats, target, threshold) {
  const g = grammarProgress(stats, threshold);
  return target === 'introduced' ? g.introduced : g.solid;
}
// a reached topic needs a refresh when the last 10 answers are below 70 %
export const topicNeedsRefresh = (stats) => {
  const recent = (stats?.recent || []).slice(-REFRESH_LAST);
  return recent.length >= REFRESH_LAST && (lastPoints(recent, REFRESH_LAST) / REFRESH_LAST) * 100 < REFRESH_PCT;
};
// a situation lesson counts as done after 10 counted answers at 60 %
export const lessonDone = (stats) => Boolean(stats && stats.n >= LESSON_DONE_ANSWERS && stats.pct >= LESSON_DONE_PCT);

// ---------- one milestone ----------
// → { have, need, total, unit, met, refresh, weight, …details }. `met` = the rule is met right now (before latching).
export function measureMilestone(m, ctx) {
  const c = m.criterion;
  const { scores, grammarStats, now } = ctx;
  if (c.kind === 'words') {
    const ids = ctx.membership.get(m.id) || [];
    const w = wordProgress(ids, scores, now);
    return {
      have: w.have, need: w.need, total: w.size, unit: 'words', met: w.met, weight: Math.max(1, w.size),
      refresh: ids.length > 0 && (w.weak + w.due) > REFRESH_WORDS * ids.length ? { due: w.due, weak: w.weak } : null,
      missingIds: w.missingIds,
    };
  }
  if (c.kind === 'grammar') {
    const st = grammarStats?.[c.topicId];
    const g = grammarProgress(st, topicThreshold(curriculumEntry(c.topicId)));
    const solidGoal = c.target !== 'introduced';
    return solidGoal
      ? {
        have: g.last, need: g.need, total: SOLID_LAST, unit: 'answers', met: g.solid, weight: WEIGHT.solid,
        refresh: topicNeedsRefresh(st) ? { pct: Math.round((lastPoints(st.recent, REFRESH_LAST) / REFRESH_LAST) * 100) } : null,
        detail: { n: g.n, nNeed: SOLID_ANSWERS, days: g.days, daysNeed: SOLID_DAYS, pct: g.pct, introduced: g.introduced },
      }
      : {
        have: g.n, need: INTRODUCED_ANSWERS, total: INTRODUCED_ANSWERS, unit: 'answers', met: g.introduced, weight: WEIGHT.introduced,
        refresh: null, detail: { n: g.n, pct: g.pct, pctNeed: INTRODUCED_PCT },
      };
  }
  if (c.kind === 'lessons') {
    const done = c.lessonIds.filter((id) => lessonDone(grammarStats?.[id])).length;
    return { have: done, need: c.lessonIds.length, total: c.lessonIds.length, unit: 'lessons', met: done === c.lessonIds.length, weight: WEIGHT.lesson * c.lessonIds.length, refresh: null };
  }
  if (c.kind === 'exam') {
    // done outside the app: you tick it (PATCH /api/goals later); the app never decides this one
    return { have: 0, need: 1, total: 1, unit: c.part === 'mock' ? 'mock' : 'task', met: false, weight: WEIGHT.exam, refresh: null };
  }
  // placement / verbs: phase 2, not measured yet
  return { have: 0, need: 1, total: 1, unit: 'later', met: false, weight: WEIGHT.other, refresh: null };
}

// ---------- pace ----------
// Straight line between the milestone dates (redesign §4.3). `dated` = the part's open-or-reached milestones with a date.
//   behindDays  how many days ago the next unreached milestone was due (0 = not due yet)
//   aheadDays   when more milestones are reached than planned by today: days until the date this progress was planned for
function paceOf(dated, reachedIds, today) {
  if (!dated.length) return { behindDays: 0, aheadDays: 0, overdue: 0 };
  const sorted = [...dated].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const r = sorted.filter((m) => reachedIds.has(m.id)).length;
  const t = dayNum(today);
  const overdue = sorted.filter((m) => !reachedIds.has(m.id) && dayNum(m.date) < t).length;
  const behindDays = r < sorted.length ? Math.max(0, t - dayNum(sorted[r].date)) : 0;
  const aheadDays = r > 0 && r < sorted.length ? Math.max(0, dayNum(sorted[r - 1].date) - t) : 0;
  return { behindDays, aheadDays, overdue };
}

const lastPracticeOf = (scores, grammarStats) => {
  let last = 0;
  for (const rec of Object.values(scores || {})) last = Math.max(last, Number(rec?.last) || 0);
  for (const s of Object.values(grammarStats || {})) for (const r of s?.recent || []) last = Math.max(last, Number(r[2]) || 0);
  return last;
};

// ---------- the whole thing ----------
export function computePlans({ goals = [], words = [], scores = {}, grammarStats = {}, today, lastPractice = null } = {}) {
  const day = isDay(today) ? today : new Date().toISOString().slice(0, 10);
  const now = dayNum(day) * DAY_MS + DAY_MS - 1; // words that come back today are "due"
  const last = Number(lastPractice) || lastPracticeOf(scores, grammarStats);
  const plans = {};
  const newlyReached = {};
  for (const goal of goals) {
    if (goal?.version !== 2 || !Array.isArray(goal.subPlans)) continue;
    const milestones = {};
    const parts = {};
    const fresh = [];
    let weightAll = 0;
    let weightDone = 0;
    for (const part of goal.subPlans) {
      if (part.include === false) continue;
      const membership = part.kind === 'vocab' ? chunkWords(part, words) : new Map();
      const reachedIds = new Set();
      let total = 0;
      for (const m of part.milestones) {
        const skipped = m.status === 'skipped';
        const w = measureMilestone(m, { scores, grammarStats, membership, now });
        let reached = isReached(m);
        let reachedAt = m.reachedAt || null;
        if (!reached && !skipped && w.met) { // latch: from now on this stays reached
          reached = true;
          reachedAt = day;
          fresh.push(m.id);
        }
        const introduced = m.criterion.kind === 'grammar' && m.criterion.target !== 'introduced' && w.detail?.introduced === true;
        const state = skipped ? 'skipped' : reached ? (w.refresh ? 'refresh' : 'reached') : introduced ? 'introduced' : 'open';
        milestones[m.id] = {
          partId: part.id, date: m.date, state, reachedAt, alreadySolid: m.alreadySolid === true,
          have: w.have, need: w.need, total: w.total, unit: w.unit,
          refresh: reached ? w.refresh : null,
          ...(w.missingIds && !reached ? { missingIds: w.missingIds } : {}),
          ...(w.detail ? { detail: w.detail } : {}),
        };
        if (skipped) continue;
        total += 1;
        weightAll += w.weight;
        if (reached) {
          reachedIds.add(m.id);
          weightDone += w.weight;
        }
      }
      const live = part.milestones.filter((m) => m.status !== 'skipped');
      const open = live.filter((m) => !reachedIds.has(m.id));
      const dated = live.filter((m) => m.date).map((m) => ({ id: m.id, date: m.date, order: m.order ?? 0 }));
      const pace = paceOf(dated, reachedIds, day);
      const byOrder = [...open].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      parts[part.id] = {
        kind: part.kind, reached: reachedIds.size, total, nextId: byOrder[0]?.id ?? null,
        behindDays: pace.behindDays, aheadDays: pace.aheadDays, overdue: pace.overdue,
      };
    }
    // ----- the goal -----
    const list = Object.values(parts);
    const reached = list.reduce((s, p) => s + p.reached, 0);
    const total = list.reduce((s, p) => s + p.total, 0);
    const done = total > 0 && reached === total;
    const started = dayNum(day) >= dayNum(goal.startDate);
    const idleSince = Math.max(last, dayNum(goal.startDate) * DAY_MS);
    const idle = started && dayNum(day) - Math.floor(idleSince / DAY_MS) >= IDLE_DAYS;
    const behind = list.some((p) => p.behindDays > BEHIND_DAYS || p.overdue > 0) || (idle && !done);
    const unfinished = list.filter((p) => p.reached < p.total);
    let status = 'ontrack';
    if (done) status = 'done';
    else if (dayNum(day) > dayNum(goal.endDate)) status = 'ended';
    else if (behind) status = 'behind';
    else if (unfinished.length && unfinished.every((p) => p.aheadDays > AHEAD_DAYS || p.total === 0)) status = 'ahead';
    // today's milestone: the part that is most behind first, then plan order
    const order = goal.subPlans.filter((p) => parts[p.id]?.nextId);
    const worst = [...order].sort((a, b) => parts[b.id].behindDays - parts[a.id].behindDays)[0];
    const nextMilestoneId = (parts[worst?.id]?.behindDays > 0 ? parts[worst.id] : parts[order[0]?.id])?.nextId ?? null;
    plans[goal.id] = {
      status, progressShare: weightAll ? weightDone / weightAll : 0, nextMilestoneId, reached, total, parts, milestones,
    };
    if (fresh.length) newlyReached[goal.id] = fresh;
  }
  return { plans, newlyReached };
}

// Apply newlyReached to a goal (a copy): reachedAt is set ONLY where it is still empty, so doing this twice is harmless.
export function applyReached(goal, ids, day) {
  const set = new Set(ids || []);
  if (!goal || !set.size || !isDay(day)) return goal;
  return {
    ...goal,
    subPlans: (goal.subPlans || []).map((p) => ({
      ...p, milestones: (p.milestones || []).map((m) => (set.has(m.id) && !m.reachedAt ? { ...m, reachedAt: day } : m)),
    })),
  };
}
