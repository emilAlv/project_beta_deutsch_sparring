// The PLAN GENERATOR (review R10, redesign §2 and §4.2): fixed rules only, no AI call (so MOCK=1 works).
// It is the guardrail of the Coach (Coach decisions, point 1): the Coach only chooses a template and its numbers
// ({ template, endDate, minutesPerDay, startLevel, options }); every goal, part and milestone NAME comes from here.
//
// Pure functions, no React, no fs: the words come in through `ctx` (the server passes lib/words.js getWords() and
// listSections()), so the same code runs in /api/plan, in the Coach (R12), in the browser (titles) and in the checks.
//
//   previewPlan(request, ctx)        → { ok, goal, tight, summary, parts } – what the Coach / preview shows (stores nothing)
//   buildPlan(draft, ctx)            → { goal, tight }
//   replan(goal, ctx, today, levers) → { ok, goal, changes, tight } – levers: minutesPerDay, endDate (not exam), focus, cut
//   sessionForMilestone(m, goal, ctx)→ the session settings for "Practise this"
//   chunkWords(subPlan, words)       → Map(milestoneId → [word ids]) – the words of each word milestone, worked out live
//   cleanPlan(raw)                   → a clean v2 goal with its title made by the template, or null
//   goalTitle / partTitle / milestoneTitle – the only place names are made
//
// ctx = { words, sections, scores, grammarStats, today }
//   words         [{ id, level, sources, topics: ["Section › List"] }]   (lib/words.js getWords())
//   sections      [{ name, lists: [{ name }] }] in the order of the Word file (lib/words.js listSections()); optional
//   scores        { wordId: record } (lib/scores.js)                    – optional
//   grammarStats  { topicId: { n, points, pct, recent: [[ok, hinted, t]] } } (lib/grammar-stats.js) – optional
//   today         "YYYY-MM-DD"
import { addDays, dayNum, dayOf, isDay, newGoalId, cleanGoalId, GOAL_LEVELS } from './goals.js';
import { curriculumEntry, curriculumByLevel, planOrder, shortTitle, topicThreshold, CURRICULUM } from './curriculum.js';
import { mScore, aScore, hasScore } from './scores.js';
import {
  LEARNT_FROM, CHUNK_REACHED, SOLID_ANSWERS, INTRODUCED_ANSWERS, lessonDone, topicMet, lastPoints, isLearnt as learnt,
  wordMatches, chunkWords, SEP,
} from './plan-progress.js';
import {
  PLAN_VERSION, TEMPLATE_IDS, CUTS, MINUTES_PER_DAY, DEFAULT_MINUTES, MAX_PARTS, MAX_PART_MILESTONES, MAX_SPAN_DAYS,
  cleanPlanGoal, milestoneId, isReached, allMilestones,
} from './plan.js';

// ---------- the numbers (redesign §2.3, §2.4, §2.6) – change the rules here, nowhere else ----------
export const DAYS_PER_WEEK = 6; // practice days the plan assumes
export const BUFFER_DAYS = 14; // an exam plan finishes 2 weeks before the exam (review only)
export const SHARE = { vocab: 0.5, grammar: 0.35, exam: 0.15 }; // weekly budget; the exam share only once the exam part has started
export const B1_WORD_SHARE = 0.4; // "B1 words start early": while A1/A2 word gaps remain, B1 words get this share of the weekly word time (the lower levels keep 60 %)
export const MIN_FLASHCARD = 0.5; // minutes per word answer
export const MIN_SENTENCE = 1.5; // minutes per grammar answer
export const ANSWERS_NEW_WORD = 6; // a new word to "learnt"
export const ANSWERS_SEEN_WORD = 4; // a word of a level below the start level, never asked in the app yet
export const KEEP_ANSWERS = 0.1; // answers per learnt word per week to keep it
export const ANSWERS_TOPIC = 50; // a new grammar topic to "solid"
export const ANSWERS_REVIEW_TOPIC = 20; // a topic of a level below the start level (met before)
export const ANSWERS_INTRODUCED = 15; // a topic that only has to reach "introduced"
export const ANSWERS_LESSON = 10; // a situation lesson to "done"
export const NEW_WORDS_PER_WEEK = { 15: 15, 20: 20, 30: 30, 45: 40 };
export const NEW_TOPICS_PER_WEEK = 1; // never two new topics reaching solid in the same week
export const REVIEW_TOPICS_PER_WEEK = 2;
export const FOCUS_EXTRA = 0.15; // the "focus" lever moves this share of the week to the part that is behind
export const MAX_WEEKS = 520;
// words (§2.3) – the measuring rules (90 %, learnt from 8, solid, introduced …) live in lib/plan-progress.js
export const CHUNK_MAX = 40;
export const CHUNK_MIN = 8;
export const CHUNK_PART = 25;
export const LESSONS_PER_MILESTONE = 2;
const DAY_MS = 86_400_000;

// ---------- templates ----------
export const TEMPLATES = {
  exam: { name: (g) => `Pass the Goethe ${g.level} exam`, months: 6 },
  vocab: { name: (g) => `${g.level} vocabulary`, weeks: 6 },
  grammar: { name: (g) => `${g.level} grammar`, weeks: 6 },
  wordtopic: { name: (g) => `${g.options.section}${g.options.list ? ` › ${g.options.list}` : ''} (up to ${g.level})`, weeks: 6 },
  topic: {
    name: (g) => (g.options.topicIds.length === 1 ? shortTitle(curriculumEntry(g.options.topicIds[0])) : `${g.options.topicIds.length} grammar topics (${g.level})`),
    weeks: 6,
  },
  kurs: { name: (g) => `Course words (up to ${g.level})`, weeks: 6 },
};

// Section order inside a level (§2.3: daily-life needs first, the Goethe themes). Unknown sections come after.
export const SECTION_ORDER = [
  'Person & identity', 'Family & relationships', 'Time & calendar', 'Food & drink', 'Home & living',
  'Clothes, shopping & personal items', 'Transport & travel', 'Health, body & wellbeing', 'Communication & services',
  'Work, business & education', 'Leisure, culture & nature',
];
// verbs, function words and adjectives carry the grammar: their chunks are spread over the weeks, not left to the end
export const BIG_SECTION = 'Verbs, adjectives & function words';

