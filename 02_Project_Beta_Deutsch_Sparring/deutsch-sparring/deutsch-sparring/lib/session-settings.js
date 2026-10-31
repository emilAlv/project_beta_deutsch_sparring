// The settings of one Sparring session, chosen on the setup screen and FIXED until the session
// ends (level, difficulty, questions, topic, word source, direction, grammar per word, variant).
// Pure helpers, no React: used by the setup screen, the ribbon and app/page.js.

import { QUESTION_MIN, QUESTION_MAX } from './intents.js';
import { cleanMilestoneId, cleanMilestoneTitle } from './milestone-session.js';

export const KINDS = ['grammar', 'vocab']; // what is stored: Grammar · a word session (with or without sentences)
export const SETUP_KINDS = [...KINDS, 'mixed']; // + the Mixed review (R24): no topic, the app picks what is due
export const MIXED_TOPIC_ID = 'mixed-review';
export const MIXED_QUESTION_STEPS = [10, 20]; // a mixed review has 10–20 questions
import { LEVELS } from './schema-helpers.js';
export { LEVELS };
// the topic entry of the Mixed review (shown in the ribbon as "Mixed review", never a real lesson)
export const MIXED_TOPIC = { id: MIXED_TOPIC_ID, title: 'Gemischte Wiederholung', short: 'Mixed review', type: 'Gemischt', levels: LEVELS };
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const QUESTION_STEPS = [10, 20, 30, 40, 50];
export const SOURCES = ['goethe', 'kurs', 'both']; // Goethe list · From the course · Both
export const DIRECTIONS = ['en-de', 'de-en', 'mixed'];
export const VARIANTS = ['ch', 'de']; // Swiss Hochdeutsch (ss) · German Hochdeutsch (ß)
export const GRAMMAR_POINTS = ['akkusativ', 'dativ', 'genitiv', 'adjective-endings', 'perfekt', 'verb-case'];

// The setup form as remembered for the next time (prefill)
export const DEFAULT_SETUP = {
  kind: 'vocab',
  grammarTopic: null, // grammar lesson id
  section: null, // vocabulary section topic id ("w:…")
  list: null, // one list of that section ("w:…:…"), null = the whole section
  level: 'B1',
  difficulty: 'medium',
  questions: 20,
  source: 'both',
  direction: 'en-de',
  grammar: ['akkusativ', 'dativ', 'adjective-endings'],
  variant: 'ch',
};

const str = (x) => (typeof x === 'string' && x ? x.slice(0, 160) : null);

// Anything read from the browser → a valid setup form. `old` = the settings stored by older
// versions at the top of the prefs (level, difficulty, questions, direction, sentences).
export function sanitizeSetup(raw, old = {}) {
  const p = { ...old, ...(raw && typeof raw === 'object' ? raw : {}) };
  const q = Math.round(Number(p.questions));
  const grammar = Array.isArray(p.grammar)
    ? GRAMMAR_POINTS.filter((g) => p.grammar.includes(g))
    : old.sentences === false ? [] : DEFAULT_SETUP.grammar;
  return {
    kind: SETUP_KINDS.includes(p.kind) ? p.kind : DEFAULT_SETUP.kind,
    grammarTopic: str(p.grammarTopic),
    section: str(p.section),
    list: str(p.list),
    level: LEVELS.includes(p.level) ? p.level : DEFAULT_SETUP.level,
    difficulty: DIFFICULTIES.includes(p.difficulty) ? p.difficulty : DEFAULT_SETUP.difficulty,
    questions: p.kind === 'mixed' ? (q >= QUESTION_MIN && q <= 20 ? q : 10) : q >= QUESTION_MIN && q <= QUESTION_MAX ? q : DEFAULT_SETUP.questions,
    source: SOURCES.includes(p.source) ? p.source : DEFAULT_SETUP.source,
    direction: DIRECTIONS.includes(p.direction) ? p.direction : DEFAULT_SETUP.direction,
    grammar,
    variant: VARIANTS.includes(p.variant) ? p.variant : DEFAULT_SETUP.variant,
  };
}

// Vocabulary + grammar: a sentence task follows each flashcard when a case / ending / Perfekt is chosen
export const withSentences = (settings) => settings.kind === 'vocab' && (settings.grammar || []).length > 0;

// The three choices on the setup screen and the ribbon: Grammar · Vocabulary (flashcards only) · Vocabulary + grammar.
// "Vocabulary" is the same word session with the sentence tasks off, so it is worked out from the settings.
export const MODES = ['grammar', 'words', 'vocab', 'mixed'];
export const modeOf = (settings) => (settings.kind === 'mixed' ? 'mixed' : settings.kind !== 'vocab' ? 'grammar' : withSentences(settings) ? 'vocab' : 'words');

// The topic id the session practises
export function topicIdOf(setup) {
  if (setup.kind === 'mixed') return MIXED_TOPIC_ID;
  return setup.kind === 'grammar' ? setup.grammarTopic : setup.list || setup.section;
}

// setup form → the fixed settings stored with the session (and sent to /api/chat)
// ms = { id, title } when the session belongs to a plan milestone (R14): only the id and the template title are kept
export function sessionSettings(setup, topicLabel, ms = null) {
  const milestoneId = cleanMilestoneId(ms?.id);
  return {
    kind: setup.kind,
    topicId: topicIdOf(setup),
    topicLabel: topicLabel || '',
    level: setup.level,
    difficulty: setup.difficulty,
    questions: setup.questions,
    source: setup.source,
    direction: setup.kind === 'mixed' ? 'mixed' : setup.direction,
    grammar: setup.kind === 'vocab' ? [...setup.grammar] : [],
    variant: setup.variant,
    ...(milestoneId ? { milestoneId, milestoneTitle: cleanMilestoneTitle(ms.title) || '' } : {}),
  };
}

// Session settings → the setup form again (for "New session" prefilled from this one).
// base = the remembered form: keeps the choices of the other kind (e.g. the word list after a grammar session).
export function setupFrom(settings, topics = [], base = DEFAULT_SETUP) {
  if (!settings) return sanitizeSetup(base);
  const topic = topics.find((x) => x.id === settings.topicId);
  const vocab = settings.kind === 'vocab';
  return sanitizeSetup({
    ...base,
    ...settings,
    grammar: vocab ? settings.grammar : base.grammar,
    grammarTopic: vocab || settings.kind === 'mixed' ? base.grammarTopic : settings.topicId,
    section: vocab ? (topic?.parent || settings.topicId) : base.section,
    list: vocab ? (topic?.parent ? topic.id : null) : base.list,
  });
}
