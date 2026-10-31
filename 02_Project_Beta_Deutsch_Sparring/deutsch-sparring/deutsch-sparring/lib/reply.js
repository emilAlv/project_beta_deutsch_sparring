// The shape of every tutor answer: the model must return this JSON, and the server cleans it
// up (normalizeReply) before the browser sees it, so the screen never has to guess.

// Values the model writes (German) → keys the app uses.
export const DIFFICULTY = { Leicht: 'easy', Mittel: 'medium', Schwer: 'hard' };
export const DIFFICULTY_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
export const EXERCISE_TYPE = {
  Karteikarte: 'flashcard',
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
const WORD_ERROR_KEYS = [ERROR_TYPE.Artikel, ERROR_TYPE.Wortschatz]; // 'article', 'vocab'
export const TASKS = ['flashcard', 'grammar']; // which score a word task is for (lib/scores.js)
import { LEVELS, str, nullableStr, enumOf } from './schema-helpers.js';
export { LEVELS };
export const VIEWS = ['glance', 'progress', 'grammar'];


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
        explanation: str('Right answer: 1 short line (a memory tip or nothing). Wrong answer: one short memory tip ("Merke: …") or an empty string – the explanation itself goes into why.'),
        why: {
          type: 'OBJECT',
          nullable: true,
          description: 'Only for a WRONG answer (null when correct): the explanation in three clear steps, simple German, one short sentence each.',
          properties: {
            mistake: str('What exactly is wrong, quoted: «kleines» → «kleine».'),
            rule: str('The general rule in one sentence, with the pattern: "Nach der/die/das endet das Adjektiv im Akkusativ Singular (feminin, neutral) auf -e."'),
            here: str('The rule applied to THIS sentence, step by step: "das Baby = neutral · Objekt von tragen = Akkusativ → das kleine Baby."'),
          },
          required: ['mistake', 'rule', 'here'],
          propertyOrdering: ['mistake', 'rule', 'here'],
        },
        rule: str('The grammar point in max 5 words, always the same wording for the same point, e.g. "Genitiv nach wegen", "Wechselpräposition Wo? (Dativ)", "Perfekt mit sein". For a mistake in the word or its article: an empty string (the word is not a grammar rule).'),
        errorType: enumOf(Object.keys(ERROR_TYPE), {
          nullable: true,
          description: 'null when correct. Artikel / Wortschatz = the word or its article was wrong (counts for the vocabulary score). Kasus / Adjektivendung / Verbform / Präposition / Wortstellung = a grammar mistake.',
        }),
        parts: {
          type: 'OBJECT',
          nullable: true,
          description: 'Flashcards only (null for sentence tasks and everything else): which PART of the card was right. The app scores each part on its own.',
          properties: {
            meaning: { type: 'BOOLEAN', description: 'The word itself / its meaning was right.' },
            article: { type: 'BOOLEAN', nullable: true, description: 'The article was right. null when the card did not ask for it or the word was wrong.' },
            plural: { type: 'BOOLEAN', nullable: true, description: 'The plural was right. null when the card did not ask for it or the word was wrong.' },
          },
          required: ['meaning'],
          propertyOrdering: ['meaning', 'article', 'plural'],
        },
      },
      required: ['forNumber', 'correct', 'studentAnswer', 'corrected', 'changedWords', 'explanation', 'rule'],
      propertyOrdering: ['forNumber', 'correct', 'studentAnswer', 'corrected', 'changedWords', 'explanation', 'why', 'rule', 'errorType', 'parts'],
    },
    exercise: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        number: { type: 'INTEGER' },
        type: enumOf(Object.keys(EXERCISE_TYPE)),
        direction: enumOf(['en-de', 'de-en'], { nullable: true, description: 'Flashcards only: English → German or German → English.' }),
        line: str('The task: a sentence with ___, the word on the flashcard, words to build a sentence … No quotation marks.'),
        answer: str('Private reference answer for hint-safety validation. For a gap fill, give only the missing text; for open production, give the shortest complete natural reference answer. Never copy it into the hint.'),
        hint: nullableStr('Depends on difficulty. null on Schwer.'),
        wordId: nullableStr('Vocabulary topics: the id of the word this question is about, copied exactly from the WORDS list. null for grammar topics.'),
        task: enumOf(TASKS, { nullable: true, description: 'Vocabulary topics: "flashcard" for a flashcard, "grammar" for a sentence task with the word.' }),
      },
      required: ['number', 'type', 'line', 'answer'],
      propertyOrdering: ['number', 'type', 'direction', 'line', 'answer', 'hint', 'wordId', 'task'],
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
        level: enumOf(LEVELS),
        difficulty: enumOf(Object.keys(DIFFICULTY)),
        finished: { type: 'BOOLEAN', description: 'true only when the student wants to stop now.' },
      },
      required: ['level', 'difficulty', 'finished'],
    },
  },
  required: ['message', 'feedback', 'exercise', 'options', 'panelView', 'session'],
  propertyOrdering: ['message', 'feedback', 'exercise', 'options', 'panelView', 'grammarFocus', 'session'],
};

