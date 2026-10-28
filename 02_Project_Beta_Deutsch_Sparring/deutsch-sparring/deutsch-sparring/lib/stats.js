// Numbers for the panel and the end-of-session card. Always computed by the app from the
// answers it saw – never taken from the model.
import { compareAnswer } from './diff.js';
import { levelKinds, hasScore, PART_KIND, PARTS } from './scores.js';

// done = questions used (incl. skipped) · answered = really answered · correct · skipped
export function score(answers) {
  const skipped = answers.filter((a) => a.skipped).length;
  return {
    done: answers.length,
    answered: answers.length - skipped,
    correct: answers.filter((a) => a.correct).length,
    skipped,
  };
}

// THE score rule: every place that shows a session's score (summary, side panel, recent sessions, Home tiles, the
// closing card in the chat, the coach line) uses this one line, e.g. "1 of 3 answered right · 1 skipped".
// sc = { correct, answered, skipped } (answered = really answered, skipped questions are NOT in it); tr = the t() function.
export function scoreLine(sc, tr) {
  const correct = sc?.correct || 0;
  const answered = sc?.answered || 0;
  const skipped = sc?.skipped || 0;
  const base = answered ? tr('scoreLine', { correct, answered }) : tr('scoreLineNone');
  return skipped ? `${base} · ${tr('scoreSkipped', { n: skipped })}` : base;
}

// One entry per question: 'right' | 'wrong' | 'skipped' | 'current' | 'todo'
export function taskStates(session) {
  const total = session.total || 10;
  const open = session.exercise && !session.finished ? session.answers.length + 1 : null;
  return Array.from({ length: total }, (_, i) => {
    const a = session.answers[i];
    if (a) return a.skipped ? 'skipped' : a.correct ? 'right' : 'wrong';
    if (i + 1 === open) return 'current';
    return 'todo';
  });
}

// The two examples under "From your conversation": a corrected mistake first, then a right answer.
// A card that is open again (the same word) must not show its own earlier answer: its solution would be on screen.
// The browser does not know the open card's solution, so every example of the open card's word is hidden
// (the server does the same check on the focus box, lib/reply.js focusRevealsAnswer / hideSolutionInFocus).
export function conversationExamples(session) {
  const openWord = session.exercise?.wordId || '';
  const usable = (session.answers || []).filter((a) => !(openWord && a.wordId === openWord));
  const wrong = [...usable].reverse().find((a) => !a.correct && !a.skipped);
  const right = [...usable].reverse().find((a) => a.correct);
  return [wrong, right].filter(Boolean).slice(0, 2);
}

// ---------- "Repeat my mistakes" ----------
// The chip only exists when this session has a mistake (a wrong answer; a skipped question is not a mistake).
export const hasMistakes = (answers) => (answers || []).some((a) => !a.skipped && !a.correct);
export const isRepeatRequest = (text) => /^\s*(repeat my mistakes|wiederhole meine fehler)/i.test(String(text || ''));

