// All topics the app offers (server side): the grammar curriculum (lib/curriculum.js), the extra grammar lessons (content/*.md) and the vocabulary
// sections / lists (vocab/words.json). Both have the same shape, so the screen treats them alike.

import { listLessons } from './content.js';
import { wordTopics } from './words.js';
import { curriculumTopics } from './curriculum.js';

export function allTopics() {
  const words = wordTopics().map((t) => ({ ...t, keywords: `${t.title} ${t.section} ${t.list || ''}`.toLowerCase() }));
  // grammar: the curriculum (lib/curriculum.js, by level) first, then the extra lesson files in /content
  return [...curriculumTopics(), ...listLessons(), ...words];
}
