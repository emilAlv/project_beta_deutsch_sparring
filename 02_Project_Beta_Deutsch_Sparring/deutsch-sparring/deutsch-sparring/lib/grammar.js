// The grammar points a student can choose for vocabulary sessions ("each word with its grammar"),
// and the fixed names of the grammar rules the tutor reports in feedback.rule, so the stats can
// group mistakes. No React, no browser APIs: used by the browser, the server and the demo tutor.

export const GRAMMAR_POINTS = ['akkusativ', 'dativ', 'genitiv', 'adjective-endings', 'perfekt', 'verb-case'];

export const GRAMMAR_LABELS = {
  akkusativ: 'Akkusativ',
  dativ: 'Dativ',
  genitiv: 'Genitiv',
  'adjective-endings': 'Adjective endings',
  perfekt: 'Perfekt (verbs)',
  'verb-case': 'Verb + case',
};

// the cases among the points (in this order)
export const CASE_POINTS = { akkusativ: 'Akkusativ', dativ: 'Dativ', genitiv: 'Genitiv' };

// A list from the browser or from a stored setting → only known points, no duplicates, in the fixed order.
// Not an array → null (= "not given").
export function cleanGrammar(raw) {
  if (!Array.isArray(raw)) return null;
  return GRAMMAR_POINTS.filter((p) => raw.includes(p));
}

// Do the chosen points ask for sentence tasks after the flashcard? Any chosen point does. (The old "article-plural"
// point is gone: the article and the plural now follow the difficulty, lib/scores.js.)
export const wantsSentenceTasks = (grammar) => (grammar || []).length > 0;

// The names of the grammar rules (feedback.rule). Always these exact words, so the same point is grouped.
export const RULES = {
  plural: 'Plural',
  nounAkk: 'Nomengruppe im Akkusativ',
  nounDat: 'Nomengruppe im Dativ',
  nounGen: 'Nomengruppe im Genitiv',
  akkBrauchen: 'Akkusativ nach brauchen',
  akkIn: 'Akkusativ nach in (Wohin?)',
  datMit: 'Dativ nach mit',
  datIn: 'Dativ nach in (Wo?)',
  genWegen: 'Genitiv nach wegen',
  genTrotz: 'Genitiv nach trotz',
  endingDefinite: 'Adjektivendung nach der/die/das',
  endingIndefinite: 'Adjektivendung nach ein/eine',
  perfektHaben: 'Perfekt mit haben',
  perfektSein: 'Perfekt mit sein',
  verbAkk: 'Verb + Akkusativ',
  verbDat: 'Verb + Dativ',
  // verbs with a preposition: "<Kasus> nach <Präposition>", e.g. "Akkusativ nach auf"
  prep: (kase, prep) => `${kase} nach ${prep}`,
};