import { cleanRule } from './rules.js';
import { resolveParts, testedChecks, PARTS } from './scores.js';

const ARTICLE = /^(der|die|das)\s/i;
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const orNull = (v, n) => clip(v, n) || null;
const comparable = (v) => clip(v, 500)
  .toLocaleLowerCase('de')
  .replace(/ß/g, 'ss')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
export function hintRevealsAnswer(hint, answer) {
  const h = comparable(hint);
  const a = comparable(answer);
  return Boolean(h && a && ` ${h} `.includes(` ${a} `));
}
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
// Also works when the answer stops inside the message (no closing quote).
export function salvageMessage(text) {
  const m = String(text || '').match(/"message"\s*:\s*"((?:[^"\\]|\\[\s\S])*)("?)/);
  if (!m) return null;
  let body = m[1];
  if (!m[2]) body = body.replace(/\\(u[0-9a-fA-F]{0,3})?$/, ''); // cut inside an escape like \u00
  try {
    const out = JSON.parse(`"${body}"`);
    return out.trim() ? out.trim() : null;
  } catch {
    return body.trim() ? body : null;
  }
}

// ---------- grammar focus must not give away the open question ----------
// The focus card stays on screen while a question is open. If its text contains the open flashcard's answer
// (e.g. boxes "das Baby / die Babys" while the card "the baby" is open), the example boxes are hidden; if the
// title, rule or trap contains it too, the whole focus is hidden. The student's browser never gets the answer,
// so this is checked here on the server.
const SMALL_WORDS = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'mit', 'the']);
const wordsOf = (v) => comparable(v).split(' ').filter((w) => w.length >= 3 && !SMALL_WORDS.has(w));
const textOf = (...parts) => new Set(parts.flatMap(wordsOf));
const focusIntro = (g) => textOf(g.title, g.rule, g.watchOut);
const focusBoxes = (g) => textOf(...(g.boxes || []).flatMap((b) => [b.label, b.value, b.note]));
const sharesWord = (set, answer) => wordsOf(answer).some((w) => set.has(w));
export const focusRevealsAnswer = (g, answer) => Boolean(g) && (sharesWord(focusIntro(g), answer) || sharesWord(focusBoxes(g), answer));
// → the focus without the solution: same focus, no example boxes · null (nothing safe left) · the focus itself when it was fine
export function hideSolutionInFocus(g, answer) {
  if (!g || !focusRevealsAnswer(g, answer)) return g;
  if (sharesWord(focusIntro(g), answer)) return null;
  return { ...g, boxes: [] };
}

export function cleanFocus(g) {
  if (!g || typeof g !== 'object' || !clip(g.title, 80) || !clip(g.rule, 400)) return null;
  return {
    title: clip(g.title, 80),
    rule: clip(g.rule, 400),
    boxes: (Array.isArray(g.boxes) ? g.boxes : [])
      .filter((b) => b && typeof b === 'object' && clip(b.label, 40))
      .slice(0, 3)
      .map((b) => ({ label: clip(b.label, 40), value: clip(b.value, 60), note: clip(b.note, 80) })),
    watchOut: clip(g.watchOut, 200),
  };
}

