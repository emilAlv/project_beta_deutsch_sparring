const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
const identity = (value) => clean(value).toLocaleLowerCase('de');

function uniqueQuestions(lines) {
  const seen = new Set();
  return lines.map(clean).filter((line) => {
    const key = identity(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Question count is deliberately excluded: changing a 10-question session to 20 questions
// must not make the tutor forget that it already used the same exercises.
export function practiceKey(session = {}) {
  const settings = session.settings || {};
  return JSON.stringify({
    topicId: session.topicId || settings.topicId || '',
    topicLabel: settings.topicLabel || '',
    kind: settings.kind || '',
    level: settings.level || '',
    difficulty: settings.difficulty || '',
    source: settings.source || '',
    direction: settings.direction || '',
    grammar: [...(Array.isArray(settings.grammar) ? settings.grammar : [])].sort(),
    variant: settings.variant || 'ch',
  });
}

function answeredQuestions(session = {}) {
  return (Array.isArray(session.answers) ? session.answers : [])
    .map((answer) => answer?.line || answer?.skippedLine || answer?.question);
}

// Includes the open question so ending a session does not make that already-seen task available again.
export function sessionQuestions(session = {}) {
  return uniqueQuestions([...answeredQuestions(session), session.exercise?.line]).slice(-50);
}

export function recentQuestions(session = {}, sessions = []) {
  const key = practiceKey(session);
  const previous = (Array.isArray(sessions) ? sessions : [])
    .filter((older) => older?.id !== session.id && practiceKey(older) === key)
    .slice(0, 5)
    .reverse()
    .flatMap((older) => Array.isArray(older.questions) ? older.questions : []);
  // Do not add the currently open question here: a hint or rule explanation must repeat it.
  return uniqueQuestions([...previous, ...answeredQuestions(session)]).slice(-50);
}

export function recentWordHistory(session = {}, sessions = []) {
  const key = practiceKey(session);
  const matching = (Array.isArray(sessions) ? sessions : [])
    .filter((older) => older?.id !== session.id && practiceKey(older) === key)
    .slice(0, 5);
  const ids = [];
  const seen = new Set();
  for (const older of matching) {
    for (const id of Array.isArray(older.wordIds) ? older.wordIds : []) {
      const cleanId = String(id || '').slice(0, 120);
      if (!cleanId || seen.has(cleanId)) continue;
      seen.add(cleanId);
      ids.push(cleanId);
    }
  }
  return { ids: ids.slice(0, 120), first: String(matching[0]?.wordIds?.[0] || '').slice(0, 120) };
}

export function mergeQuestions(...lists) {
  return uniqueQuestions(lists.flat()).slice(-50);
}