// The 48 situation lessons (content/lektion-<level>-NN-*.md): short names for titles, and the curriculum topics a
// lesson builds on (it is planned after them). scripts/check-plan.mjs checks this list against the files.
export const LESSONS = {
  'lektion-a1-01-vorstellen': ['Sich vorstellen'],
  'lektion-a1-02-fragen-und-verstehen': ['Fragen stellen'],
  'lektion-a1-03-alltag-praesens': ['Alltag', 'g-a1-praesens'],
  'lektion-a1-04-artikel-negation': ['Dinge benennen', 'g-a1-artikel-plural'],
  'lektion-a1-05-einkaufen': ['Einkaufen'],
  'lektion-a1-06-modalverben': ['Wünsche', 'g-a1-modalverben'],
  'lektion-a1-07-zeit-termine': ['Termine', 'g-a1-zeit-ort'],
  'lektion-a1-08-unterwegs': ['Unterwegs'],
  'lektion-a1-09-familie-besitz': ['Familie', 'g-a1-possessivartikel'],
  'lektion-a1-10-tagesablauf-trennbar': ['Tagesablauf', 'g-a1-trennbare-verben'],
  'lektion-a1-11-essen-bestellen': ['Im Restaurant'],
  'lektion-a1-12-kurze-nachrichten': ['Kurze Nachrichten'],
  'lektion-a1-13-formulare': ['Formulare'],
  'lektion-a1-14-wetter-kleidung': ['Wetter und Kleidung'],
  'lektion-a1-15-oeffnungszeiten': ['Öffnungszeiten'],
  'lektion-a1-16-sprachprobleme': ['Verständigung'],
  'lektion-a2-01-perfekt': ['Erlebnisse', 'g-a2-perfekt-partizip'],
  'lektion-a2-02-gruende': ['Gründe', 'g-a2-weil'],
  'lektion-a2-03-dass-meinen': ['Meinungen', 'g-a2-dass-wenn'],
  'lektion-a2-04-vergleiche': ['Vergleiche', 'g-a2-komparativ-superlativ'],
  'lektion-a2-05-gesundheit': ['Beim Arzt'],
  'lektion-a2-06-wohnung': ['Wohnung'],
  'lektion-a2-07-verabreden': ['Verabreden'],
  'lektion-a2-08-verkehr-reisen': ['Reisen'],
  'lektion-a2-09-arbeit': ['Arbeit'],
  'lektion-a2-10-reflexiv': ['Erfahrungen', 'g-a2-reflexive-verben'],
  'lektion-a2-11-beschreiben': ['Beschreiben', 'g-a2-adjektivendungen'],
  'lektion-a2-12-nachrichten': ['Nachrichten'],
  'lektion-a2-13-gemeinde': ['Gemeinde'],
  'lektion-a2-14-reklamation': ['Reklamation'],
  'lektion-a2-15-nachbarschaft': ['Nachbarschaft', 'g-a2-konjunktiv2-hoeflich'],
  'lektion-a2-16-weiterbildung': ['Weiterbildung'],
  'lektion-b1-01-erzaehlen': ['Erzählen', 'g-b1-praeteritum'],
  'lektion-b1-02-argumentieren': ['Argumentieren'],
  'lektion-b1-03-wenn-als': ['Wenn und als', 'g-b1-nebensaetze'],
  'lektion-b1-04-relativsaetze': ['Genauer beschreiben', 'g-b1-relativsaetze'],
  'lektion-b1-05-hoefliche-anliegen': ['Höfliche Anliegen', 'g-b1-konjunktiv2'],
  'lektion-b1-06-probleme-loesen': ['Probleme lösen'],
  'lektion-b1-07-passiv': ['Vorgänge', 'g-b1-passiv'],
  'lektion-b1-08-infinitiv-zu': ['Absichten', 'g-b1-zu-infinitiv'],
  'lektion-b1-09-medien': ['Medien'],
  'lektion-b1-10-zukunft': ['Zukunft'],
  'lektion-b1-11-arbeit-bewerbung': ['Bewerbung'],
  'lektion-b1-12-zusammenarbeit': ['Zusammenarbeit'],
  'lektion-b1-13-formeller-brief': ['Formeller Brief'],
  'lektion-b1-14-alltag-finanzen': ['Geld und Verträge'],
  'lektion-b1-15-integration-kultur': ['Zusammenleben'],
  'lektion-b1-16-nachrichten-pruefen': ['Quellen prüfen'],
};
const lessonName = (id) => LESSONS[id]?.[0] || id;
const lessonNeeds = (id) => LESSONS[id]?.slice(1) || [];
const lessonsOf = (level) => Object.keys(LESSONS).filter((id) => id.split('-')[1] === level.toLowerCase()).sort();

// Exam tasks (Schreiben / Sprechen) practised in Sparring with these lessons, per exam level (§2.7)
export const EXAM_TASK_LESSONS = {
  A1: { schreiben: ['lektion-a1-12-kurze-nachrichten', 'lektion-a1-13-formulare'], sprechen: ['lektion-a1-01-vorstellen', 'lektion-a1-02-fragen-und-verstehen'] },
  A2: { schreiben: ['lektion-a2-12-nachrichten', 'lektion-a2-07-verabreden'], sprechen: ['lektion-a2-14-reklamation', 'lektion-a2-15-nachbarschaft'] },
  B1: { schreiben: ['lektion-a2-12-nachrichten', 'lektion-b1-13-formeller-brief', 'lektion-b1-02-argumentieren'], sprechen: ['lektion-b1-06-probleme-loesen', 'lektion-b1-05-hoefliche-anliegen', 'lektion-b1-02-argumentieren'] },
};
export const MOCK_AT = [0.3, 0.6, 0.9]; // mock exams at about 30 %, 60 % and 90 % of the time

// ---------- names (the ONLY place they are made) ----------
export const goalTitle = (goal) => (TEMPLATES[goal.template]?.name(goal) || 'Goal').slice(0, 80);

export function partTitle(part) {
  switch (part.kind) {
    case 'vocab': return `${part.level} vocabulary`;
    case 'grammar': return `${part.level} grammar & situations`;
    case 'exam': return 'Exam practice';
    case 'check': return `${part.level} placement check`;
    default: return 'Part';
  }
}

export function milestoneTitle(c) {
  switch (c?.kind) {
    case 'words': {
      const where = c.section ? `${c.section}${c.lists ? ` › ${c.lists.join(', ')}` : ''}` : 'other topics';
      const part = c.part ? ` – part ${c.part.i} of ${c.part.n}` : '';
      return `${c.sources === 'kurs' ? 'Course words: ' : ''}${where} (${c.level})${part}`;
    }
    case 'grammar': {
      const e = curriculumEntry(c.topicId);
      return `${e ? shortTitle(e) : c.topicId}${c.target === 'introduced' ? ' (introduced)' : ''}`;
    }
    case 'lessons': return `${c.level} situations: ${c.lessonIds.map(lessonName).join(', ')}`;
    case 'exam':
      if (c.part === 'mock') return ['Mock exam 1: Lesen + Hören', 'Mock exam 2: all 4 modules', 'Mock exam 3: timed, all 4 modules'][c.n - 1] || `Mock exam ${c.n}: all 4 modules`;
      return `${{ lesen: 'Lesen', hoeren: 'Hören', schreiben: 'Schreiben', sprechen: 'Sprechen' }[c.part]} ${c.n}${c.lessonId ? `: ${lessonName(c.lessonId)}` : ''}`;
    case 'placement': return `${c.level} words checked`;
    case 'verbs': return `Perfekt mit ${c.aux || 'haben/sein'}: ${c.count} ${c.levels.join('+')} verbs`;
    default: return 'Milestone';
  }
}