// ctx: { level, difficulty (key), topicIds: Set, topicId, wordIds?: Set, openTask? } – current values sent by the browser.
// openTask = the task of the question being answered ('flashcard' | 'grammar'), if the browser knows it.
// openChecks = the parts that question tests (lib/scores.js testedChecks; default: meaning only) – feedback.parts has exactly these.
// wordById = Map(word id -> word-list entry): lets a new question say which parts it tests (exercise.checks).
// wordIds = the ids of the words picked for this session; a wordId outside this set is dropped.
// focus = the grammar focus the browser shows now (cleaned): hidden when the new open flashcard's answer is in it.
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
      // only real grammar rule names count; a word such as "der Schrank" becomes null (lib/rules.js)
      rule: cleanRule(clip(f.rule, 80), ctx.topicId),
      errorType: ERROR_TYPE[f.errorType] || null,
    };
    // the three-step explanation of a wrong answer (what is wrong · the rule · in this sentence); never for a right one
    const why = !feedback.correct && f.why && typeof f.why === 'object'
      ? { mistake: clip(f.why.mistake, 200), rule: clip(f.why.rule, 300), here: clip(f.why.here, 300) } : null;
    feedback.why = why && (why.mistake || why.rule || why.here) ? why : null;
    if (feedback.correct) feedback.errorType = null;
    // a wrong flashcard is always a mistake in the word or its article, never "grammar" (lib/scores.js)
    else if (ctx.openTask === 'flashcard' && !WORD_ERROR_KEYS.includes(feedback.errorType)) feedback.errorType = 'vocab';
    // a flashcard: which part was right (meaning, article, plural), only the parts this card tested. The tutor's
    // booleans are used when they are there; else it is worked out from errorType / rule (lib/scores.js resolveParts).
    if (ctx.openTask === 'flashcard') {
      const all = resolveParts(f.parts, feedback);
      const tested = Array.isArray(ctx.openChecks) && ctx.openChecks.length ? ctx.openChecks : ['meaning'];
      feedback.parts = Object.fromEntries(PARTS.filter((p) => tested.includes(p)).map((p) => [p, all[p]]));
      // the verdict follows EXACTLY what the card asked (its instruction is built from the same parts, lib/instructions.js):
      // a part the card did not ask for (e.g. the plural on Medium) can never make the answer wrong, and a part it
      // asked for always counts. The student never has to guess what is required.
      const ok = Object.values(feedback.parts).every(Boolean);
      if (ok && !feedback.correct) {
        feedback.correct = true;
        feedback.errorType = null;
        feedback.why = null;
      } else if (!ok && feedback.correct) {
        feedback.correct = false;
        feedback.errorType = feedback.parts.meaning === false ? 'vocab' : feedback.parts.article === false ? 'article' : 'vocab';
      }
    }
  }

  // the number is only a hint: the app counts the questions itself
  let exercise = null;
  let openAnswer = ''; // private: only used to keep the grammar focus from giving it away
  const e = raw.exercise;
  if (e && typeof e === 'object' && clip(e.line, 500)) {
    const type = EXERCISE_TYPE[e.type] || 'gapfill';
    const answer = clip(e.answer, 500);
    let hint = orNull(e.hint, 200);
    // A missing private answer cannot prove a hint safe. New model replies always contain one;
    // deterministic/demo replies populate it too.
    if (!answer || hintRevealsAnswer(hint, answer)) hint = null;
    exercise = {
      number: int(e.number, 1, 99),
      type,
      direction: type === 'flashcard' && ['en-de', 'de-en'].includes(e.direction) ? e.direction : null,
      line: clip(e.line, 500).replace(/^[„"“»«]+|[“"”«»]+$/g, ''),
      hint,
    };
    if (type === 'flashcard' && !exercise.direction) exercise.direction = ARTICLE.test(exercise.line) ? 'de-en' : 'en-de';
    if (type === 'flashcard' && exercise.direction === 'en-de') openAnswer = answer;
    // vocabulary: which word, and which score the answer counts for (optional; old replies have neither)
    const wordId = clip(e.wordId, 120);
    if (wordId && ctx.wordIds?.has(wordId)) {
      exercise.wordId = wordId;
      // a card is always the "flashcard" task, every other exercise type is a "grammar" task with the word
      exercise.task = type === 'flashcard' ? 'flashcard' : 'grammar';
      // which parts answering it tests (Easy: the word, Medium: + article, Hard: + plural; lib/scores.js)
      exercise.checks = testedChecks({ task: exercise.task, word: ctx.wordById?.get(wordId) || null, difficulty: ctx.difficulty, direction: exercise.direction });
    }
  }

  const options = Array.isArray(raw.options)
    ? [...new Set(raw.options.map((o) => clip(o, 60)).filter(Boolean))].slice(0, 6)
    : [];

  let grammarFocus = cleanFocus(raw.grammarFocus);
  let focusHidden = false;
  if (openAnswer) {
    // a new focus, or the one already on screen (it stays visible while the new card is open)
    const shown = grammarFocus || cleanFocus(ctx.focus);
    const safe = hideSolutionInFocus(shown, openAnswer);
    if (safe !== shown) {
      focusHidden = !safe;
      grammarFocus = safe || null;
    }
  }

  const s = raw.session && typeof raw.session === 'object' ? raw.session : {};
  let topicId = clip(s.topicId, 80);
  if (topicId && !ctx.topicIds.has(topicId)) {
    // a slightly wrong id ("lektion-02-wohnen") → the catalog entry it obviously means
    topicId = [...ctx.topicIds].find((id) => id !== 'free' && (id.startsWith(topicId) || topicId.startsWith(id.slice(0, 10)))) || topicId;
  }
  const session = {
    topicId: topicId && ctx.topicIds.has(topicId) ? topicId : ctx.topicId || null,
    topicName: orNull(s.topicName, 60),
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
    ...(focusHidden ? { focusHidden: true } : {}),
    session,
  };
}
