// The settings of one Sparring session, chosen on the setup screen and FIXED until the session
// ends (level, difficulty, questions, topic, word source, direction, grammar per word, variant).
// Pure helpers, no React: used by the setup screen, the ribbon and app/page.js.

import { QUESTION_MIN, QUESTION_MAX } from './intents.js';

export const KINDS = ['grammar', 'vocab']; // Grammar · Vocabulary + grammar
export const LEVELS = ['A1', 'A2', 'B1'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const QUESTION_STEPS = [10, 20, 30, 40, 50];
export const SOURCES = ['goethe', 'kurs', 'both']; // Goethe list · From the course · Both
export const DIRECTIONS = ['en-de', 'de-en', 'mixed'];
export const VARIANTS = ['ch', 'de']; // Swiss Hochdeutsch (ss) · German Hochdeutsch (ß)
export const GRAMMAR_POINTS = ['article-plural', 'akkusativ', 'dativ', 'genitiv', 'adjective-endings', 'perfekt', 'verb-case'];
// the grammar points that need a sentence task after the flashcard (article & plural is on the card)
const SENTENCE_POINTS = GRAMMAR_POINTS.filter((g) => g !== 'article-plural');

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
  grammar: ['article-plural', 'akkusativ', 'dativ', 'adjective-endings'],
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
    : old.sentences === false ? ['article-plural'] : DEFAULT_SETUP.grammar;
  return {
    kind: KINDS.includes(p.kind) ? p.kind : DEFAULT_SETUP.kind,
    grammarTopic: str(p.grammarTopic),
    section: str(p.section),
    list: str(p.list),
    level: LEVELS.includes(p.level) ? p.level : DEFAULT_SETUP.level,
    difficulty: DIFFICULTIES.includes(p.difficulty) ? p.difficulty : DEFAULT_SETUP.difficulty,
    questions: q >= QUESTION_MIN && q <= QUESTION_MAX ? q : DEFAULT_SETUP.questions,
    source: SOURCES.includes(p.source) ? p.source : DEFAULT_SETUP.source,
    direction: DIRECTIONS.includes(p.direction) ? p.direction : DEFAULT_SETUP.direction,
    grammar,
    variant: VARIANTS.includes(p.variant) ? p.variant : DEFAULT_SETUP.variant,
  };
}

// Vocabulary + grammar: a sentence task follows each flashcard when a case / ending / Perfekt is chosen
export const withSentences = (settings) => settings.kind === 'vocab' && (settings.grammar || []).some((g) => SENTENCE_POINTS.includes(g));

// The topic id the session practises
export function topicIdOf(setup) {
  return setup.kind === 'grammar' ? setup.grammarTopic : setup.list || setup.section;
}

// setup form → the fixed settings stored with the session (and sent to /api/chat)
export function sessionSettings(setup, topicLabel) {
  return {
    kind: setup.kind,
    topicId: topicIdOf(setup),
    topicLabel: topicLabel || '',
    level: setup.level,
    difficulty: setup.difficulty,
    questions: setup.questions,
    source: setup.source,
    direction: setup.direction,
    grammar: setup.kind === 'vocab' ? [...setup.grammar] : [],
    variant: setup.variant,
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
    grammarTopic: vocab ? base.grammarTopic : settings.topicId,
    section: vocab ? (topic?.parent || settings.topicId) : base.section,
    list: vocab ? (topic?.parent ? topic.id : null) : base.list,
  });
}
