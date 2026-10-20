import { mergeQuestions, practiceKey, recentQuestions, recentWordHistory, sessionQuestions } from '../lib/question-history.js';

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}

const settings = {
  kind: 'grammar',
  topicId: 'g-a2-dativ-akkusativ-objekte',
  topicLabel: 'Dativ und Akkusativ',
  level: 'A2',
  difficulty: 'medium',
  direction: 'en-de',
  grammar: ['dativ', 'akkusativ'],
  variant: 'ch',
};
const previous = {
  id: 'old',
  topicId: settings.topicId,
  settings,
  questions: ['Im Büro: Gib ___ Kollegen die Mappe. (der)', 'Wen fragst du nach dem Weg?'],
  wordIds: ['abfahren', 'ankommen'],
};
const current = {
  id: 'new',
  topicId: settings.topicId,
  settings: { ...settings, questions: 20 },
  answers: [{ line: 'Im Restaurant: Bring ___ Gast die Rechnung. (der)' }],
  exercise: { line: 'Was schenkst du deiner Freundin?' },
};

const asked = recentQuestions(current, [previous]);
check('a repeated setup remembers questions from the previous session', asked.includes(previous.questions[0]));
check('the current session contributes answered questions', asked.includes(current.answers[0].line));
check('the open question stays repeatable for hints and rule explanations', !asked.includes(current.exercise.line));
check('changing only the question count keeps the same practice history', practiceKey(previous) === practiceKey(current));
check('a different difficulty does not contaminate the exclusion list', recentQuestions({ ...current, settings: { ...settings, difficulty: 'hard' } }, [previous]).length === 1);
check('questions are de-duplicated and bounded', mergeQuestions(Array(60).fill('Dieselbe Frage')).length === 1);
check('sessionQuestions includes a question that is still open', sessionQuestions(current).at(-1) === current.exercise.line);
check('matching sessions expose their recent word order', recentWordHistory(current, [previous]).first === 'abfahren');

process.exit(failed ? 1 : 0);
