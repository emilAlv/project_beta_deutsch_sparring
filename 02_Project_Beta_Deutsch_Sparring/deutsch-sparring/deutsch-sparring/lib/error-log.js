// The student's error log (review R24, finding T14): every wrong answer, newest first. ONE helper for everybody who
// needs "what did this student get wrong": "Repeat my mistakes", the Coach and the Mixed review.
//  - logged in: the rows come from the answers table (lib/progress.js errorLog) → errorLogFromAnswers;
//  - accounts off: the browser keeps its own list (wort_errlog, lib/storage.js) → cleanErrorLog / addToErrorLog.
// An entry: { studentAnswer, corrected, rule, question, topicId, wordId, t }. Pure functions: no React, no fs, no database.
export const ERROR_LOG_MAX = 100;
const TOPIC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const line = (x, max) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// one entry from anything (a database row, a browser entry, the body of a request) – or null when it says nothing
export function cleanErrorEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const corrected = line(raw.corrected, 300);
  const rule = line(raw.rule, 80);
  const topicId = typeof raw.topicId === 'string' && TOPIC_ID.test(raw.topicId) ? raw.topicId : '';
  if (!corrected && !rule) return null; // old answers whose text was trimmed and that name no rule: nothing to repeat
  return {
    studentAnswer: line(raw.studentAnswer, 300),
    corrected,
    rule,
    question: line(raw.question, 300),
    topicId,
    wordId: line(raw.wordId, 120),
    t: Number(raw.t) || 0,
  };
}

// the same mistake twice (same correct sentence, or – without one – the same rule and question) counts once
const keyOf = (e) => (e.corrected ? e.corrected.toLocaleLowerCase('de') : `${e.rule}|${e.question}`.toLocaleLowerCase('de'));

// any list → cleaned, newest first, each mistake once, at most `max`
export function cleanErrorLog(raw, max = ERROR_LOG_MAX) {
  const seen = new Set();
  const out = [];
  const list = (Array.isArray(raw) ? raw.slice(0, ERROR_LOG_MAX * 3) : []).map(cleanErrorEntry).filter(Boolean);
  for (const e of list.sort((a, b) => b.t - a.t)) {
    const k = keyOf(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

// answers: [{ studentAnswer, corrected, rule, question, topicId, wordId, correct, skipped, t }] in any order.
// Only wrong answers count; a skipped question is not a mistake.
export const errorLogFromAnswers = (answers, max = ERROR_LOG_MAX) =>
  cleanErrorLog((Array.isArray(answers) ? answers : []).filter((a) => a && a.correct !== true && a.skipped !== true), max);

// browser: add one mistake on top of the stored list → the new list (kept at ERROR_LOG_MAX)
export const addToErrorLog = (log, entry, max = ERROR_LOG_MAX) => cleanErrorLog([{ ...entry, t: Number(entry?.t) || Date.now() }, ...(Array.isArray(log) ? log : [])], max);

// Lists in order of priority (this session's mistakes first, then the stored log) → one list, each mistake once.
// The first list wins when a mistake is in several; the order of each list is kept (newest first).
export function mergeErrorLogs(lists, max = ERROR_LOG_MAX) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of (Array.isArray(list) ? list : []).map(cleanErrorEntry).filter(Boolean)) {
      const k = keyOf(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= max) return out;
    }
  }
  return out;
}

// what "Repeat my mistakes" and the tutor's RECENT MISTAKES list show: the newest few, three fields each
export const mistakesForTutor = (log, max = 8) =>
  (Array.isArray(log) ? log : []).slice(0, max).map(({ studentAnswer, corrected, rule }) => ({ studentAnswer, corrected, rule }));
