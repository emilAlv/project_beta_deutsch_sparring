// What counts as a GRAMMAR RULE name (feedback.rule). Only the names listed in lib/curriculum.js (ruleNames) and
// lib/grammar.js (RULES) – so a word such as "der Schrank" is never counted as a grammar gap (review T13).
// No React, no fs: runs in the browser, on the server and in scripts.
import { CURRICULUM, curriculumEntry } from './curriculum.js';
import { RULES } from './grammar.js';

const key = (s) => String(s ?? '').toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();

const CASE = { akkusativ: 'Akkusativ', dativ: 'Dativ', genitiv: 'Genitiv' };
const PREP = /^(akkusativ|dativ|genitiv) nach ([\p{L}/]+)$/u; // "<Kasus> nach <Präposition>" (RULES.prep)

// key → exact spelling used by the stats (so "dativ nach MIT " and "Dativ nach mit" are grouped)
const ALL = new Map();
for (const v of Object.values(RULES)) if (typeof v === 'string') ALL.set(key(v), v);
for (const e of CURRICULUM) for (const r of e.ruleNames) if (!ALL.has(key(r))) ALL.set(key(r), r);

// → the exact rule name, or null when the text is not a grammar rule (a word, empty, unknown wording)
export function cleanRule(raw, topicId = null) {
  const k = key(raw);
  if (!k) return null;
  const topic = topicId ? curriculumEntry(topicId) : null;
  const own = topic?.ruleNames.find((r) => key(r) === k); // the session topic's names first
  if (own) return own;
  if (ALL.has(k)) return ALL.get(k);
  const m = k.match(PREP);
  return m ? RULES.prep(CASE[m[1]], String(raw).trim().split(/\s+/).slice(2).join(' ')) : null;
}

export const isRuleName = (raw) => cleanRule(raw) !== null;

// The curriculum topic an answer belongs to: the session's own topic if it is a curriculum topic, otherwise the
// lowest-level topic whose ruleNames contain the rule (settles "Perfekt mit sein", shared by two topics). Or null.
export function topicForRule(rule, sessionTopicId = null) {
  if (sessionTopicId && curriculumEntry(sessionTopicId)) return sessionTopicId;
  const r = cleanRule(rule);
  if (!r) return null;
  return CURRICULUM.find((e) => e.ruleNames.includes(r))?.id || null; // CURRICULUM is in level order A1 → B1
}
