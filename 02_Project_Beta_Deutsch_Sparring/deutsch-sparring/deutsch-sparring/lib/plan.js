// The shape of a goal's PLAN (review R10, redesign §4.1): goal → parts (sub-plans) → milestones.
// Pure functions, no React, no fs: used by the server (/api/plan, /api/goals), the browser later (Home, R13) and the checks.
//
// A milestone stores only its CRITERION (what must be reached), never a title: titles are always made by the app
// from the criterion (lib/plan-templates.js), so the Coach can never write a name (Coach decisions, point 1).
// Dates are plain days like "2026-11-30". A reached milestone keeps `reachedAt` for good ("latching", R11).
//
// goal = { id, version: 2, title (made from the template), template, level, startLevel, startDate, endDate, isExam,
//          options: { sources, section, list, topicIds }, pace: { minutesPerDay },
//          subPlans: [{ id, kind, level, order, include, milestones: [{ id, date, order, criterion, status,
//                       reachedAt, alreadySolid, origin, result?, note? }] }] }
import { isDay, dayNum, cleanGoalId, GOAL_LEVELS } from './goals.js';
import { isCurriculumId } from './curriculum.js';

export const PLAN_VERSION = 2;
// The kinds of goal the Coach can choose (lib/plan-templates.js has their names and rules). No "Build my own".
export const TEMPLATE_IDS = ['exam', 'vocab', 'grammar', 'wordtopic', 'topic', 'kurs'];
// Part kinds. 'manual' is gone (Coach decisions point 1, D6); 'check' is the placement check (phase 2, D1).
export const PART_KINDS = ['vocab', 'grammar', 'exam', 'check'];
export const CRITERION_KINDS = ['words', 'grammar', 'lessons', 'exam', 'placement', 'verbs'];
export const EXAM_PARTS = ['mock', 'lesen', 'hoeren', 'schreiben', 'sprechen'];
export const SOURCE_CHOICES = ['goethe', 'kurs', 'both'];
export const MINUTES_PER_DAY = [15, 20, 30, 45];
export const DEFAULT_MINUTES = 20;
export const ORIGINS = ['template', 'coach', 'student'];
export const MAX_PARTS = 8;
export const MAX_PART_MILESTONES = 40; // replaces MAX_MILESTONES = 12 of the old goals
export const MAX_SPAN_DAYS = 3 * 366;
export const MAX_LABEL = 40;
export const CUTS = ['kursWords', 'receptiveIntroduced']; // what a plan can leave out when it does not fit
export const MAX_LESSONS_PER_MILESTONE = 3;

const text = (x, max) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const LESSON_ID = /^lektion-(a1|a2|b1)-\d{2}-[a-z0-9-]{1,40}$/;
const int = (x, lo, hi) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

