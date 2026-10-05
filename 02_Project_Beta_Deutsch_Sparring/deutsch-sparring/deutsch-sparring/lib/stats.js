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
