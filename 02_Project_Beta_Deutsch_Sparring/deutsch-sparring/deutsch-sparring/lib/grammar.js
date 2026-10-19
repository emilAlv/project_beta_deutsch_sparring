// The grammar points a student can choose for vocabulary sessions ("each word with its grammar"),
// and the fixed names of the grammar rules the tutor reports in feedback.rule, so the stats can
// group mistakes. No React, no browser APIs: used by the browser, the server and the demo tutor.

export const GRAMMAR_POINTS = ['article-plural', 'akkusativ', 'dativ', 'genitiv', 'adjective-endings', 'perfekt', 'verb-case'];

export const GRAMMAR_LABELS = {
  'article-plural': 'Article & plural',
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

// Do the chosen points ask for sentence tasks after the flashcard? ("article & plural" alone does not:
// it only adds the plural to the flashcard.)
export const wantsSentenceTasks = (grammar) => (grammar || []).some((p) => p !== 'article-plural');

// The names of the grammar rules (feedback.rule). Always these exact words, so the same point is grouped.
export const RULES = {
  plural: 'Plural',
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