// ---------- criteria ----------
// → a clean criterion, or null when it is not one the app knows. Never a free text field.
export function cleanCriterion(raw) {
  if (!isObj(raw) || !CRITERION_KINDS.includes(raw.kind)) return null;
  switch (raw.kind) {
    case 'words': {
      if (!GOAL_LEVELS.includes(raw.level)) return null;
      const section = text(raw.section, 120) || null;
      const lists = section && Array.isArray(raw.lists) ? [...new Set(raw.lists.map((l) => text(l, 120)).filter(Boolean))].slice(0, 12) : [];
      const n = int(raw.part?.n, 2, 20);
      const i = n ? int(raw.part?.i, 1, n) : null;
      return {
        kind: 'words', level: raw.level, section, lists: lists.length ? lists : null,
        part: n && i ? { i, n } : null,
        sources: SOURCE_CHOICES.includes(raw.sources) ? raw.sources : 'both',
        optional: raw.optional === true,
      };
    }
    case 'grammar':
      if (!isCurriculumId(raw.topicId)) return null;
      return { kind: 'grammar', topicId: raw.topicId, target: raw.target === 'introduced' ? 'introduced' : 'solid' };
    case 'lessons': {
      if (!GOAL_LEVELS.includes(raw.level) || !Array.isArray(raw.lessonIds)) return null;
      const ids = [...new Set(raw.lessonIds.filter((x) => typeof x === 'string' && LESSON_ID.test(x) && x.split('-')[1] === raw.level.toLowerCase()))];
      return ids.length && ids.length <= MAX_LESSONS_PER_MILESTONE ? { kind: 'lessons', level: raw.level, lessonIds: ids } : null;
    }
    case 'exam': {
      if (!EXAM_PARTS.includes(raw.part)) return null;
      const n = int(raw.n, 1, 40);
      if (!n) return null;
      const out = { kind: 'exam', part: raw.part, n };
      if (typeof raw.lessonId === 'string' && LESSON_ID.test(raw.lessonId)) out.lessonId = raw.lessonId;
      return out;
    }
    case 'placement':
      return GOAL_LEVELS.includes(raw.level) ? { kind: 'placement', level: raw.level, sources: SOURCE_CHOICES.includes(raw.sources) ? raw.sources : 'both' } : null;
    case 'verbs': {
      const levels = Array.isArray(raw.levels) ? GOAL_LEVELS.filter((l) => raw.levels.includes(l)) : [];
      const count = int(raw.count, 1, 500);
      if (!levels.length || !count) return null;
      return { kind: 'verbs', levels, aux: ['sein', 'haben'].includes(raw.aux) ? raw.aux : null, count };
    }
    default:
      return null;
  }
}

// One key per criterion: the same content always gives the same key (and so the same milestone id).
export function criterionKey(c) {
  switch (c.kind) {
    case 'words': return `w|${c.level}|${c.section || '*'}|${(c.lists || []).join('+')}|${c.part ? `${c.part.i}/${c.part.n}` : ''}|${c.sources}`;
    case 'grammar': return `g|${c.topicId}`;
    case 'lessons': return `l|${c.lessonIds.join('+')}`;
    case 'exam': return `e|${c.part}|${c.n}`;
    case 'placement': return `p|${c.level}|${c.sources}`;
    case 'verbs': return `v|${c.levels.join('+')}|${c.aux || ''}`;
    default: return 'x';
  }
}

