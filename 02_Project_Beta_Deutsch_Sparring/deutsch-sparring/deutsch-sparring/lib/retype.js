// "Retype the correction": after a WRONG answer the student types the right answer before the next question appears.
// The APP checks it (no AI call). The retype is practice only – it never changes a score, an answer or a count.
// Pure functions, no React, no browser APIs.
//   retypeTarget({ exercise, feedback }) → { accept: [string, …], show, extras, deEn } | null   what counts as right (null = nothing to retype)
//   checkRetype(target, text)            → { ok, missing: [word], extra: [word] }
//   retypeShow(target)                   → the text the student is asked to type, e.g. «der Pass»
//   retypeIsShort(target)                → true when that text is short enough to be named in the instruction line

import { sameAnswer } from './variants.js';

export const MAX_TRIES = 2; // after this many failed retypes the «Continue» button appears
export const SHORT_TARGET = 60; // longer targets (whole sentences) are not named in the instruction line

const ARTICLE = /^(der|die|das)$/i;
const OPEN_QUOTES = /^[«»„“”"'‹›]+/;
const CLOSE_QUOTES = /[«»„“”"'‹›]+$/;

// Text → comparable words: surrounding quotes and final punctuation off, the separators «,» «–» «-» (with spaces)
// between article+noun and plural count as spaces, spaces collapsed. (Case and ß/ss are handled when comparing.)
export function normalize(s) {
  return String(s ?? '')
    .replace(/[,;]/g, ' ')
    .replace(/\s[–—-]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(OPEN_QUOTES, '')
    .replace(CLOSE_QUOTES, '')
    .replace(/[.!?…:]+$/, '')
    .replace(CLOSE_QUOTES, '')
    .trim();
}

const words = (s) => normalize(s).split(' ').filter(Boolean);
const key = (w) => w.toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, '');
const dedupe = (list) => [...new Set(list.map((x) => x.trim()).filter(Boolean))];
const stripArticle = (s) => normalize(s).replace(/^(der|die|das)\s+/i, '');

// ---------- what is expected ----------
// German card (English → German). feedback.corrected is "die Lampe, die Lampen" (possibly "… – lamp" as information).
// Returns the accepted answers and the text to show ("die Lampe, die Lampen" when the plural is part of the check).
function germanCard(corrected, checks) {
  const parts = String(corrected || '').split(/\s*,\s*|\s[–—-]\s/).map((x) => x.trim()).filter(Boolean);
  const single = parts[0] || '';
  const plural = parts[1] && ARTICLE.test(parts[1].split(' ')[0]) ? parts[1] : '';
  const noun = stripArticle(single);
  if (checks.includes('plural') && plural) {
    return { accept: dedupe([`${single} ${plural}`, `${single} ${stripArticle(plural)}`]), show: `${single}, ${plural}` };
  }
  if (checks.includes('article')) return { accept: dedupe([single]), show: single };
  return { accept: dedupe([noun, single]), show: single }; // the word only: the article is shown but does not count
}

// English meaning (German → English). corrected is "lamp" or "die Lampe – lamp"; several meanings: "a / b".
function englishCard(corrected) {
  const text = String(corrected || '');
  const tail = /\s[–—-]\s/.test(text) ? text.split(/\s[–—-]\s/).slice(1).join(' ') : text;
  const meanings = tail.split(/\s*[/;,]\s*/).map((m) => m.replace(/^(the|a|an|to)\s+/i, '').trim());
  return dedupe(meanings);
}

// Gap fill: the missing word(s) = what stands where the "___" is in the corrected sentence.
// show = the missing word(s) when there is a gap, else the whole sentence.
function gapFill(line, corrected) {
  const pieces = String(line || '').replace(/\([^)]*\)/g, ' ').split(/_{2,}/); // a hint like "(sein)" is not part of the sentence
  const full = normalize(corrected);
  if (pieces.length < 2) return { accept: [full], show: full };
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = pieces.map((p) => esc(p.trim()).replace(/\s+/g, '\\s+')).join('\\s*(.+?)\\s*');
  const m = new RegExp(`^\\s*${pattern}\\s*$`, 'iu').exec(String(corrected || '').trim());
  const fill = m ? m.slice(1).map((x) => normalize(x)).filter(Boolean).join(' ') : '';
  return { accept: dedupe([full, fill]), show: fill || full };
}

export function retypeTarget({ exercise, feedback } = {}) {
  const corrected = String(feedback?.corrected || '').trim();
  if (!corrected || !feedback || feedback.correct !== false) return null;
  let accept;
  let show;
  let extras = []; // words of the correction that may be added to the expected answer (see withShownExtras)
  if (exercise?.type === 'flashcard') {
    const checks = Array.isArray(exercise.checks) && exercise.checks.length ? exercise.checks : ['meaning'];
    if (exercise.direction === 'de-en') {
      accept = englishCard(corrected);
      show = accept[0];
    } else {
      ({ accept, show } = germanCard(corrected, checks));
      extras = words(corrected).map(key); // «die Pässe» next to «der Pass», as shown in the correction
    }
  } else if (exercise?.type === 'gapfill') {
    ({ accept, show } = gapFill(exercise.line, corrected));
  } else {
    accept = dedupe([normalize(corrected)]);
    show = accept[0];
  }
  accept = accept.filter(Boolean);
  return accept.length
    ? { accept, show: show || accept[0], extras, deEn: exercise?.type === 'flashcard' && exercise.direction === 'de-en' }
    : null;
}

// The text the student is asked to type (the first accepted answer, e.g. «der Pass»).
export function retypeShow(target) {
  return String(target?.show || target?.accept?.[0] || '');
}

// Short targets are named in the instruction line ("Type «der Pass» to continue."); long ones get a generic line.
export function retypeIsShort(target) {
  const text = retypeShow(target);
  return Boolean(text) && text.length <= SHORT_TARGET;
}

// ---------- the check ----------
// German → English: a leading article / «the» / «to» in the answer is not held against the student.
const prepare = (text, target) => {
  const n = normalize(text);
  return target.deEn ? n.replace(/^(der|die|das)\s+/i, '').replace(/^(the|a|an|to)\s+/i, '') : n;
};

// The expected answer plus words that are part of the correction shown ("der Pass" + "die Pässe"): accepted.
// Any other extra word still fails, and so does a wrong spelling of the extra part ("die Passe").
function withShownExtras(mine, target) {
  if (!target.extras?.length) return false;
  const allowed = new Set(target.extras);
  return target.accept.some((a) => {
    const pool = words(mine).map(key);
    for (const w of words(a)) {
      const at = pool.indexOf(key(w));
      if (at < 0) return false;
      pool.splice(at, 1);
    }
    return pool.length > 0 && pool.every((k) => allowed.has(k));
  });
}

export function checkRetype(target, text) {
  const mine = prepare(text, target);
  if (!mine) return { ok: false, missing: [], extra: [] };
  if (target.accept.some((a) => sameAnswer(mine, a)) || withShownExtras(mine, target)) return { ok: true, missing: [], extra: [] };
  // what is still different: against the closest accepted answer
  const mineWords = words(mine);
  let best = null;
  for (const a of target.accept) {
    const pool = mineWords.map(key);
    const missing = [];
    words(a).forEach((w) => {
      const at = pool.indexOf(key(w));
      if (at >= 0) pool.splice(at, 1);
      else missing.push(w);
    });
    const score = missing.length + pool.length;
    if (!best || score < best.score) best = { score, missing, extra: mineWords.filter((w) => pool.includes(key(w))) };
  }
  return { ok: false, missing: best.missing, extra: best.extra };
}
