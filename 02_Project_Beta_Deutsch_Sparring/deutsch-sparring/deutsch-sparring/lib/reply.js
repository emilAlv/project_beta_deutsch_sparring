// The shape of every tutor answer: the model must return this JSON, and the server cleans it
// up (normalizeReply) before the browser sees it, so the screen never has to guess.

// Values the model writes (German) → keys the app uses.
export const DIFFICULTY = { Leicht: 'easy', Mittel: 'medium', Schwer: 'hard' };
export const DIFFICULTY_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
export const EXERCISE_TYPE = {
  Rollenspiel: 'roleplay',
  'Lückentext': 'gapfill',
  'Nomen-Drill': 'noundrill',
  'Übersetzung': 'translation',
  Auswahl: 'choice',
  Satzbau: 'build',
  'Fehler finden': 'findmistake',
};
export const ERROR_TYPE = {
  Kasus: 'case',
  Artikel: 'article',
  Adjektivendung: 'ending',
  'Präposition': 'preposition',
  Verbform: 'verb',
  Wortstellung: 'wordorder',
  Wortschatz: 'vocab',
  Rechtschreibung: 'spelling',
  Andere: 'other',
};
export const LEVELS = ['A1', 'A2', 'B1'];
export const VIEWS = ['glance', 'progress', 'grammar'];

const str = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const nullableStr = (description) => str(description, { nullable: true });
const enumOf = (values, extra = {}) => ({ type: 'STRING', format: 'enum', enum: values, ...extra });

// Gemini responseSchema (OpenAPI subset).
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: str('What you say to the student: 1–3 short sentences in simple German.'),
    feedback: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        forNumber: { type: 'INTEGER' },
        correct: { type: 'BOOLEAN' },
        studentAnswer: str('The student answer exactly as written.'),
        corrected: str('The full corrected sentence (same as studentAnswer when correct).'),
        changedWords: { type: 'ARRAY', items: { type: 'STRING' } },
        explanation: str('1–2 short lines in simple German.'),
        rule: str('The grammar point in max 5 words, e.g. "Wohin? → Akkusativ".'),
        errorType: enumOf(Object.keys(ERROR_TYPE), { nullable: true }),
      },
      required: ['forNumber', 'correct', 'studentAnswer', 'corrected', 'changedWords', 'explanation', 'rule'],
      propertyOrdering: ['forNumber', 'correct', 'studentAnswer', 'corrected', 'changedWords', 'explanation', 'rule', 'errorType'],
    },
    exercise: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        number: { type: 'INTEGER' },
        total: { type: 'INTEGER' },
        speaker: nullableStr('Role-play character, e.g. "Dein Freund Marco". null for classic exercises.'),
        line: str('What the character says / the task. No quotation marks.'),
        hint: nullableStr('Depends on difficulty. null on Schwer.'),
        type: enumOf(Object.keys(EXERCISE_TYPE)),
      },
      required: ['number', 'total', 'line', 'type'],
      propertyOrdering: ['number', 'total', 'speaker', 'line', 'hint', 'type'],
    },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    panelView: enumOf(VIEWS, { nullable: true }),
    grammarFocus: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        title: str('Name of the rule, e.g. "Wechselpräpositionen".'),
        rule: str('The rule in 1–2 simple sentences.'),
        boxes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { label: str('e.g. "Wo?"'), value: str('e.g. "Dativ"'), note: str('e.g. "Position"') },
            required: ['label', 'value', 'note'],
          },
        },
        watchOut: str('One typical trap in one line.'),
      },
      required: ['title', 'rule', 'boxes', 'watchOut'],
    },
    session: {
      type: 'OBJECT',
      properties: {
        topicId: nullableStr('Id from the TOPIC CATALOG, "free" for free practice, null while not chosen.'),
        topicName: nullableStr('Short topic name, max 4 words.'),
        scenario: nullableStr('Short name of the role-play scenario, e.g. "Umzug".'),
        theme: nullableStr('One short sentence: who you play and who the student is.'),
        level: enumOf(LEVELS),
        difficulty: enumOf(Object.keys(DIFFICULTY)),
        finished: { type: 'BOOLEAN' },
      },
      required: ['level', 'difficulty', 'finished'],
    },
  },
  required: ['message', 'feedback', 'exercise', 'options', 'panelView', 'session'],
  propertyOrdering: ['message', 'feedback', 'exercise', 'options', 'panelView', 'grammarFocus', 'session'],
};

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const orNull = (v, n) => clip(v, n) || null;
const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Read the model's text as JSON. Tolerates ```json fences and text around the object.
export function parseModelJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {}
    }
  }
  return null;
}