// a short stable id from a text (FNV-1a, 32 bit) → "m" + base 36
export function stableId(prefix, key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}${h.toString(36)}`;
}
export const milestoneId = (c) => stableId('m', criterionKey(c));

// ---------- milestones, parts, goals ----------
export const isReached = (m) => Boolean(m?.reachedAt);
// the student may tick only exam milestones (mock exams, Schreiben/Sprechen done outside the app)
export const studentTickable = (m) => m?.criterion?.kind === 'exam';

export function cleanPlanMilestone(raw, goal) {
  if (!isObj(raw)) return null;
  const criterion = cleanCriterion(raw.criterion);
  const id = cleanGoalId(raw.id);
  if (!criterion || !id) return null;
  const inside = (d) => isDay(d) && dayNum(d) >= dayNum(goal.startDate) && dayNum(d) <= dayNum(goal.endDate);
  const date = raw.date == null ? null : inside(raw.date) ? raw.date : undefined;
  if (date === undefined) return null; // a date outside the goal's time frame
  const m = {
    id, date, order: int(raw.order, 0, 999) ?? 0, criterion,
    status: raw.status === 'skipped' ? 'skipped' : 'open',
    reachedAt: isDay(raw.reachedAt) ? raw.reachedAt : null,
    alreadySolid: raw.alreadySolid === true,
    origin: ORIGINS.includes(raw.origin) ? raw.origin : 'template',
  };
  if (criterion.kind === 'exam' && criterion.part === 'mock' && isObj(raw.result)) {
    const result = {};
    for (const k of ['lesen', 'hoeren', 'schreiben', 'sprechen']) {
      const p = int(raw.result[k], 0, 100);
      if (p !== null) result[k] = p;
    }
    if (Object.keys(result).length) m.result = result;
  }
  const note = text(raw.note, 200);
  if (note) m.note = note;
  return m;
}

export function cleanSubPlan(raw, goal) {
  if (!isObj(raw) || !PART_KINDS.includes(raw.kind)) return null;
  const id = cleanGoalId(raw.id);
  if (!id) return null;
  const seen = new Set();
  const milestones = (Array.isArray(raw.milestones) ? raw.milestones : []).slice(0, MAX_PART_MILESTONES)
    .map((m) => cleanPlanMilestone(m, goal))
    .filter((m) => m && !seen.has(m.id) && seen.add(m.id));
  return {
    id, kind: raw.kind, level: GOAL_LEVELS.includes(raw.level) ? raw.level : null,
    order: int(raw.order, 0, 99) ?? 0, include: raw.include !== false, milestones,
  };
}

// Anything (browser, Coach, database) → a clean v2 goal WITHOUT its title (plan-templates.cleanPlan adds it), or null.
export function cleanPlanGoal(raw) {
  if (!isObj(raw) || Number(raw.version) !== PLAN_VERSION) return null;
  const id = cleanGoalId(raw.id);
  if (!id || !TEMPLATE_IDS.includes(raw.template) || !GOAL_LEVELS.includes(raw.level)) return null;
  if (!isDay(raw.startDate) || !isDay(raw.endDate)) return null;
  const span = dayNum(raw.endDate) - dayNum(raw.startDate);
  if (span < 1 || span > MAX_SPAN_DAYS) return null;
  const o = isObj(raw.options) ? raw.options : {};
  const minutes = Number(raw.pace?.minutesPerDay);
  const goal = {
    id, version: PLAN_VERSION, template: raw.template, level: raw.level,
    startLevel: GOAL_LEVELS.includes(raw.startLevel) && GOAL_LEVELS.indexOf(raw.startLevel) <= GOAL_LEVELS.indexOf(raw.level) ? raw.startLevel : raw.level,
    startDate: raw.startDate, endDate: raw.endDate, isExam: raw.template === 'exam',
    options: {
      sources: SOURCE_CHOICES.includes(o.sources) ? o.sources : 'both',
      section: text(o.section, 120) || null,
      list: text(o.section, 120) ? text(o.list, 120) || null : null,
      topicIds: (Array.isArray(o.topicIds) ? o.topicIds : []).filter(isCurriculumId).slice(0, 12),
    },
    pace: { minutesPerDay: MINUTES_PER_DAY.includes(minutes) ? minutes : DEFAULT_MINUTES },
  };
  // the student's own name for the goal (R12): the Coach may set it, but only with words the student typed (lib/coach-goal.js)
  const label = text(raw.label, MAX_LABEL);
  if (label) goal.label = label;
  const seen = new Set();
  const ids = new Set();
  goal.subPlans = (Array.isArray(raw.subPlans) ? raw.subPlans : []).slice(0, MAX_PARTS)
    .map((s) => cleanSubPlan(s, goal))
    .filter((s) => s && !seen.has(s.id) && seen.add(s.id))
    .map((s) => ({ ...s, milestones: s.milestones.filter((m) => !ids.has(m.id) && ids.add(m.id)) })); // ids unique in the goal
  return goal;
}

// All milestones of a goal, with their part: [{ m, part }]
export const allMilestones = (goal) => (goal?.subPlans || []).flatMap((part) => part.milestones.map((m) => ({ m, part })));

// What the old Home code (lib/home-stats.js, lib/goals.js timeline) needs from a goal, until R13 moves it to parts.
const LEGACY_TYPE = { exam: 'exam', vocab: 'vocab', wordtopic: 'vocab', kurs: 'vocab', grammar: 'grammar', topic: 'grammar' };
export const withLegacyFields = (goal) => ({
  ...goal, type: LEGACY_TYPE[goal.template] || 'vocab',
  scope: { section: goal.options?.section || null, list: goal.options?.list || null, rules: [] },
  milestones: [],
});