// What the app sends with the chip: the mistakes of THIS session (newest first, each wrong question once) with the
// grammar rule and, for a vocabulary card, the word. words = session.words ({ id, label }).
export function mistakeList(answers, words = [], max = 8) {
  const label = new Map((words || []).map((w) => [w.id, w.label]));
  const seen = new Set();
  const out = [];
  for (const a of [...(answers || [])].reverse()) {
    if (a.skipped || a.correct) continue;
    const key = `${a.wordId || ''}|${a.rule || ''}|${a.corrected || a.studentAnswer || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ studentAnswer: a.studentAnswer || '', corrected: a.corrected || '', rule: a.rule || '', word: (a.wordId && label.get(a.wordId)) || '' });
  }
  return out.slice(0, max);
}

export function headlineKey({ answered, correct }) {
  if (!answered) return 'headline_none';
  const r = correct / answered;
  if (r === 1) return 'headline_perfect';
  if (r >= 0.75) return 'headline_strong';
  if (r >= 0.5) return 'headline_good';
  return 'headline_keep';
}

// "How you're doing": one row per grammar rule / word the tutor named, newest first.
export function ruleRows(answers, max = 4) {
  const rows = new Map();
  for (const a of [...answers].reverse()) {
    const rule = a.skipped ? '' : a.rule || '';
    if (!rule) continue;
    const row = rows.get(rule) || { rule, ok: true, count: 0 };
    row.ok = row.ok && a.correct;
    row.count += 1;
    rows.set(rule, row);
  }
  return [...rows.values()].slice(0, max);
}

export function summaryOf(session) {
  return { ...score(session.answers), total: session.total, ended: session.endedEarly, states: taskStates({ ...session, exercise: null, finished: true }) };
}

// ---------- the session summary screen ----------
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const CASES = ['Nominativ', 'Akkusativ', 'Dativ', 'Genitiv'];

// Why an answer was wrong, as a key for the summary: 'case:Genitiv' or the error type.
// The case is taken from the rule name only when exactly ONE case is in it ("Dativ oder Akkusativ" names two: no guess).
export function reasonOf(a) {
  const found = CASES.filter((c) => (a.rule || '').includes(c));
  if (found.length === 1) return `case:${found[0]}`;
  return a.errorType || 'other';
}

// An answer about a grammar rule: not skipped, has a rule, is no flashcard and no mistake in the word itself.
export const isGrammarAnswer = (a) => !a.skipped && Boolean(a.rule) && a.qType !== 'flashcard' && a.task !== 'flashcard'
  && !(a.wordId && (a.errorType === 'vocab' || a.errorType === 'article'));

// The score parts of one word for the summary, e.g. [{ part: 'meaning', s: 7 }, { part: 'article', s: 4 }]: only the
// scores that matter on this session's level (lib/scores.js levelKinds) and that the student has. rec = the stored record.
function partScores(word, rec, difficulty) {
  if (!rec) return [];
  const kinds = levelKinds(word, difficulty);
  return PARTS.filter((p) => kinds.includes(PART_KIND[p]) && hasScore(rec, PART_KIND[p]))
    .map((p) => ({ part: p, s: rec[PART_KIND[p]].s }));
}

// Everything the summary screen shows, worked out from the answers the app saw (never from the model).
// scores (optional) = the stored word records: adds the per-part word scores to the words.
// -> { words: { known: [{ label, parts }], repeat: [{ label, reason, parts }] } | null,
//      questions: { right: [{ label }], repeat: [{ label, reason, skipped, fix, solution }] },   (used when the session has no words)
//      grammar: [{ rule, right, total }], minutes }
// A repeat question: label = the whole question · fix = the corrected sentence as segments (changed word marked) ·
// skipped = the question was skipped · solution = the solution of a skipped question ('' = the app does not have it).
export function summaryDetails(session, scores = null) {
  const answers = session.answers || [];
  const info = new Map((session.words || []).map((w) => [w.id, w]));
  const difficulty = session.settings?.difficulty || 'medium';
  const byWord = new Map();
  for (const a of answers) {
    if (!a.wordId) continue;
    const w = byWord.get(a.wordId) || { id: a.wordId, label: info.get(a.wordId)?.label || a.wordId, ok: true, reason: '' };
    if (a.skipped) {
      if (w.ok) w.reason = 'skipped';
      w.ok = false;
    } else if (!a.correct) {
      if (w.ok || w.reason === 'skipped') w.reason = reasonOf(a);
      w.ok = false;
    }
    byWord.set(a.wordId, w);
  }
  const withParts = (w) => ({ label: w.label, ...(w.ok ? {} : { reason: w.reason }), parts: partScores(info.get(w.id), scores?.[w.id], difficulty) });
  const words = byWord.size
    ? {
      known: [...byWord.values()].filter((w) => w.ok).map(withParts),
      repeat: [...byWord.values()].filter((w) => !w.ok).map(withParts),
    }
    : null;

  const seen = new Set();
  const once = (k) => (seen.has(k) ? false : seen.add(k));
  const questions = { right: [], repeat: [] };
  for (const a of answers) {
    const text = oneLine(a.question || a.line || a.skippedLine || a.corrected);
    if (!text) continue;
    if (a.skipped) {
      if (once(`skip:${text}`)) questions.repeat.push({ label: text, reason: 'skipped', skipped: true, solution: oneLine(a.corrected), fix: null });
    } else if (a.correct) {
      if (once(`true:${text}`)) questions.right.push({ label: text });
    } else if (once(`false:${text}`)) {
      const fix = a.corrected ? compareAnswer(a.studentAnswer, a.corrected, a.changedWords || []).corrected : null;
      questions.repeat.push({ label: text, reason: reasonOf(a), skipped: false, fix, solution: '' });
    }
  }

  const rules = new Map();
  for (const a of answers) {
    if (!isGrammarAnswer(a)) continue;
    const r = rules.get(a.rule) || { rule: a.rule, right: 0, total: 0 };
    r.total += 1;
    r.right += a.correct ? 1 : 0;
    rules.set(a.rule, r);
  }

  const minutes = session.startedAt && session.endedAt ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000)) : null;
  return { words, questions, grammar: [...rules.values()], minutes };
}
