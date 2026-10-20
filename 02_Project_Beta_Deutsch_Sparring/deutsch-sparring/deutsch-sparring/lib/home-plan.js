// What the Home page shows of a PLAN (review R13, redesign §3.2, §3.3, §4.6 and "Coach decisions" points 6 and 7).
// Pure functions, no React, no fs: used by the server (homeExtras → /api/stats), by components/Home.js and by the checks.
//
// Zoom (point 6): three levels over the same data
//   overview   each goal one line, its parts as segments, with a "Today" marker
//   part       the milestones of one part, with dates
//   milestone  one milestone: the missing words, the last 20 answers on the topic, "Practise this"
// The level, goal, part and milestone are kept in the browser (cleanZoom checks them against the real goals after a reload).
import { dayNum } from './goals.js';
import { allMilestones, studentTickable, PLAN_VERSION } from './plan.js';
import { milestoneTitle, partTitle, sessionForMilestone } from './plan-templates.js';
import { CURRICULUM } from './curriculum.js';
import { SEP } from './plan-progress.js';

export const ZOOM_LEVELS = ['overview', 'part', 'milestone'];
export const RECENT_SHOWN = 20; // "last 20 answers on the topic"
export const OTHER_NEXT = 3; // "Other milestone" lists the next 3 open milestones
export const SOON_DAYS = 14; // "in 5 days" is added to a date within two weeks
export const isPlanGoal = (g) => Number(g?.version) === PLAN_VERSION && Array.isArray(g.subPlans);

// ---------- one milestone as the screen needs it ----------
// plan = plans[goalId] from /api/stats (lib/plan-progress.js)
// state: 'skipped' | 'solid' | 'done' (an exam ticked by the student) | 'refresh' | 'reached' | 'late' | 'next' | 'progress' | 'coming'
export function milestoneView(goal, part, m, plan, today) {
  const info = plan?.milestones?.[m.id] || null;
  const isNext = plan?.parts?.[part.id]?.nextId === m.id;
  const reachedAt = info?.reachedAt || m.reachedAt || null;
  const daysLate = m.date && !reachedAt && dayNum(m.date) < dayNum(today) ? dayNum(today) - dayNum(m.date) : 0;
  const inDays = m.date ? dayNum(m.date) - dayNum(today) : null;
  let state = 'coming';
  if (m.status === 'skipped') state = 'skipped';
  else if (reachedAt) state = m.alreadySolid ? 'solid' : m.criterion.kind === 'exam' ? 'done' : info?.state === 'refresh' ? 'refresh' : 'reached';
  else if (daysLate > 0) state = 'late';
  else if (isNext) state = 'next';
  else if (info && info.have > 0) state = 'progress';
  return {
    id: m.id, m, part, title: milestoneTitle(m.criterion), state, isNext, date: m.date || null, inDays, daysLate, reachedAt,
    have: info?.have ?? 0, need: info?.need ?? 0, total: info?.total ?? 0, unit: info?.unit || 'words',
    refresh: info?.refresh || null, detail: info?.detail || null, missingIds: info?.missingIds || [],
    exam: m.criterion.kind === 'exam', tickable: studentTickable(m), result: m.result || null,
  };
}

const FINISHED = ['reached', 'refresh', 'solid', 'done', 'skipped'];

