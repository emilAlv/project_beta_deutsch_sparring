// All topics the app offers (server side): grammar lessons (content/*.md) and the vocabulary
// sections / lists (vocab/words.json). Both have the same shape, so the screen treats them alike.

import { listLessons } from './content';
import { wordTopics } from './words';

export function allTopics() {
  const words = wordTopics().map((t) => ({ ...t, keywords: `${t.title} ${t.section} ${t.list || ''}`.toLowerCase() }));
  return [...listLessons(), ...words];
}
