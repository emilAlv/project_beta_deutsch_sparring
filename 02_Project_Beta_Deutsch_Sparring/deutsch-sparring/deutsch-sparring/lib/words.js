// The vocabulary knowledge base (vocab/words.json), read once on the server.
// English only. Words marked "removed" (no longer in the Word list) and words without a complete
// enrichment (no English yet, a noun without article …) are left out: they cannot be checked.
// "From the course" is a SOURCE (a filter), never a topic: the topics are sections and lists.

import fs from 'fs';
import path from 'path';
import { matchesFilter } from './scores.js';

const VOCAB_DIR = path.join(process.cwd(), 'vocab');
export const LEVELS = ['A1', 'A2', 'B1'];
export const SOURCES = ['goethe-a1', 'goethe-a2', 'goethe-b1', 'kurs'];
const GOETHE = SOURCES.filter((s) => s !== 'kurs');
const SEP = ' › ';

// The student's choice → the sources a word must have (any of them).
//   'goethe' = Goethe list · 'kurs' = From the course · 'both' (default) = every source
export function sourcesFor(choice) {
  if (choice === 'goethe') return GOETHE;
  if (choice === 'kurs') return ['kurs'];
  return SOURCES;
}

let cache = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), 'utf8'));
  } catch (e) {
    console.error(`Could not read vocab/${file}:`, e.message);
    return fallback;
  }
}

// a word we can use: current enrichment with an English meaning (and article + noun for nouns)
function usable(w) {
  const e = w.enriched;
  if (w.removed || !e || e.fp !== w.fp || !e.en) return false;
  if (e.type === 'noun' && !(e.article && e.noun)) return false;
  return Array.isArray(w.topics) && w.topics.length > 0 && LEVELS.includes(w.level);
}

// → { words, sections: [{ name, lists: [{ name }] }], byId }
function load() {
  if (cache) return cache;
  const raw = readJson('words.json', []);
  const names = readJson('lists.json', {});
  const words = (Array.isArray(raw) ? raw : []).filter(usable).map((w) => ({
    id: w.id,
    de: w.src?.de || w.id,
    type: w.enriched.type,
    en: w.enriched.en,
    article: w.enriched.article || '',
    noun: w.enriched.noun || '',
    plural: w.enriched.plural || '',
    number: w.enriched.number || '',
    adjective: w.enriched.adjective || '',
    perfekt: w.enriched.perfekt || '',
    case: w.enriched.case || '',
    note: w.enriched.note || '',
    extra: w.enriched.extra || '',
    level: w.level,
    levelEstimated: w.levelEstimated === true,
    sources: Array.isArray(w.sources) ? w.sources.filter((s) => SOURCES.includes(s)) : [],
    topics: w.topics,
  }));

  // section and list order follows the English names in lists.json (the order of the Word file)
  const sectionOrder = Object.values(names.sections || {});
  const listOrder = Object.values(names.lists || {});
  const rank = (arr, x) => (arr.includes(x) ? arr.indexOf(x) : arr.length);
  const secs = new Map();
  for (const w of words) {
    for (const t of w.topics) {
      const [sec, lst] = t.split(SEP);
      if (!sec || !lst) continue;
      if (!secs.has(sec)) secs.set(sec, new Set());
      secs.get(sec).add(lst);
    }
  }
  const sections = [...secs.entries()]
    .sort((a, b) => rank(sectionOrder, a[0]) - rank(sectionOrder, b[0]) || a[0].localeCompare(b[0]))
    .map(([name, lists]) => ({
      name,
      lists: [...lists].sort((a, b) => rank(listOrder, a) - rank(listOrder, b) || a.localeCompare(b)).map((l) => ({ name: l })),
    }));
  cache = { words, sections, byId: new Map(words.map((w) => [w.id, w])) };
  return cache;
}

export const getWords = () => load().words;

// How many words each level has in vocab/words.json → { A1: n, A2: n, B1: n } (the real numbers for the coach)
export function wordCountsByLevel() {
  const out = Object.fromEntries(LEVELS.map((lv) => [lv, 0]));
  for (const w of load().words) if (w.level in out) out[w.level] += 1;
  return out;
}
export const getWord = (id) => load().byId.get(id) || null;

