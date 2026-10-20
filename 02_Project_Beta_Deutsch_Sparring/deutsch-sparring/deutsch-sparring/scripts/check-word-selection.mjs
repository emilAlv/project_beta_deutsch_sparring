import { pickWords } from '../lib/scores.js';

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 20);
const words = Array.from({ length: 20 }, (_, i) => ({ id: `word-${i}`, level: 'A1', sources: ['goethe-a1'], topics: ['Travel › Core'] }));
const rec = (s, due, last = now - DAY) => ({ v: { s, k: 1, due }, last });
const scores = {
  'word-0': rec(3, now + DAY), // answered correctly recently: weak, but not due yet
  'word-1': rec(2, now - DAY), // difficult and due
  'word-2': rec(4, now - DAY), // difficult and due
  'word-3': rec(8, now + 3 * DAY), // almost learnt: reinforcement
  'word-4': rec(9, now + 7 * DAY), // almost learnt: reinforcement
  'word-5': rec(10, now + 21 * DAY), // mastered and not due
};

const args = { words, scores, level: 'A1', sources: ['goethe-a1'], section: 'Travel', count: 8, now, seed: 'session-a' };
const picked = pickWords(args);
const ids = picked.map((w) => w.id);
check('difficult due words are selected', ids.includes('word-1') && ids.includes('word-2'));
check('nearly learnt words are included for reinforcement', ids.includes('word-3') || ids.includes('word-4'));
check('a correctly answered word is not repeated before it is due when alternatives exist', !ids.includes('word-0'));
check('a mastered word is not checked before it is due when alternatives exist', !ids.includes('word-5'));
check('selection is stable for a retried request in the same session', ids.join('|') === pickWords(args).map((w) => w.id).join('|'));
check('a new session seed changes the ordering of equal-priority words', ids.join('|') !== pickWords({ ...args, seed: 'session-b' }).map((w) => w.id).join('|'));

const repeated = pickWords({ ...args, avoidFirstWordId: ids[0] });
check('a repeated setup does not open with the previous first word', repeated[0].id !== ids[0]);
check('moving the opener does not discard a difficult word', repeated.some((w) => w.id === ids[0]));

const nextSession = pickWords({
  ...args,
  seed: 'session-b',
  recentWordIds: ids,
  avoidFirstWordId: ids[0],
});
check('the entire sequence changes for the next matching session', nextSession.map((w) => w.id).join('|') !== ids.join('|'));
check('sequence variation still keeps the difficult due words', ['word-1', 'word-2'].every((id) => nextSession.some((w) => w.id === id)));
const firstNew = ids.filter((id) => !scores[id]);
const nextNew = nextSession.map((w) => w.id).filter((id) => !scores[id]);
check('the next session prefers different new material', nextNew.some((id) => !firstNew.includes(id)));

process.exit(failed ? 1 : 0);