// ---------- words of a chunk (§2.3): chunkWords lives in lib/plan-progress.js, re-exported here ----------
export { chunkWords, LEARNT_FROM, topicMet, lessonDone };
// the sections of the words, in the plan order; lists in the order of the Word file (ctx.sections) or by name
function orderedSections(words, ctx, onlySection) {
  const fromCtx = new Map((ctx.sections || []).map((s) => [s.name, s.lists.map((l) => l.name)]));
  const found = new Map();
  for (const w of words) for (const t of w.topics || []) {
    const [sec, lst] = String(t).split(SEP);
    if (!sec || !lst) continue;
    if (!found.has(sec)) found.set(sec, new Set());
    found.get(sec).add(lst);
  }
  const rank = (s) => (SECTION_ORDER.includes(s) ? SECTION_ORDER.indexOf(s) : s === BIG_SECTION ? SECTION_ORDER.length : SECTION_ORDER.length + 1);
  return [...found.keys()]
    .filter((s) => !onlySection || s === onlySection)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => {
      const order = fromCtx.get(name) || [];
      const r = (l) => (order.includes(l) ? order.indexOf(l) : order.length);
      return { name, lists: [...found.get(name)].sort((a, b) => r(a) - r(b) || a.localeCompare(b)) };
    });
}

// The word milestones of one level, in claim order (§2.3 chunk rule). course = exam goal: Goethe words first,
// then the course-only words of the same section as their own chunk (D2: a core target, not optional).
// A level with very many words gets bigger chunks, so a part never has more than 40 milestones.
const CHUNK_SIZES = [[CHUNK_MAX, CHUNK_PART, CHUNK_MIN], [60, 35, 12], [80, 45, 16], [120, 60, 24], [200, 100, 40]];
function wordCriteria(words, ctx, opts) {
  for (const sizes of CHUNK_SIZES) {
    const out = wordCriteriaWith(words, ctx, opts, sizes);
    if (out.length <= MAX_PART_MILESTONES || sizes === CHUNK_SIZES.at(-1)) return out;
  }
  return [];
}

function wordCriteriaWith(words, ctx, { level, sources, section, list, course }, [chunkMax, chunkPart, chunkMin]) {
  const claimed = new Set();
  const out = [];
  const unclaimed = (c) => words.filter((w) => !claimed.has(w.id) && wordMatches(w, c));
  const claim = (ws) => ws.forEach((w) => claimed.add(w.id));
  const push = (c, ws) => {
    if (ws.length > chunkMax) {
      const n = Math.max(2, Math.round(ws.length / chunkPart));
      for (let i = 1; i <= n; i += 1) out.push({ ...c, part: { i, n } });
    } else out.push(c);
    claim(ws);
  };
  const sectionChunks = (sec, src, small) => {
    const base = { kind: 'words', level, section: sec.name, lists: list ? [list] : null, part: null, sources: src, optional: false };
    const pool = unclaimed(base);
    if (!pool.length || (small && pool.length < chunkMin)) return;
    if (pool.length <= chunkMax || list) return push(base, pool);
    // split into lists; a list with fewer than 8 words joins the next list of the section (the last one joins the previous)
    const groups = [];
    let carry = [];
    const seen = new Set();
    for (const l of sec.lists) {
      const ws = pool.filter((w) => !seen.has(w.id) && wordMatches(w, { ...base, lists: [l] }));
      if (!ws.length) continue;
      ws.forEach((w) => seen.add(w.id));
      carry.push({ l, ws });
      const size = carry.reduce((s, x) => s + x.ws.length, 0);
      if (size >= chunkMin) {
        groups.push(carry);
        carry = [];
      }
    }
    if (carry.length) {
      if (groups.length) groups[groups.length - 1].push(...carry);
      else groups.push(carry);
    }
    for (const g of groups) push({ ...base, lists: g.map((x) => x.l) }, g.flatMap((x) => x.ws));
  };
  const secs = orderedSections(words.filter((w) => w.level === level), ctx, section);
  for (const sec of secs) {
    sectionChunks(sec, course ? 'goethe' : sources, false);
    if (course) sectionChunks(sec, 'kurs', true);
  }
  if (course) { // the small course-only remainders of all sections, together
    const c = { kind: 'words', level, section: null, lists: null, part: null, sources: 'kurs', optional: false };
    const pool = unclaimed(c);
    if (pool.length) push(c, pool);
  }
  return out;
}

// schedule order: noun chunks in section order, with the verb / function-word / adjective chunks spread between them
function interleave(items, isBig) {
  const nouns = items.filter((x) => !isBig(x));
  const bigs = items.filter(isBig);
  const out = [];
  let ni = 0;
  let bi = 0;
  while (ni < nouns.length || bi < bigs.length) {
    const takeBig = bi < bigs.length && (ni >= nouns.length || (bi + 0.5) / bigs.length <= (ni + 0.5) / nouns.length);
    out.push(takeBig ? bigs[bi++] : nouns[ni++]);
  }
  return out;
}

// ---------- what is met now, what is left (the rules are in lib/plan-progress.js; the generator only asks them) ----------
// the work of one milestone → { minutes, newWords, newTopics, reviewTopics, size, unit, met }
// which words are nouns (the Article score counts for nouns only) – worked out once per context
const nounCache = new WeakMap();
function nounIds(ctx) {
  if (!nounCache.has(ctx)) nounCache.set(ctx, new Set((ctx.words || []).filter((w) => w.type === 'noun').map((w) => w.id)));
  return nounCache.get(ctx);
}
const isLearntId = (ctx, id) => learnt(ctx.scores?.[id], ctx.words ? nounIds(ctx).has(id) : undefined);

