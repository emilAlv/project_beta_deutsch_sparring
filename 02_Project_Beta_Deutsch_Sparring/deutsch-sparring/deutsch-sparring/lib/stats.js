// Numbers for the panel and the end-of-session card. Always computed by the app from the
// answers it saw – never taken from the model.

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
const SHORT = 38;
const clip = (s, n = SHORT) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const CASES = ['Nominativ', 'Akkusativ', 'Dativ', 'Genitiv'];

// Why an answer was wrong, as a key for the summary: 'case:Genitiv' (the case named in the rule) or the error type.
function reasonOf(a) {
  const kase = CASES.find((c) => (a.rule || '').includes(c));
  if (kase) return `case:${kase}`;
  return a.errorType || 'other';
}

// An answer about a grammar rule: not skipped, has a rule, is no flashcard and no mistake in the word itself.
export const isGrammarAnswer = (a) => !a.skipped && Boolean(a.rule) && a.qType !== 'flashcard' && a.task !== 'flashcard'
  && !(a.wordId && (a.errorType === 'vocab' || a.errorType === 'article'));

// Everything the summary screen shows, worked out from the answers the app saw (never from the model).
// → { words: { known: [label], repeat: [{ label, reason }] } | null,
//     questions: { right: [text], repeat: [{ label, reason }] },   (used when the session has no words)
//     grammar: [{ rule, right, total }], minutes }
export function summaryDetails(session) {
  const answers = session.answers || [];
  const labels = new Map((session.words || []).map((w) => [w.id, w.label || w.id]));
  const byWord = new Map();
  for (const a of answers) {
    if (!a.wordId || a.skipped) continue;
    const w = byWord.get(a.wordId) || { label: labels.get(a.wordId) || a.wordId, ok: true, reason: '' };
    if (!a.correct) {
      if (w.ok) w.reason = reasonOf(a);
      w.ok = false;
    }
    byWord.set(a.wordId, w);
  }
  const words = byWord.size
    ? {
      known: [...byWord.values()].filter((w) => w.ok).map((w) => w.label),
      repeat: [...byWord.values()].filter((w) => !w.ok).map((w) => ({ label: w.label, reason: w.reason })),
    }
    : null;

  const seen = new Set();
  const once = (k) => (seen.has(k) ? false : seen.add(k));
  const questions = { right: [], repeat: [] };
  for (const a of answers) {
    if (a.skipped) continue;
    const text = clip(String(a.question || a.line || a.corrected || '').replace(/\s+/g, ' ').trim());
    if (!text || !once(`${a.correct}:${text}`)) continue;
    if (a.correct) questions.right.push(text);
    else questions.repeat.push({ label: text, reason: reasonOf(a) });
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