// Sections → lists with English names and word counts, for the chosen level and source.
// Sections and lists without a matching word are left out.
export function listSections({ level, sources } = {}) {
  const { words, sections } = load();
  const count = (filter) => words.filter((w) => matchesFilter(w, { level, sources, ...filter })).length;
  return sections
    .map((s) => ({
      name: s.name,
      count: count({ section: s.name }),
      lists: s.lists.map((l) => ({ name: l.name, count: count({ section: s.name, list: l.name }) })).filter((l) => l.count > 0),
    }))
    .filter((s) => s.count > 0);
}

// Levels a section or list has words for (any source) – for the topic picker.
export function levelsOf({ section, list } = {}) {
  const { words } = load();
  return LEVELS.filter((level) => words.some((w) => matchesFilter(w, { level, section, list })));
}

// ---- what goes into the tutor's prompt: one compact line per word ----
export const WORD_LINE_HEADER = 'id | German | article | plural or Perfekt | English | adjective | case';

export function wordLine(w) {
  const second = w.type === 'noun'
    ? (w.number === 'pl' ? 'only plural' : w.plural || (w.number === 'sg' ? 'no plural' : ''))
    : w.perfekt;
  const de = w.type === 'noun' && w.noun ? w.noun : w.de;
  return [w.id, de, w.article, second, w.en, w.adjective, w.case]
    .map((x) => String(x || '').replace(/\s*\|\s*/g, '/').trim())
    .join(' | ');
}

// ---- word topics: the sections and lists as topic entries for the topic picker ----
// A section is a topic (all its lists); a section with several lists also gets one topic per list
// (parent = the section). Ids: "w:<section>" and "w:<section>:<list>" (lowercase slugs).
const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let topicCache = null;

// Word counts per level and word source, for the setup screen: { A1: { goethe, kurs, both }, … }
function countsFor(section, list) {
  const { words } = load();
  const out = {};
  for (const level of LEVELS) {
    out[level] = {};
    for (const choice of ['goethe', 'kurs', 'both']) {
      out[level][choice] = words.filter((w) => matchesFilter(w, { level, sources: sourcesFor(choice), section, list })).length;
    }
  }
  return out;
}

export function wordTopics() {
  if (topicCache) return topicCache;
  const all = listSections();
  const out = [];
  for (const s of all) {
    const sid = `w:${slug(s.name)}`;
    const multi = s.lists.length > 1;
    out.push({
      id: sid,
      title: multi ? `${s.name} (all lists)` : `${s.name} › ${s.lists[0].name}`,
      short: s.name,
      type: 'Wortschatz',
      levels: levelsOf({ section: s.name }),
      kind: 'words',
      section: s.name,
      list: multi ? null : s.lists[0].name,
      lists: multi ? s.lists.map((l) => l.name) : [],
      count: s.count,
      counts: countsFor(s.name, multi ? null : s.lists[0].name),
    });
    if (!multi) continue;
    for (const l of s.lists) {
      out.push({
        id: `${sid}:${slug(l.name)}`,
        title: `${s.name} › ${l.name}`,
        short: l.name,
        type: 'Wortschatz',
        levels: levelsOf({ section: s.name, list: l.name }),
        kind: 'words',
        section: s.name,
        list: l.name,
        lists: [],
        parent: sid,
        count: l.count,
        counts: countsFor(s.name, l.name),
      });
    }
  }
  // a short name used twice would be ambiguous in the chips: use the full title there
  const used = new Map();
  out.forEach((t) => used.set(t.short.toLowerCase(), (used.get(t.short.toLowerCase()) || 0) + 1));
  topicCache = out.map((t) => (used.get(t.short.toLowerCase()) > 1 ? { ...t, short: t.title } : t));
  return topicCache;
}

// topic id → { section, list } (or null when it is not a word topic)
export function wordTopicFilter(id) {
  const t = wordTopics().find((x) => x.id === id);
  return t ? { section: t.section, list: t.list } : null;
}