function workOf(m, goal, ctx, membership) {
  const c = m.criterion;
  const below = (lv) => GOAL_LEVELS.indexOf(lv) < GOAL_LEVELS.indexOf(goal.startLevel);
  if (c.kind === 'words') {
    const ids = membership.get(m.id) || [];
    let answers = 0;
    let newWords = 0;
    let have = 0;
    for (const id of ids) {
      const rec = ctx.scores?.[id];
      if (isLearntId(ctx, id)) { have += 1; continue; }
      // answers still needed: the weaker of Meaning and (for a noun) Article has to reach LEARNT_FROM
      if (rec) {
        const noun = ctx.words ? nounIds(ctx).has(id) : hasScore(rec, 'a');
        answers += Math.max(1, Math.ceil((LEARNT_FROM - Math.min(mScore(rec), noun ? aScore(rec) : 10)) / 2));
      } else answers += below(c.level) ? ANSWERS_SEEN_WORD : ANSWERS_NEW_WORD;
      if (!below(c.level)) newWords += 1;
    }
    return { minutes: answers * MIN_FLASHCARD, newWords, size: ids.length, unit: 'words', learntWords: ids.length, met: ids.length > 0 && have >= CHUNK_REACHED * ids.length, ids };
  }
  if (c.kind === 'grammar') {
    const e = curriculumEntry(c.topicId);
    const st = ctx.grammarStats?.[c.topicId];
    const met = topicMet(st, c.target, topicThreshold(e));
    const review = below(e.level);
    const base = c.target === 'introduced' ? ANSWERS_INTRODUCED : review ? ANSWERS_REVIEW_TOPIC : ANSWERS_TOPIC;
    const answers = met ? 0 : Math.max(Math.min(10, base), base - (st?.n || 0));
    return { minutes: answers * MIN_SENTENCE, newTopics: review ? 0 : 1, reviewTopics: review ? 1 : 0, size: c.target === 'introduced' ? INTRODUCED_ANSWERS : SOLID_ANSWERS, unit: 'answers', met };
  }
  if (c.kind === 'lessons') {
    const open = c.lessonIds.filter((id) => !lessonDone(ctx.grammarStats?.[id]));
    return { minutes: open.length * ANSWERS_LESSON * MIN_SENTENCE, size: c.lessonIds.length, unit: 'lessons', met: open.length === 0 };
  }
  return { minutes: 0, size: 1, unit: c.part === 'mock' ? 'mock' : 'task', met: false };
}

// ---------- the request the Coach (or the preview) sends ----------
const snapMinutes = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return DEFAULT_MINUTES;
  return MINUTES_PER_DAY.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), MINUTES_PER_DAY[0]);
};
export { CUTS };

// { template, endDate, minutesPerDay, startLevel, options: { level?, sources?, section?, list?, topicIds?, cut? }, level?, startDate?, id? }
// → { ok: true, draft } or { ok: false, error } (a fixed code). Nothing here is free text that ends up as a name.
export function planRequest(raw, ctx = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const o = r.options && typeof r.options === 'object' ? r.options : {};
  const template = r.template;
  if (!TEMPLATE_IDS.includes(template)) return { ok: false, error: 'bad_template' };
  const today = isDay(ctx.today) ? ctx.today : dayOf(Math.floor(Date.now() / DAY_MS));
  const startDate = isDay(r.startDate) && r.startDate >= today ? r.startDate : today;
  const topicIds = Array.isArray(o.topicIds) ? [...new Set(o.topicIds.filter((id) => curriculumEntry(id)))].slice(0, 12) : [];
  let level = GOAL_LEVELS.includes(r.level) ? r.level : GOAL_LEVELS.includes(o.level) ? o.level : null;
  if (template === 'topic') {
    if (!topicIds.length) return { ok: false, error: 'bad_topic' };
    level = topicIds.map((id) => curriculumEntry(id).level).sort().at(-1);
  }
  if (!level) return { ok: false, error: 'bad_level' };
  let section = null;
  let list = null;
  if (template === 'wordtopic') {
    const words = ctx.words || [];
    const secs = orderedSections(words, ctx);
    const sec = secs.find((s) => s.name === o.section);
    if (!sec) return { ok: false, error: 'bad_section' };
    section = sec.name;
    list = o.list && sec.lists.includes(o.list) ? o.list : null;
  }
  const t = TEMPLATES[template];
  const endDefault = t.months ? dayOf(dayNum(startDate) + Math.round(t.months * 30.44)) : addDays(startDate, t.weeks * 7);
  const endDate = isDay(r.endDate) ? r.endDate : endDefault;
  const span = dayNum(endDate) - dayNum(startDate);
  if (span < (template === 'exam' ? BUFFER_DAYS + 14 : 7) || span > MAX_SPAN_DAYS) return { ok: false, error: 'bad_date' };
  const startLevel = GOAL_LEVELS.includes(r.startLevel) && GOAL_LEVELS.indexOf(r.startLevel) <= GOAL_LEVELS.indexOf(level)
    ? r.startLevel : template === 'exam' ? 'A1' : level;
  const sources = template === 'kurs' ? 'kurs' : template === 'exam' ? 'both' : ['goethe', 'kurs', 'both'].includes(o.sources) ? o.sources : 'both';
  return {
    ok: true,
    draft: {
      id: cleanGoalId(r.id) || newGoalId('g'), template, level, startLevel, startDate, endDate,
      minutesPerDay: snapMinutes(r.minutesPerDay),
      options: { sources, section, list, topicIds: template === 'topic' ? topicIds : [] },
      cut: Array.isArray(o.cut) ? CUTS.filter((x) => o.cut.includes(x)) : [],
    },
  };
}

// ---------- making the parts and milestones (§2.1, §2.2, §2.3, exam items) ----------
const levelsUpTo = (lv) => GOAL_LEVELS.slice(0, GOAL_LEVELS.indexOf(lv) + 1);
const mk = (criterion, extra = {}) => ({
  id: milestoneId(criterion), date: null, order: 0, criterion, status: 'open', reachedAt: null, alreadySolid: false, origin: 'template', ...extra,
});

function grammarMilestones(level, { topicIds = null, lessons = false, cut = [] }) {
  const ids = planOrder(level).filter((id) => !topicIds || topicIds.includes(id));
  const target = (id) => (cut.includes('receptiveIntroduced') && curriculumEntry(id).role === 'receptive' ? 'introduced' : 'solid');
  const list = ids.map((id) => mk({ kind: 'grammar', topicId: id, target: target(id) }));
  if (!lessons) return list;
  // situation lessons, two per milestone, each after the topics it builds on (or spread evenly between the topics)
  const all = lessonsOf(level);
  const groups = [];
  for (let i = 0; i < all.length; i += LESSONS_PER_MILESTONE) groups.push(all.slice(i, i + LESSONS_PER_MILESTONE));
  const placed = groups.map((g, gi) => {
    const needs = g.flatMap(lessonNeeds).filter((id) => ids.includes(id));
    const after = needs.length ? Math.max(...needs.map((id) => ids.indexOf(id))) + 1 : Math.round(((gi + 1) * ids.length) / (groups.length + 1));
    return { at: after, gi, m: mk({ kind: 'lessons', level, lessonIds: g }) };
  });
  const out = [];
  for (let pos = 0; pos <= list.length; pos += 1) {
    out.push(...placed.filter((p) => p.at === pos).sort((a, b) => a.gi - b.gi).map((p) => p.m));
    if (pos < list.length) out.push(list[pos]);
  }
  return out;
}