// Broken JSON (e.g. cut off): try to rescue at least the "message" text.
export function salvageMessage(text) {
  const m = String(text || '').match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

// ctx: { level, difficulty (key), topicIds: Set, topicId } – current values sent by the browser.
export function normalizeReply(raw, ctx) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const message = clip(raw.message, 1200);

  let feedback = null;
  const f = raw.feedback;
  if (f && typeof f === 'object' && clip(f.studentAnswer, 400)) {
    const corrected = clip(f.corrected, 400) || clip(f.studentAnswer, 400);
    feedback = {
      forNumber: int(f.forNumber, 1, 50),
      correct: f.correct === true,
      studentAnswer: clip(f.studentAnswer, 400),
      corrected,
      changedWords: Array.isArray(f.changedWords) ? f.changedWords.map((w) => clip(w, 60)).filter(Boolean).slice(0, 8) : [],
      explanation: clip(f.explanation, 500),
      rule: clip(f.rule, 80),
      errorType: ERROR_TYPE[f.errorType] || null,
    };
    if (feedback.correct) feedback.errorType = null;
  }

  let exercise = null;
  const e = raw.exercise;
  if (e && typeof e === 'object' && clip(e.line, 500)) {
    const total = int(e.total, 1, 30) || 8;
    exercise = {
      number: Math.min(int(e.number, 1, 30) || 1, total),
      total,
      speaker: orNull(e.speaker, 60),
      line: clip(e.line, 500).replace(/^[„"“»«]+|[“"”«»]+$/g, ''),
      hint: orNull(e.hint, 200),
      type: EXERCISE_TYPE[e.type] || (e.speaker ? 'roleplay' : 'gapfill'),
    };
  }

  const options = Array.isArray(raw.options)
    ? [...new Set(raw.options.map((o) => clip(o, 60)).filter(Boolean))].slice(0, 6)
    : [];

  let grammarFocus = null;
  const g = raw.grammarFocus;
  if (g && typeof g === 'object' && clip(g.title, 80) && clip(g.rule, 400)) {
    grammarFocus = {
      title: clip(g.title, 80),
      rule: clip(g.rule, 400),
      boxes: (Array.isArray(g.boxes) ? g.boxes : [])
        .filter((b) => b && typeof b === 'object' && clip(b.label, 40))
        .slice(0, 3)
        .map((b) => ({ label: clip(b.label, 40), value: clip(b.value, 60), note: clip(b.note, 80) })),
      watchOut: clip(g.watchOut, 200),
    };
  }

  const s = raw.session && typeof raw.session === 'object' ? raw.session : {};
  const topicId = clip(s.topicId, 80);
  const session = {
    topicId: topicId && ctx.topicIds.has(topicId) ? topicId : ctx.topicId || null,
    topicName: orNull(s.topicName, 60),
    scenario: orNull(s.scenario, 60),
    theme: orNull(s.theme, 160),
    level: LEVELS.includes(s.level) ? s.level : ctx.level,
    difficulty: DIFFICULTY[s.difficulty] || ctx.difficulty,
    finished: s.finished === true,
  };
  // an exercise started without a topic id (model forgot it): treat it as free practice
  if (!session.topicId && exercise) session.topicId = 'free';
  if (!message && !feedback && !exercise) return null;
  return {
    message,
    feedback,
    exercise,
    options,
    panelView: VIEWS.includes(raw.panelView) ? raw.panelView : null,
    grammarFocus,
    session,
  };
}