// the milestones of a part in plan order, each "coming" one with what it waits for ("Starts after …")
export function partView(goal, partId, plan, today) {
  const part = goal?.subPlans?.find((p) => p.id === partId);
  if (!part) return null;
  const items = [...part.milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((m) => milestoneView(goal, part, m, plan, today));
  let before = null;
  for (const it of items) {
    if (it.state === 'coming' && before) it.startsAfter = before.title;
    if (!FINISHED.includes(it.state)) before = it;
  }
  const info = plan?.parts?.[partId] || { reached: 0, total: 0 };
  return { part, title: partTitle(part), items, reached: info.reached, total: info.total, behindDays: info.behindDays || 0 };
}

// ---------- level 1: the overview ----------
// One row per plan goal; every part is a segment as wide as its milestones are many. `reached` fills it; `planned` is the
// "Today" marker inside the segment: how many milestones should be reached by today.
export function overviewRows(goals, plans, today) {
  return (goals || []).filter(isPlanGoal).map((goal) => {
    const plan = plans?.[goal.id] || null;
    const parts = goal.subPlans.filter((p) => p.include !== false).map((part) => {
      const live = part.milestones.filter((m) => m.status !== 'skipped');
      const info = plan?.parts?.[part.id];
      const reached = info?.reached ?? live.filter((m) => m.reachedAt).length;
      const planned = live.filter((m) => m.date && dayNum(m.date) <= dayNum(today)).length;
      return { id: part.id, title: partTitle(part), kind: part.kind, total: live.length, reached, planned, late: info?.overdue || 0, behindDays: info?.behindDays || 0 };
    }).filter((p) => p.total > 0);
    return { goal, plan, status: plan?.status || 'ontrack', parts };
  });
}

// ---------- the zoom state (kept in the browser) ----------
// → a clean { level, goalId, partId, milestoneId }; anything that no longer exists falls back one level
export function cleanZoom(raw, goals) {
  const out = { level: 'overview', goalId: null, partId: null, milestoneId: null };
  if (!raw || typeof raw !== 'object' || !ZOOM_LEVELS.includes(raw.level) || raw.level === 'overview') return out;
  const goal = (goals || []).filter(isPlanGoal).find((g) => g.id === raw.goalId);
  if (!goal) return out;
  const part = goal.subPlans.find((p) => p.id === raw.partId && p.include !== false);
  if (!part) return out;
  if (raw.level === 'part') return { level: 'part', goalId: goal.id, partId: part.id, milestoneId: null };
  const m = part.milestones.find((x) => x.id === raw.milestoneId);
  return m ? { level: 'milestone', goalId: goal.id, partId: part.id, milestoneId: m.id } : { level: 'part', goalId: goal.id, partId: part.id, milestoneId: null };
}

// ---------- Next up (§4.6, point 7) ----------
// The goal that is most behind first (else the first goal that is not finished); in it the milestone `nextMilestoneId`, then
// the other open milestones by part, date and order. Milestones done outside the app (mock exams) are skipped: you cannot
// practise them. → { goalId, milestoneId, others: [milestoneId × 3] } or null
export function nextUp(goals, plans, today, ctx = {}) {
  const live = (goals || []).filter((g) => isPlanGoal(g) && plans?.[g.id] && !['done', 'ended'].includes(plans[g.id].status));
  if (!live.length) return null;
  const worst = (g) => Math.max(0, ...Object.values(plans[g.id].parts).map((p) => p.behindDays || 0));
  const goal = [...live].sort((a, b) => (plans[b.id].status === 'behind') - (plans[a.id].status === 'behind') || worst(b) - worst(a))[0];
  const plan = plans[goal.id];
  const open = allMilestones(goal).filter(({ m, part }) => part.include !== false && m.status !== 'skipped' && !m.reachedAt);
  const byId = new Map(open.map((x) => [x.m.id, x]));
  const ordered = [];
  if (byId.has(plan.nextMilestoneId)) ordered.push(byId.get(plan.nextMilestoneId));
  const rest = open.filter((x) => x.m.id !== plan.nextMilestoneId)
    .sort((a, b) => (plan.parts[b.part.id]?.behindDays || 0) - (plan.parts[a.part.id]?.behindDays || 0)
      || (a.m.date || '9999').localeCompare(b.m.date || '9999') || (a.m.order ?? 0) - (b.m.order ?? 0));
  ordered.push(...rest);
  const doable = ordered.filter(({ m }) => {
    const s = sessionForMilestone(m, goal, ctx);
    return s && !s.outside;
  });
  if (!doable.length) return null;
  return { goalId: goal.id, milestoneId: doable[0].m.id, others: doable.slice(1, 1 + OTHER_NEXT).map((x) => x.m.id) };
}

// ---------- what the server adds to /api/stats (lib/home-data.js) ----------
// ctx = { grammarStats (full, with `recent`), wordLabel(id) → text }
//   nextUp    see above
//   sessions  { milestoneId: session settings } for every open milestone you can practise (the word pool is left out)
//   missing   { wordId: "der Schrank – wardrobe" } for the words listed as not learnt yet
//   recent    { topicId: last 20 answers [[ok, hinted, t], …] } for the grammar topics and lessons of the plan
export function homeExtras(goals, plans, today, ctx = {}) {
  const sessions = {};
  const missing = {};
  const recent = {};
  for (const goal of (goals || []).filter(isPlanGoal)) {
    const plan = plans?.[goal.id];
    if (!plan) continue;
    for (const { m, part } of allMilestones(goal)) {
      if (part.include === false || m.status === 'skipped') continue;
      const info = plan.milestones[m.id];
      const c = m.criterion;
      for (const id of info?.missingIds || []) if (!missing[id] && ctx.wordLabel) missing[id] = ctx.wordLabel(id);
      const topics = c.kind === 'grammar' ? [c.topicId] : c.kind === 'lessons' ? c.lessonIds : c.kind === 'exam' && c.lessonId ? [c.lessonId] : [];
      for (const id of topics) if (!recent[id] && ctx.grammarStats?.[id]?.recent) recent[id] = ctx.grammarStats[id].recent.slice(-RECENT_SHOWN);
      const s = sessionForMilestone(m, goal, { grammarStats: ctx.grammarStats });
      if (s && !s.outside) {
        const { pool: _pool, ...rest } = s;
        sessions[m.id] = rest;
      }
    }
  }
  return { nextUp: nextUp(goals, plans, today, { grammarStats: ctx.grammarStats }), sessions, missing, recent };
}

// ---------- "Practise this" → the setup screen (always free afterwards) ----------
// session = what sessionForMilestone returned; topics = the topic list of the app ({ id, type, parent })
// → the part of the setup form to fill in (merge it into the remembered form), or null
export function setupFromSession(s, topics = []) {
  if (!s || s.outside) return null;
  const patch = { kind: s.kind, difficulty: s.difficulty, questions: s.questions };
  if (s.level) patch.level = s.level;
  if (s.kind === 'vocab') {
    if (s.source) patch.source = s.source;
    const topic = s.topicId && topics.find((x) => x.id === s.topicId);
    patch.section = topic ? topic.parent || topic.id : null;
    patch.list = topic && topic.parent ? topic.id : null;
  } else {
    const topic = topics.find((x) => x.id === s.topicId);
    if (!topic) return null;
    patch.grammarTopic = topic.id;
  }
  return patch;
}

// ---------- ticking an exam milestone done (the only thing a student can tick) ----------
// result: optional points { lesen, hoeren, schreiben, sprechen } (0–100). → a new goal, or null when this is not an exam milestone
export function tickExam(goal, milestoneId, day, result = null) {
  if (!isPlanGoal(goal)) return null;
  const hit = allMilestones(goal).find(({ m }) => m.id === milestoneId);
  if (!hit || !studentTickable(hit.m)) return null;
  const pts = {};
  for (const k of ['lesen', 'hoeren', 'schreiben', 'sprechen']) {
    const raw = result?.[k];
    if (raw === '' || raw == null) continue;
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 0 && n <= 100) pts[k] = n;
  }
  return {
    ...goal,
    subPlans: goal.subPlans.map((p) => ({
      ...p,
      milestones: p.milestones.map((m) => {
        if (m.id !== milestoneId) return m;
        const next = { ...m, reachedAt: m.reachedAt || day };
        if (Object.keys(pts).length && m.criterion.part === 'mock') next.result = pts;
        return next;
      }),
    })),
  };
}

// ---------- strengths & gaps → their milestone ("Milestone: …" or "Not in your plan") ----------
// item = a row of /api/stats strengths/gaps: { kind: 'rule'|'list', label }
export function milestoneForItem(item, goals) {
  const plans = (goals || []).filter(isPlanGoal);
  const found = (goal, part, m) => ({ goal, part, m, title: milestoneTitle(m.criterion), partTitle: partTitle(part) });
  if (item.kind === 'list') {
    const [section, list] = String(item.label).split(SEP);
    for (const goal of plans) {
      for (const { m, part } of allMilestones(goal)) {
        const c = m.criterion;
        if (part.include !== false && m.status !== 'skipped' && c.kind === 'words' && c.section === section && (!c.lists || c.lists.includes(list))) return found(goal, part, m);
      }
    }
    return null;
  }
  const ids = new Set(CURRICULUM.filter((e) => e.ruleNames.includes(item.label)).map((e) => e.id));
  for (const goal of plans) {
    for (const { m, part } of allMilestones(goal)) {
      if (part.include !== false && m.status !== 'skipped' && m.criterion.kind === 'grammar' && ids.has(m.criterion.topicId)) return found(goal, part, m);
    }
  }
  return null;
}