function examMilestones(goal) {
  const start = dayNum(goal.startDate);
  const end = dayNum(goal.endDate);
  const span = end - start;
  const planEnd = end - BUFFER_DAYS;
  // in week round(f × weeks), at the end of that week: 26 weeks → weeks 8, 16, 23 (§2.7)
  const weeks = Math.floor(span / 7);
  const out = MOCK_AT.map((f, i) => mk({ kind: 'exam', part: 'mock', n: i + 1 }, {
    date: dayOf(Math.min(end - 1, start + (Math.max(1, Math.round(f * weeks)) - 1) * 7 + 5)),
  }));
  const mockWeeks = new Set(out.map((m) => Math.floor((dayNum(m.date) - start) / 7)));
  const tasks = EXAM_TASK_LESSONS[goal.level];
  const count = { schreiben: 0, sprechen: 0 };
  let k = 0;
  for (let d = start + Math.ceil(span / 2); d <= planEnd && out.length < MAX_PART_MILESTONES; d += 7) {
    if (mockWeeks.has(Math.floor((d - start) / 7))) continue;
    const part = k % 2 === 0 ? 'schreiben' : 'sprechen';
    count[part] += 1;
    const lessonId = tasks[part][(count[part] - 1) % tasks[part].length];
    out.push(mk({ kind: 'exam', part, n: count[part], lessonId }, { date: dayOf(d) }));
    k += 1;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// draft → the parts with their milestones in claim order (no dates yet, except the exam items)
function makeParts(goal, ctx, cut) {
  const words = ctx.words || [];
  const parts = [];
  const vocabLevels = goal.template === 'vocab' ? [goal.level] : levelsUpTo(goal.level);
  const lessonFrom = GOAL_LEVELS.indexOf(goal.startLevel);
  if (['exam', 'vocab', 'wordtopic', 'kurs'].includes(goal.template)) {
    for (const level of vocabLevels) {
      const crit = wordCriteria(words, ctx, {
        level, sources: goal.options.sources, section: goal.options.section, list: goal.options.list, course: goal.template === 'exam',
      });
      if (!crit.length) continue;
      parts.push({ id: `vocab-${level.toLowerCase()}`, kind: 'vocab', level, include: true, milestones: crit.map((c) => mk(c)) });
    }
  }
  if (['exam', 'grammar', 'topic'].includes(goal.template)) {
    const levels = goal.template === 'exam' ? levelsUpTo(goal.level)
      : goal.template === 'grammar' ? [goal.level] : [...new Set(goal.options.topicIds.map((id) => curriculumEntry(id).level))].sort();
    for (const level of levels) {
      const ms = grammarMilestones(level, {
        topicIds: goal.template === 'topic' ? goal.options.topicIds : null,
        lessons: goal.template !== 'topic' && GOAL_LEVELS.indexOf(level) >= lessonFrom,
        cut,
      });
      if (ms.length) parts.push({ id: `grammar-${level.toLowerCase()}`, kind: 'grammar', level, include: true, milestones: ms });
    }
  }
  if (goal.isExam) parts.push({ id: 'exam', kind: 'exam', level: goal.level, include: true, milestones: examMilestones(goal) });
  // limits: at most 8 parts, 40 milestones each (the chunk rule keeps word parts well below; the check proves it)
  return parts.slice(0, MAX_PARTS).map((p, i) => ({ ...p, order: i, milestones: p.milestones.slice(0, MAX_PART_MILESTONES) }));
}

// ---------- scheduling (§2.6): two parallel tracks, vocabulary and grammar, by workload and pace ----------
const newWordsCap = (min) => NEW_WORDS_PER_WEEK[min] ?? Math.round(min);

// items: [{ m, track, w: workOf }] in schedule order → Map(milestoneId → day number when it is reached), finish day
function simulate(items, { minutesPerDay, startDay, examStartDay, focusTrack, learntAtStart }) {
  // vocabulary: the lower-level gaps (A1, A2) keep priority; B1 words run in a second queue that shares the weekly word time
  const isB1 = (x) => x.track === 'vocab' && x.part?.level === 'B1';
  const queue = {
    vocab: items.filter((x) => x.track === 'vocab' && !isB1(x)),
    vocabB1: items.filter(isB1),
    grammar: items.filter((x) => x.track === 'grammar'),
  };
  const left = new Map(items.map((x) => [x.m.id, { minutes: x.w.minutes, newWords: x.w.newWords || 0, newTopics: x.w.newTopics || 0, reviewTopics: x.w.reviewTopics || 0 }]));
  const doneDay = new Map();
  let learntWords = learntAtStart;
  const week = minutesPerDay * DAYS_PER_WEEK;
  let wk = 0;
  for (; wk < MAX_WEEKS && (queue.vocab.length || queue.vocabB1.length || queue.grammar.length); wk += 1) {
    const weekStart = startDay + wk * 7;
    const examOn = examStartDay != null && weekStart + 6 >= examStartDay;
    const share = examOn ? { vocab: SHARE.vocab, grammar: SHARE.grammar } : { vocab: SHARE.vocab / (1 - SHARE.exam), grammar: SHARE.grammar / (1 - SHARE.exam) };
    if (focusTrack) {
      const other = focusTrack === 'vocab' ? 'grammar' : 'vocab';
      const move = Math.min(FOCUS_EXTRA, share[other] - 0.1);
      share[focusTrack] += move;
      share[other] -= move;
    }
    const allot = { vocab: Math.max(0, week * share.vocab - learntWords * KEEP_ANSWERS * MIN_FLASHCARD), grammar: week * share.grammar };
    const caps = { newWords: newWordsCap(minutesPerDay), newTopics: NEW_TOPICS_PER_WEEK, reviewTopics: REVIEW_TOPICS_PER_WEEK };
    const used = { vocab: 0, grammar: 0 };
    const finished = [];
    const run = (track, minutes, q = track) => {
      let free = minutes;
      while (free > 1e-9 && queue[q].length) {
        const x = queue[q][0];
        const l = left.get(x.m.id);
        let can = Math.min(free, l.minutes);
        for (const k of ['newWords', 'newTopics', 'reviewTopics']) {
          if (l[k] > 0) can = Math.min(can, (caps[k] / l[k]) * l.minutes); // the pace limits of §2.6
        }
        if (can <= 1e-9 && l.minutes > 1e-9) break; // a limit is reached for this week
        const f = l.minutes > 0 ? can / l.minutes : 1;
        for (const k of ['newWords', 'newTopics', 'reviewTopics']) {
          caps[k] -= l[k] * f;
          l[k] -= l[k] * f;
        }
        l.minutes -= can;
        free -= can;
        used[track] += can;
        if (l.minutes <= 1e-6) {
          queue[q].shift();
          finished.push({ x, track, at: used[track] });
          if (track === 'vocab') learntWords += x.w.learntWords || 0;
        }
      }
      return free;
    };
    // 60/40 lower/B1 while lower gaps remain; time one of them cannot use goes to the other (so B1 gets it all when A1/A2 are done)
    const lowerShare = queue.vocab.length ? 1 - B1_WORD_SHARE : 0;
    const restLow = run('vocab', allot.vocab * lowerShare, 'vocab');
    const restB1 = run('vocab', allot.vocab * (1 - lowerShare), 'vocabB1');
    const restV = (restB1 > 0 ? run('vocab', restB1, 'vocab') : 0) + (restLow > 0 ? run('vocab', restLow, 'vocabB1') : 0);
    const restG = run('grammar', allot.grammar);
    // time a track cannot use (finished, or a pace limit) goes to the other one
    if (restV > 0) run('grammar', restV);
    if (restG > 0) {
      const left = run('vocab', restG, 'vocab');
      if (left > 0) run('vocab', left, 'vocabB1');
    }
    for (const f of finished) {
      const total = Math.max(used[f.track], 1e-9);
      const off = Math.min(7, Math.max(1, Math.ceil((7 * f.at) / total)));
      doneDay.set(f.x.m.id, weekStart + off);
    }
  }
  const unfinished = [...queue.vocab, ...queue.vocabB1, ...queue.grammar];
  for (const x of unfinished) doneDay.set(x.m.id, startDay + MAX_WEEKS * 7);
  const finish = Math.max(startDay, ...doneDay.values());
  return { doneDay, finish };
}

// the core: give dates to the open template milestones of `parts` → { parts, tight }
function schedule(goal, parts, ctx, { minutesPerDay, startDay, focus = [], skipFixes = false, cut = [] }) {
  const membership = new Map();
  for (const p of parts) if (p.kind === 'vocab') for (const [k, v] of chunkWords(p, ctx.words || [])) membership.set(k, v);
  const end = dayNum(goal.endDate);
  const planEnd = goal.isExam ? end - BUFFER_DAYS : end;
  const examPart = parts.find((p) => p.kind === 'exam');
  const examStartDay = examPart ? Math.min(...examPart.milestones.map((m) => (m.date ? dayNum(m.date) : end))) : null;
  const items = [];
  let learntAtStart = 0;
  for (const p of parts) {
    if (p.kind !== 'vocab' && p.kind !== 'grammar') continue;
    const order = p.kind === 'vocab' ? interleave(p.milestones, (m) => m.criterion.section === BIG_SECTION) : p.milestones;
    order.forEach((m, i) => {
      m.order = i;
      if (p.kind === 'vocab') learntAtStart += (membership.get(m.id) || []).filter((id) => isLearntId(ctx, id)).length;
      const fixed = isReached(m) || m.status === 'skipped' || m.origin !== 'template' || !p.include;
      if (fixed) return;
      const w = workOf(m, goal, ctx, membership);
      items.push({ m, track: p.kind, w, part: p });
    });
  }
  // levels in order: A1 → A2 → B1 inside each track (parts are already in level order)
  const focusTrack = focus.length ? parts.find((p) => focus.includes(p.id))?.kind : null;
  const { doneDay, finish } = simulate(items, {
    minutesPerDay, startDay, examStartDay, focusTrack: ['vocab', 'grammar'].includes(focusTrack) ? focusTrack : null,
    learntAtStart,
  });
  const fits = finish <= planEnd;
  // a plan that does not fit keeps its order but is squeezed into the time there is – and says so (tight)
  const squeeze = (d) => (fits || finish <= startDay ? d : startDay + Math.round(((d - startDay) * (planEnd - startDay)) / (finish - startDay)));
  for (const x of items) {
    const d = Math.max(startDay + 1, Math.min(planEnd, squeeze(doneDay.get(x.m.id))));
    x.m.date = dayOf(Math.min(end, Math.max(dayNum(goal.startDate), d))); // always inside the goal
  }
  let tight = null;
  if (!fits) {
    tight = {
      needsUntil: dayOf(finish), planEnd: dayOf(planEnd),
      weeksOver: Math.ceil((finish - planEnd) / 7),
      examDate: goal.isExam ? goal.endDate : null,
      // said honestly: what WOULD be reached by the end at this pace, per part ("about 300 of the 727 B1 words")
      byPlanEnd: parts.filter((p) => p.kind === 'vocab' || p.kind === 'grammar').map((p) => {
        const mine = items.filter((x) => x.part === p);
        const inTime = mine.filter((x) => doneDay.get(x.m.id) <= planEnd);
        const words = (list) => list.reduce((n, x) => n + (x.w.size || 0), 0);
        return {
          partId: p.id, title: partTitle(p), milestones: inTime.length, of: mine.length,
          ...(p.kind === 'vocab' ? { words: words(inTime), wordsOf: words(mine) } : {}),
        };
      }),
      fixes: [],
    };
    if (!skipFixes) tight.fixes = fixesFor(goal, ctx, { minutesPerDay, startDay, focus, cut });
  }
  return { parts, tight, finish: dayOf(finish), items };
}

// What would make a plan fit, in numbers (§3.1 amber box). Every fix is tried with the real generator.
function fixesFor(goal, ctx, { minutesPerDay, startDay, focus, cut }) {
  const tryWith = (over) => {
    const g = { ...goal, ...(over.endDate ? { endDate: over.endDate } : {}) };
    const parts = makeParts(g, ctx, over.cut || cut);
    markMet(g, parts, ctx);
    applyCuts(parts, over.cut || cut);
    const r = schedule(g, parts, ctx, { minutesPerDay: over.minutesPerDay || minutesPerDay, startDay, focus, skipFixes: true, cut: over.cut || cut });
    return { needsUntil: r.tight ? r.tight.needsUntil : r.finish, fits: !r.tight };
  };
  const fixes = [];
  for (const m of MINUTES_PER_DAY.filter((x) => x > minutesPerDay)) {
    const r = tryWith({ minutesPerDay: m });
    fixes.push({ lever: { minutesPerDay: m }, ...r });
    if (r.fits) break;
  }
  const hasKurs = goal.isExam && !cut.includes('kursWords');
  if (hasKurs) fixes.push({ lever: { cut: ['kursWords'] }, ...tryWith({ cut: [...cut, 'kursWords'] }) });
  const hasReceptive = ['exam', 'grammar'].includes(goal.template) && goal.level === 'B1' && !cut.includes('receptiveIntroduced');
  if (hasReceptive) fixes.push({ lever: { cut: ['receptiveIntroduced'] }, ...tryWith({ cut: [...cut, 'receptiveIntroduced'] }) });
  // the smallest daily time that fits with every cut (what the Coach can propose in one step)
  if (hasKurs || hasReceptive) {
    const all = [...new Set([...cut, ...CUTS])];
    for (const m of MINUTES_PER_DAY.filter((x) => x >= minutesPerDay)) {
      const r = tryWith({ minutesPerDay: m, cut: all });
      if (r.fits || m === MINUTES_PER_DAY.at(-1)) {
        fixes.push({ lever: { minutesPerDay: m, cut: all }, ...r });
        break;
      }
    }
  }
  if (!goal.isExam) { // only a goal that is not an exam can move its date (§3.1, §4.5)
    const at = tryWith({});
    fixes.push({ lever: { endDate: at.needsUntil }, needsUntil: at.needsUntil, fits: true });
  }
  return fixes;
}

// "Already solid": a milestone that is met when the goal is made → reachedAt = today, no date (§2.4)
function markMet(goal, parts, ctx) {
  const membership = new Map();
  for (const p of parts) if (p.kind === 'vocab') for (const [k, v] of chunkWords(p, ctx.words || [])) membership.set(k, v);
  for (const p of parts) for (const m of p.milestones) {
    if (m.criterion.kind === 'exam' || isReached(m)) continue;
    if (workOf(m, goal, ctx, membership).met) {
      m.alreadySolid = true;
      m.reachedAt = goal.startDate;
      m.date = null;
    }
  }
}

// cut levers: course-only words are LEFT OUT (status skipped, shown, can come back); receptive topics → "introduced"
function applyCuts(parts, cut) {
  const changes = [];
  for (const p of parts) for (const m of p.milestones) {
    if (isReached(m)) continue;
    const c = m.criterion;
    if (cut.includes('kursWords') && c.kind === 'words' && c.sources === 'kurs' && m.status !== 'skipped') {
      m.status = 'skipped';
      m.date = null;
      changes.push({ type: 'skip', milestoneId: m.id, title: milestoneTitle(c) });
    }
    if (cut.includes('receptiveIntroduced') && c.kind === 'grammar' && c.target === 'solid' && curriculumEntry(c.topicId)?.role === 'receptive') {
      m.criterion = { ...c, target: 'introduced' };
      changes.push({ type: 'target', milestoneId: m.id, from: 'solid', to: 'introduced', title: milestoneTitle(m.criterion) });
    }
  }
  return changes;
}

// The work the generator counts for each open milestone (for the checks and the Coach's numbers):
// Map(milestoneId → { minutes, newWords, newTopics, reviewTopics, size, unit, met })
export function milestoneWork(goal, ctx = {}) {
  const membership = new Map();
  for (const p of goal.subPlans) if (p.kind === 'vocab') for (const [k, v] of chunkWords(p, ctx.words || [])) membership.set(k, v);
  const out = new Map();
  for (const { m } of allMilestones(goal)) {
    const { ids, ...w } = workOf(m, goal, ctx, membership);
    out.set(m.id, w);
  }
  return out;
}

// ---------- building a plan ----------
// draft = planRequest(...).draft → { goal, tight }
export function buildPlan(draft, ctx = {}) {
  const goal = {
    id: draft.id, version: PLAN_VERSION, title: '', template: draft.template, level: draft.level, startLevel: draft.startLevel,
    startDate: draft.startDate, endDate: draft.endDate, isExam: draft.template === 'exam',
    options: { ...draft.options }, pace: { minutesPerDay: draft.minutesPerDay },
  };
  goal.title = goalTitle(goal);
  const cut = draft.cut || [];
  const parts = makeParts(goal, ctx, cut);
  markMet(goal, parts, ctx);
  applyCuts(parts, cut);
  const { tight } = schedule(goal, parts, ctx, { minutesPerDay: draft.minutesPerDay, startDay: dayNum(goal.startDate), cut });
  goal.subPlans = parts;
  return { goal, tight };
}

// The Coach's door (R12): only { template, endDate, minutesPerDay, startLevel, options } → a full preview with names.
export function previewPlan(request, ctx = {}) {
  const req = planRequest(request, ctx);
  if (!req.ok) return req;
  const { goal, tight } = buildPlan(req.draft, ctx);
  return { ok: true, goal, tight, ...describePlan(goal, ctx, tight) };
}

// what the preview shows: counts, finish day, one row per part with its milestones (names made here)
export function describePlan(goal, ctx = {}, tight = null) {
  const membership = new Map();
  for (const p of goal.subPlans) if (p.kind === 'vocab') for (const [k, v] of chunkWords(p, ctx.words || [])) membership.set(k, v);
  const all = allMilestones(goal);
  const dates = all.filter(({ m }) => m.date && m.criterion.kind !== 'exam').map(({ m }) => m.date).sort();
  const parts = goal.subPlans.map((p) => {
    const ms = p.milestones.slice().sort((a, b) => a.order - b.order || (a.date || '').localeCompare(b.date || ''));
    const words = p.kind === 'vocab' ? p.milestones.filter((m) => m.status !== 'skipped').reduce((s, m) => s + (membership.get(m.id) || []).length, 0) : null;
    const open = ms.filter((m) => m.date && m.status !== 'skipped').map((m) => m.date).sort();
    return {
      id: p.id, kind: p.kind, level: p.level, title: partTitle(p), include: p.include,
      milestoneCount: ms.length, words, until: open.at(-1) || null,
      milestones: ms.map((m) => ({
        id: m.id, title: milestoneTitle(m.criterion), date: m.date, status: m.status, alreadySolid: m.alreadySolid,
        size: m.criterion.kind === 'words' ? (membership.get(m.id) || []).length : null,
        optional: false, tickable: m.criterion.kind === 'exam',
      })),
    };
  });
  return {
    title: goal.title,
    summary: {
      parts: parts.length,
      milestones: all.length,
      alreadySolid: all.filter(({ m }) => m.alreadySolid).length,
      leftOut: all.filter(({ m }) => m.status === 'skipped').length,
      // D2: in an exam goal the course-only words are a core target – the preview says how many it adds
      courseWords: all.filter(({ m }) => m.criterion.kind === 'words' && m.criterion.sources === 'kurs' && m.status !== 'skipped')
        .reduce((n, { m }) => n + (membership.get(m.id) || []).length, 0),
      finishesOn: tight ? tight.needsUntil : dates.at(-1) || null,
      bufferDays: goal.isExam ? BUFFER_DAYS : 0,
      fits: !tight,
    },
    parts,
  };
}

// ---------- re-planning (§4.2): the Coach's levers ----------
// levers: { minutesPerDay?, endDate? (never for an exam goal), focus?: [subPlanId], cut?: ['kursWords'|'receptiveIntroduced'] }
// Keeps reached milestones, coach and student milestones and left-out ones exactly as they are; re-dates the open
// template milestones from today to the end. → { ok, goal, changes, tight } or { ok: false, error }
export function replan(goal, ctx = {}, today, levers = {}) {
  const now = isDay(today) ? today : ctx.today;
  if (!goal || goal.version !== PLAN_VERSION || !isDay(now)) return { ok: false, error: 'bad_goal' };
  if (now >= goal.endDate) return { ok: false, error: 'ended' };
  const next = structuredClone(goal);
  const changes = [];
  if (levers.minutesPerDay != null) {
    const m = snapMinutes(levers.minutesPerDay);
    if (m !== next.pace.minutesPerDay) changes.push({ type: 'pace', from: next.pace.minutesPerDay, to: m });
    next.pace.minutesPerDay = m;
  }
  if (levers.endDate != null) {
    if (next.isExam) return { ok: false, error: 'exam_date_fixed' }; // the exam date never moves
    const lastReached = allMilestones(next).filter(({ m }) => isReached(m) && m.date).map(({ m }) => m.date).sort().at(-1);
    if (!isDay(levers.endDate) || levers.endDate <= now || (lastReached && levers.endDate < lastReached)
      || dayNum(levers.endDate) - dayNum(next.startDate) > MAX_SPAN_DAYS) return { ok: false, error: 'bad_date' };
    if (levers.endDate !== next.endDate) changes.push({ type: 'endDate', from: next.endDate, to: levers.endDate });
    next.endDate = levers.endDate;
  }
  const cut = Array.isArray(levers.cut) ? CUTS.filter((x) => levers.cut.includes(x)) : [];
  changes.push(...applyCuts(next.subPlans, cut));
  const focus = Array.isArray(levers.focus) ? levers.focus.filter((id) => next.subPlans.some((p) => p.id === id)) : [];
  if (focus.length) changes.push({ type: 'focus', subPlanIds: focus });
  const before = new Map(allMilestones(next).map(({ m }) => [m.id, m.date]));
  const startDay = Math.max(dayNum(now), dayNum(next.startDate));
  const { tight } = schedule(next, next.subPlans, ctx, { minutesPerDay: next.pace.minutesPerDay, startDay, focus, cut });
  // less time a day never pulls a milestone earlier (a squeezed plan would otherwise shift dates back by a day or two)
  const slower = next.pace.minutesPerDay < goal.pace.minutesPerDay && !focus.length && !cut.length
    && (levers.endDate == null || levers.endDate >= goal.endDate);
  if (slower) {
    for (const { m } of allMilestones(next)) {
      const from = before.get(m.id);
      if (from && m.date && m.date < from && m.date >= now && !isReached(m)) m.date = from;
    }
  }
  for (const { m } of allMilestones(next)) {
    const from = before.get(m.id);
    if (from !== m.date && m.status !== 'skipped' && !isReached(m)) changes.push({ type: 'move', milestoneId: m.id, title: milestoneTitle(m.criterion), from, to: m.date });
  }
  return { ok: true, goal: next, changes, tight };
}

// ---------- a milestone → the session settings (§4.2) ----------
const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); // = lib/words.js
export function sessionForMilestone(m, goal, ctx = {}) {
  const c = m?.criterion;
  if (!c) return null;
  if (c.kind === 'words') {
    const part = goal?.subPlans?.find((p) => p.milestones.some((x) => x.id === m.id));
    const pool = part ? chunkWords(part, ctx.words || []).get(m.id) || [] : [];
    const topicId = !c.section ? null : c.lists?.length === 1 ? `w:${slug(c.section)}:${slug(c.lists[0])}` : `w:${slug(c.section)}`;
    return { kind: 'vocab', topicId, level: c.level, source: c.sources, questions: 20, difficulty: 'medium', pool, milestoneId: m.id };
  }
  if (c.kind === 'grammar') {
    const st = ctx.grammarStats?.[c.topicId];
    const last20 = st?.recent?.slice(-20) || [];
    let difficulty = 'medium';
    if (!st || st.n < INTRODUCED_ANSWERS / 2) difficulty = 'easy'; // below 50 % of the "introduced" mark
    else if (last20.length >= 20 && lastPoints(last20, 20) >= 16) difficulty = 'hard';
    return { kind: 'grammar', topicId: c.topicId, level: curriculumEntry(c.topicId)?.level, questions: 20, difficulty, milestoneId: m.id };
  }
  if (c.kind === 'lessons') {
    const id = c.lessonIds.find((x) => !lessonDone(ctx.grammarStats?.[x])) || c.lessonIds[0];
    return { kind: 'grammar', topicId: id, level: c.level, questions: 20, difficulty: 'medium', milestoneId: m.id };
  }
  if (c.kind === 'exam') {
    if (!c.lessonId) return { outside: true, milestoneId: m.id }; // a mock exam: done outside the app, ticked by the student
    return { kind: 'grammar', topicId: c.lessonId, level: goal?.level, questions: 10, difficulty: 'hard', task: c.part, milestoneId: m.id };
  }
  return null;
}

// ---------- cleaning a stored / sent v2 goal ----------
// The title always comes from the template, never from what was sent.
export function cleanPlan(raw) {
  const goal = cleanPlanGoal(raw);
  if (!goal) return null;
  if (goal.template === 'topic' && !goal.options.topicIds.length) return null;
  if (goal.template === 'wordtopic' && !goal.options.section) return null;
  return { ...goal, title: goal.label || goalTitle(goal) };
}

// ---------- converting an old goal (R12, redesign §4.8, D6) ----------
// An old-style goal ({ type, level, scope, milestones: "N %" … }) → a new plan made from the same kind, level and
// scope. Its "% ready" milestones are NOT kept (Emilio, D6), and its title is not kept either: the template makes
// the new one. The id stays, so the converted goal replaces the old one. Nothing is saved here: the student confirms first.
// → { goal, tight } or null when the old goal cannot be turned into a plan.
export function upgradeGoal(old, ctx = {}) {
  if (!old || typeof old !== 'object' || Number(old.version) === PLAN_VERSION || !GOAL_LEVELS.includes(old.level)) return null;
  const today = isDay(ctx.today) ? ctx.today : dayOf(Math.floor(Date.now() / DAY_MS));
  const sc = old.scope || {};
  let template = { exam: 'exam', vocab: 'vocab', grammar: 'grammar' }[old.type];
  if (!template) return null;
  const options = {};
  if (old.type === 'vocab' && sc.section && orderedSections(ctx.words || [], ctx).some((s) => s.name === sc.section)) {
    template = 'wordtopic';
    options.section = sc.section;
    options.list = sc.list || null;
  }
  if (old.type === 'grammar' && Array.isArray(sc.rules) && sc.rules.length) {
    const ids = CURRICULUM.filter((e) => e.level <= old.level && (e.ruleNames || []).some((r) => sc.rules.includes(r))).map((e) => e.id);
    if (ids.length) {
      template = 'topic';
      options.topicIds = ids.slice(0, 12);
    }
  }
  const full = { ...ctx, today };
  // keep the old end date when it still gives a usable time frame, else the template's own length
  const tryEnd = (endDate) => {
    const r = planRequest({ id: old.id, template, level: old.level, endDate, minutesPerDay: DEFAULT_MINUTES, options }, full);
    return r.ok ? buildPlan(r.draft, full) : null;
  };
  return tryEnd(old.endDate) || tryEnd(null);
}
