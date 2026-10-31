// The "Mixed review" session (review R24, finding T14): which questions it contains. Pure functions, no React, no database.
// The plan is made by the SERVER at the start (lib/../app/api/chat/route.js) and sent back to the browser, so the app knows
// the topic / word of every question (the answers are then scored for the right topic, never from what the model says).
//
// Three sources, mixed in one order:
//   1. grammar topics that are DUE (lib/scores.js topicReview: same 1 / 3 / 7 / 21 day logic as words), weakest first;
//   2. the student's own past mistakes (lib/error-log.js: the whole log, not the last 8) that carry a grammar rule or topic;
//   3. words that are DUE, from ALL word lists (lib/scores.js pickWords on the words that were practised and are due).
// A source that has too little gives its places to the others. Nothing at all to review → a warm-up on the level's first topics.
import { topicReview, pickWords, isNew, isDue } from './scores.js';

export const MIXED_TOPIC_ID = 'mixed-review';
export const SHARE_TOPICS = 0.4;
export const SHARE_MISTAKES = 0.3; // the rest (0.3) are words
export const MIXED_MAX = 20;

function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Due topics, weakest first. topics = [{ id, levels }] (only these are offered); grammarStats = { [topicId]: { n, pct, recent } }
export function dueTopics({ grammarStats = {}, topics = [], level, now = Date.now() }) {
  const out = [];
  for (const t of topics) {
    if (level && Array.isArray(t.levels) && t.levels.length && !t.levels.includes(level)) continue;
    const r = topicReview(grammarStats[t.id], now);
    if (r?.isDue) out.push({ topicId: t.id, score: r.score, due: r.due });
  }
  return out.sort((a, b) => a.score - b.score || a.due - b.due);
}

// Due words from every list: only words that were practised before and are due now, most urgent first (pickWords order)
export function dueWords({ words = [], scores = {}, level, sources, count, difficulty = 'medium', now = Date.now(), rand = Math.random }) {
  const pool = words.filter((w) => !isNew(scores[w.id]) && isDue(scores[w.id], now));
  const query = { words: pool, scores, level, sources, count, difficulty, now, rand };
  const got = pickWords(query);
  return got.length ? got : pickWords({ ...query, level: undefined }); // nothing at this level: the other levels
}

// → [{ kind: 'grammar', topicId } | { kind: 'mistake', topicId, rule, studentAnswer, corrected, question } | { kind: 'word', wordId }]
export function buildReviewPlan({
  grammarStats = {}, errors = [], words = [], scores = {}, topics = [], level, sources, total = 10, difficulty = 'medium', now = Date.now(), rand = Math.random,
}) {
  const n = Math.max(0, Math.min(MIXED_MAX, Math.floor(Number(total) || 0)));
  const known = new Set(topics.map((t) => t.id));
  const due = dueTopics({ grammarStats, topics, level, now });
  // mistakes: those about a grammar rule / topic (a plain word mistake comes back through the due words)
  const mistakes = (errors || []).filter((e) => (e.rule || (e.topicId && known.has(e.topicId))) && !(e.wordId && !e.rule));
  const wordPool = dueWords({ words, scores, level, sources, count: n, difficulty, now, rand });

  const want = { topics: Math.round(n * SHARE_TOPICS), mistakes: Math.round(n * SHARE_MISTAKES) };
  want.words = n - want.topics - want.mistakes;
  const have = { topics: due.length ? n : 0, mistakes: mistakes.length, words: wordPool.length };
  const take = { topics: Math.min(want.topics, have.topics), mistakes: Math.min(want.mistakes, have.mistakes), words: Math.min(want.words, have.words) };
  // places nobody filled go to whoever still has more to give (topics can always repeat, a topic has many questions)
  let free = n - take.topics - take.mistakes - take.words;
  for (const k of ['mistakes', 'words', 'topics']) {
    const add = Math.min(free, have[k] - take[k]);
    if (add > 0) { take[k] += add; free -= add; }
  }

  const items = [];
  for (let i = 0; i < take.topics; i += 1) items.push({ kind: 'grammar', topicId: due[i % due.length].topicId });
  for (const e of mistakes.slice(0, take.mistakes)) {
    items.push({ kind: 'mistake', topicId: e.topicId || '', rule: e.rule, studentAnswer: e.studentAnswer, corrected: e.corrected, question: e.question });
  }
  for (const w of wordPool.slice(0, take.words)) items.push({ kind: 'word', wordId: w.id });

  if (!items.length) {
    // nothing to review yet: a warm-up on the first topics of the level
    const start = topics.filter((t) => !level || !t.levels?.length || t.levels.includes(level)).slice(0, 3);
    for (let i = 0; i < n && start.length; i += 1) items.push({ kind: 'grammar', topicId: start[i % start.length].id, warmup: true });
  }
  return mixedOrder(items, rand);
}

// Mixed order: shuffled, but never the same kind three times in a row where it can be avoided
export function mixedOrder(items, rand = Math.random) {
  const left = shuffled(items, rand);
  const out = [];
  while (left.length) {
    const last = out.at(-1);
    const prev = out.at(-2);
    let i = 0;
    if (last && prev && last.kind === prev.kind) {
      const other = left.findIndex((x) => x.kind !== last.kind);
      if (other >= 0) i = other;
    }
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

// which topic an answer to question n belongs to (the browser scores with it); '' for a word question
export const topicOfItem = (plan, n) => {
  const it = Array.isArray(plan) ? plan[n - 1] : null;
  return it && it.kind !== 'word' ? it.topicId || '' : '';
};

// A plan that comes back from the browser (it keeps the plan of its session and sends it with every request): short plain
// values only. The text of a mistake goes to the tutor inside the fenced student-data block, never as an instruction.
export function cleanReviewPlan(raw) {
  const id = (x, max) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  return (Array.isArray(raw) ? raw : []).slice(0, MIXED_MAX).map((it) => {
    if (it?.kind === 'word') return { kind: 'word', wordId: id(it.wordId, 120) };
    if (it?.kind === 'mistake') {
      return { kind: 'mistake', topicId: id(it.topicId, 80), rule: id(it.rule, 80), studentAnswer: id(it.studentAnswer, 300), corrected: id(it.corrected, 300), question: id(it.question, 300) };
    }
    return { kind: 'grammar', topicId: id(it?.topicId, 80) };
  });
}
