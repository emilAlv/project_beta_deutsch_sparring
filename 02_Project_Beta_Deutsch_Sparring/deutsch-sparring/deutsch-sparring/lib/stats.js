// Numbers for the panel and the end-of-session card. Always computed by the app from the
// answers it saw – never taken from the model.

export function score(answers) {
  return { answered: answers.length, correct: answers.filter((a) => a.correct).length };
}

// One entry per task: 'right' | 'wrong' | 'skipped' | 'current' | 'todo'
export function taskStates(session) {
  const total = session.total || 8;
  const current = session.exercise?.number || null;
  const byNumber = new Map(session.answers.map((a) => [a.n, a]));
  const reached = Math.max(current || 0, ...session.answers.map((a) => a.n), 0);
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const a = byNumber.get(n);
    if (a) return a.correct ? 'right' : 'wrong';
    if (n === current && !session.finished) return 'current';
    if (n < reached || session.finished) return 'skipped';
    return 'todo';
  });
}

export function tasksDone(session) {
  return taskStates(session).filter((s) => s === 'right' || s === 'wrong' || s === 'skipped').length;
}

export function headlineKey({ answered, correct }) {
  if (!answered) return 'headline_none';
  const r = correct / answered;
  if (r === 1) return 'headline_perfect';
  if (r >= 0.75) return 'headline_strong';
  if (r >= 0.5) return 'headline_good';
  return 'headline_keep';
}

// "How you're doing": one row per grammar rule the tutor named, newest first.
export function ruleRows(answers, max = 4) {
  const rows = new Map();
  for (const a of [...answers].reverse()) {
    const rule = a.rule || '';
    if (!rule) continue;
    const row = rows.get(rule) || { rule, ok: true, count: 0 };
    row.ok = row.ok && a.correct;
    row.count += 1;
    rows.set(rule, row);
  }
  return [...rows.values()].slice(0, max);
}
