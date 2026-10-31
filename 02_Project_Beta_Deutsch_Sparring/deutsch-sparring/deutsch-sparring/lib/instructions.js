// What the student has to type for a question – written by the APP from the exercise type, the direction and the
// parts the card tests (exercise.checks), never by the AI. So the student only has to find the German, never guess
// what is asked. → a key + values for t() (lib/ui-text.js), e.g. { key: 'do_de_en_article' }.
export function instructionFor(ex) {
  if (!ex || !ex.type) return null;
  const checks = Array.isArray(ex.checks) ? ex.checks : ['meaning'];
  if (ex.type === 'flashcard') {
    if (ex.direction === 'de-en') return { key: checks.includes('article') ? 'do_de_en_article' : 'do_de_en' };
    if (checks.includes('plural')) return { key: 'do_en_de_plural' };
    if (checks.includes('article')) return { key: 'do_en_de_article' };
    return { key: 'do_en_de' };
  }
  const known = ['gapfill', 'choice', 'translation', 'build', 'findmistake', 'noundrill'];
  return known.includes(ex.type) ? { key: `do_${ex.type}` } : null;
}
