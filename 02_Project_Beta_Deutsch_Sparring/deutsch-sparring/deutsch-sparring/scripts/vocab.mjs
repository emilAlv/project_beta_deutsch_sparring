// Vocabulary knowledge base: import Emilio's MASTERLIST (.docx), track changes between versions,
// and hand only new or changed words to a model for enrichment.
// No packages needed. Run from the app folder:
//
//   node scripts/vocab.mjs import vocab/sources/MASTERLIST_..._v11.docx   read a new version + write todo batches
//   node scripts/vocab.mjs merge                                         check + merge filled batches
//   node scripts/vocab.mjs status                                        counts and problems
//
// Every word has sources (goethe-a1/a2/b1, kurs), a level (A1/A2/B1) and at least one topic; see vocab/README.md.
// Data lives in vocab/words.json (one word per line, English only). See vocab/README.md.
// Emilio's Spanish meanings are used only to write the temporary batches in vocab/todo/;
// words.json keeps just their fingerprint (fp).

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

const ROOT = path.join(process.cwd(), 'vocab');
const WORDS = path.join(ROOT, 'words.json');
const TODO = path.join(ROOT, 'todo');
const CHANGES = path.join(ROOT, 'changes');
const LISTS = path.join(ROOT, 'lists.json');
const BATCH_SIZE = 80;

export const TYPES = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'number', 'name', 'phrase', 'other'];
const LEVELS = { A1: 'A1', A2: 'A2', B1: 'B1', 'AUS DEM KURS': 'Kurs', KURS: 'Kurs' };
// The level column of the Word file mixes level and source: "Kurs" = shown by the teacher.
export const SOURCES = ['goethe-a1', 'goethe-a2', 'goethe-b1', 'kurs'];
const CEFR = ['A1', 'A2', 'B1'];
const OTHER_TOPIC = 'Other words › Other words'; // when no existing list fits a course-only word

// ---------- reading the .docx (a zip file with word/document.xml inside) ----------

function unzipEntry(file, wanted) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a .docx (zip) file');
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in ${file}`);
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) =>
  decode((xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>/g) || []).map((t) => (t === '<w:tab/>' ? ' ' : t.replace(/<[^>]+>/g, ''))).join(''));
const paragraphs = (xml) => (xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(textOf).filter((t) => t.trim());

// Returns the blocks of the document in order: { heading } or { table: [[cell, …], …] }.
function readDocx(file) {
  const xml = unzipEntry(file, 'word/document.xml');
  const body = xml.slice(xml.indexOf('<w:body>'));
  const blocks = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(body))) {
    const part = m[0];
    if (part.startsWith('<w:tbl>')) {
      const rows = (part.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []).map((tr) =>
        (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) => paragraphs(tc).join(' / ').replace(/\s+/g, ' ').trim()),
      );
      blocks.push({ table: rows });
    } else if (/<w:pStyle w:val="(Heading|berschrift|Titre|Título)\d?"/i.test(part)) {
      blocks.push({ heading: textOf(part).trim() });
    }
  }
  return blocks;
}

// ---------- turning rows into entries ----------

const clean = (s) => String(s || '').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
const stripIcons = (s) => clean(s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ''));
const EMPTY = /^[—–-]?$/;

// English names of the sections and lists (vocab/lists.json: Spanish name from the Word file → English).
function loadListNames() {
  return JSON.parse(fs.readFileSync(LISTS, 'utf8'));
}

// "SECTION › List" (Spanish, as in the Word file) → English. Unknown names are collected in `missing`.
function englishTopic(topic, names, missing) {
  const [section, list] = topic.split(' › ');
  const parts = [];
  for (const [name, table] of [[section, names.sections], [list, names.lists]]) {
    if (name == null) continue;
    if (table[name]) parts.push(table[name]);
    else missing.add(name);
  }
  return parts.join(' › ');
}

// What goes into words.json: no Spanish.
const withoutEs = ({ es, ...rest }) => rest;

// Identity of a word: lowercase, without dictionary suffixes (", -n", ", Pässe"), notes in brackets
// or a trailing "...". Keeps the article, so "der See" and "die See" stay different words.
export function keyOf(de) {
  return clean(de)
    .toLowerCase()
    .split('/')
    .map((part) =>
      part
        .replace(/\([^)]*\)/g, ' ')
        .replace(/,.*$/, '')
        .replace(/\.{2,}|…/g, '')
        .replace(/[?!.]+$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' / ');
}

const norm = (s) => clean(s).toLowerCase().replace(/[.,;:!?¿¡()"']/g, '').replace(/\s+/g, ' ').trim();
// "die Pässe", "Pässe" → "pässe"; "Sg.", "—", "(Sg.)" → ""; "abgefahren (s)" stays as it is (the "s" matters)
const normSecond = (s) => {
  const x = clean(s).toLowerCase();
  if (/^(sg\.?|pl\.?|—|–|-|)$/.test(x)) return '';
  return x.replace(/^die\s+/, '').replace(/\s+/g, ' ');
};
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function rowsOf(blocks, sourceSections = {}) {
  const rows = [];
  let section = '';
  for (const b of blocks) {
    if (b.heading) {
      section = stripIcons(b.heading);
      continue;
    }
    let list = '';
    let header = null;
    for (const cells of b.table) {
      if (cells.filter(Boolean).length === 1 && !header) {
        list = stripIcons(cells.find(Boolean));
        continue;
      }
      if (!header) {
        header = cells;
        continue;
      }
      const [de, second, es, level] = cells;
      if (!clean(de)) continue;
      const lv = LEVELS[clean(level).toUpperCase()] || clean(level);
      if (![...CEFR, 'Kurs'].includes(lv)) throw new Error(`Unknown level "${clean(level)}" for "${clean(de)}" (expected A1, A2, B1 or Kurs)`);
      const sources = new Set([lv === 'Kurs' ? 'kurs' : `goethe-${lv.toLowerCase()}`]);
      // a section that is a source (not a topic), e.g. AUS DEM KURS: its words get that source and no topic
      const isSource = sourceSections[section];
      if (isSource) sources.add(isSource);
      rows.push({
        sources: [...sources],
        isSource: !!isSource,
        de: clean(de),
        second: EMPTY.test(clean(second)) ? '' : clean(second),
        es: clean(es),
        level: lv,
        topic: isSource ? '' : [section, list].filter(Boolean).join(' › '),
      });
    }
  }
  return rows;
}

// The fields Emilio controls. If any of them changes, the word is enriched again.
const sourceFingerprint = (src) => hash(JSON.stringify([keyOf(src.de), normSecond(src.second), norm(src.es), src.level]));

// ---------- the knowledge base file ----------

function loadWords() {
  if (!fs.existsSync(WORDS)) return [];
  return JSON.parse(fs.readFileSync(WORDS, 'utf8'));
}

function saveWords(words) {
  words.sort((a, b) => a.id.localeCompare(b.id, 'de'));
  fs.writeFileSync(WORDS, `[\n${words.map((w) => JSON.stringify(w)).join(',\n')}\n]\n`);
}

const needsEnrichment = (w) => !w.removed && (!w.enriched || w.enriched.fp !== w.fp);

const sortSources = (set) => SOURCES.filter((x) => set.has(x));
const goetheLevels = (w) => (w.sources || []).filter((x) => x.startsWith('goethe-')).map((x) => x.slice(7).toUpperCase());
const validEnriched = (w) => w.enriched && w.enriched.fp === w.fp;
const hasOwnTopics = (w) => (w.topics || []).length > 0 && !w.topicsEstimated;

// Words with a Goethe source: level = their (lowest) Goethe level.
// Course-only words: level and, if the word is in no real topic, topic come from the estimate kept in `enriched`
// (valid only while enriched.fp equals fp, like all enrichment – so it is done once and survives weekly imports).
export function derive(w) {
  const g = goetheLevels(w);
  if (g.length) {
    w.level = CEFR.find((l) => g.includes(l));
    delete w.levelEstimated;
  } else {
    const l = validEnriched(w) && w.enriched.level;
    if (CEFR.includes(l)) {
      w.level = l;
      w.levelEstimated = true;
    } else {
      delete w.level;
      delete w.levelEstimated;
    }
  }
  if (!hasOwnTopics(w)) {
    const t = validEnriched(w) && w.enriched.topics;
    if (Array.isArray(t) && t.length) {
      w.topics = t;
      w.topicsEstimated = true;
    } else {
      w.topics = [];
      delete w.topicsEstimated;
    }
  }
}

// Course-only words (no Goethe source) need an estimated level. Words that sit in no real topic (they are only in
// the course section of the Word file) need a best-fitting topic, whatever their source.
const needsLevel = (w) => !w.removed && !goetheLevels(w).length;
const needsTopics = (w) => !w.removed && !hasOwnTopics(w);
const needsEstimate = (w) =>
  !needsEnrichment(w) && ((needsLevel(w) && !CEFR.includes(w.enriched.level)) || (needsTopics(w) && !(w.enriched.topics || []).length));

// Every "Section › List" that real (Word-file) topics use, plus the fallback list.
function allowedTopics(words) {
  const set = new Set([OTHER_TOPIC]);
  for (const w of words) if (hasOwnTopics(w)) w.topics.forEach((t) => set.add(t));
  return set;
}

// ---------- commands ----------

function importDocx(file, versionArg) {
  if (!file || !fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const version = versionArg || (path.basename(file).match(/v(\d+)/i) || [])[0]?.toLowerCase();
  if (!version) throw new Error('Cannot tell the version from the file name; add it: import <file> v11');
  const names = loadListNames();
  const rows = rowsOf(readDocx(file), names.sourceSections || {});
  if (rows.length < 50) throw new Error(`Only ${rows.length} rows found – is the table layout still the same?`);
  const missingNames = new Set();
  for (const r of rows) if (r.topic) r.topic = englishTopic(r.topic, names, missingNames);
  if (missingNames.size)
    throw new Error(`No English name yet in vocab/lists.json for: ${[...missingNames].map((n) => `"${n}"`).join(', ')}. Add them (sections or lists) and run import again.`);

  // group duplicates (the same word in several lists)
  const incoming = new Map();
  for (const r of rows) {
    const id = keyOf(r.de);
    if (!id) continue;
    const e = incoming.get(id);
    if (!e) incoming.set(id, { src: { de: r.de, second: r.second, es: r.es, level: r.level }, topics: r.topic ? [r.topic] : [], sources: new Set(r.sources), others: [] });
    else {
      r.sources.forEach((x) => e.sources.add(x));
      if (r.topic && !e.topics.includes(r.topic)) e.topics.push(r.topic);
      // only a different level or plural/Partizip is a real conflict; other Spanish wording is just kept
      if (r.level !== e.src.level || normSecond(r.second) !== normSecond(e.src.second)) e.others.push({ de: r.de, second: r.second, es: r.es, level: r.level });
      else if (norm(r.es) !== norm(e.src.es) && !e.src.es.includes(r.es)) e.src.es = `${e.src.es} / ${r.es}`;
    }
  }

  const words = loadWords();
  const byId = new Map(words.map((w) => [w.id, w]));
  const report = { added: [], changed: [], moved: [], removed: [], back: [], conflicts: [] };

  for (const [id, inc] of incoming) {
    const fp = sourceFingerprint(inc.src);
    const old = byId.get(id);
    if (inc.others.length) report.conflicts.push(`${inc.src.de}: ${[inc.src, ...inc.others].map((s) => `${s.second || '—'} · ${s.es} · ${s.level}`).join('  ≠  ')}`);
    if (!old) {
      const w = { id, src: withoutEs(inc.src), topics: inc.topics, sources: sortSources(inc.sources), fp, since: version };
      if (inc.others.length) w.variants = inc.others.map(withoutEs);
      words.push(w);
      byId.set(id, w);
      derive(w);
      report.added.push(inc.src.de);
      continue;
    }
    if (old.removed) {
      delete old.removed;
      report.back.push(inc.src.de);
    }
    if (old.fp !== fp) report.changed.push(`${old.src.de} (${old.src.second || '—'} · ${old.src.level}) → ${inc.src.de} (${inc.src.second || '—'} · ${inc.src.es} · ${inc.src.level})`);
    if (inc.topics.length && JSON.stringify(old.topics) !== JSON.stringify(inc.topics)) report.moved.push(inc.src.de);
    old.src = withoutEs(inc.src);
    old.topics = inc.topics;
    delete old.topicsEstimated; // derive() puts the estimated topic back if the word has no real one
    old.sources = sortSources(inc.sources);
    old.fp = fp;
    if (inc.others.length) old.variants = inc.others.map(withoutEs);
    else delete old.variants;
    derive(old);
  }
  for (const w of words) {
    if (!incoming.has(w.id) && !w.removed) {
      w.removed = version;
      report.removed.push(w.src.de);
    }
  }
  saveWords(words);
  const spanish = new Map([...incoming].map(([id, inc]) => [id, inc]));

  fs.mkdirSync(CHANGES, { recursive: true });
  const list = (title, items, note = '') =>
    `## ${title} (${items.length})${note}\n${items.length ? items.map((x) => `- ${x}`).join('\n') : '- none'}\n`;
  const md = [
    `# Changes in ${version}`,
    `Source: \`${path.basename(file)}\` · ${rows.length} rows · ${incoming.size} different words · ${words.filter((w) => !w.removed).length} words active in total\n`,
    list('New words', report.added),
    list('Changed by Emilio (enriched again)', report.changed),
    list('Removed from the list (kept, hidden)', report.removed),
    list('Back in the list', report.back),
    list('Same word written differently in two places', report.conflicts, ' – please make them the same'),
    `Moved to another list only: ${report.moved.length} (no new work needed)\n`,
  ].join('\n');
  fs.writeFileSync(path.join(CHANGES, `${version}.md`), md);

  console.log(`Imported ${version}: ${rows.length} rows, ${incoming.size} words.`);
  console.log(`  new ${report.added.length} · changed ${report.changed.length} · removed ${report.removed.length} · back ${report.back.length} · conflicts ${report.conflicts.length} · moved ${report.moved.length}`);
  console.log(`  report: vocab/changes/${version}.md`);
  writeBatches(words, spanish);
}

// Batches are the only place where Emilio's Spanish meaning is written out; they are deleted after `merge`.
function writeBatches(words, spanish) {
  const pending = words.filter(needsEnrichment);
  const estimates = words.filter(needsEstimate); // enriched course-only words that still need a level / topic
  fs.mkdirSync(TODO, { recursive: true });
  const already = new Set(
    fs.readdirSync(TODO).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(TODO, f), 'utf8')).map((x) => `${x.id}#${x.fp}`)),
  );
  const fresh = pending.filter((w) => !already.has(`${w.id}#${w.fp}`));
  const unknown = fresh.filter((w) => !spanish.has(w.id));
  if (unknown.length) throw new Error(`${unknown.length} words need enrichment but are not in this Word file (e.g. ${unknown[0].id}). Import the version they came from again.`);
  let n = fs.readdirSync(TODO).filter((f) => /^batch-\d+\.json$/.test(f)).length;
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const items = fresh.slice(i, i + BATCH_SIZE).map((w) => {
      const { src, others } = spanish.get(w.id);
      return { id: w.id, fp: w.fp, de: src.de, second: src.second, es: src.es, level: src.level, ...(others.length ? { also: others.map((v) => `${v.second || '—'} · ${v.es} · ${v.level}`) } : {}), ...(needsLevel(w) ? { needsLevel: true } : {}), ...(needsTopics(w) ? { needsTopics: true } : {}), out: null };
    });
    const name = `batch-${String(++n).padStart(3, '0')}.json`;
    fs.writeFileSync(path.join(TODO, name), `[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);
  }
  // estimate batches: no Spanish needed, `en` is enough to judge level and topic
  const freshEst = estimates.filter((w) => !already.has(`${w.id}#${w.fp}`));
  for (let i = 0; i < freshEst.length; i += BATCH_SIZE) {
    const items = freshEst.slice(i, i + BATCH_SIZE).map((w) => ({
      kind: 'estimate', id: w.id, fp: w.fp, de: w.src.de, second: w.src.second, en: w.enriched.en,
      ...(needsLevel(w) ? { needsLevel: true } : {}), ...(needsTopics(w) ? { needsTopics: true } : {}), out: null,
    }));
    const name = `batch-${String(++n).padStart(3, '0')}.json`;
    fs.writeFileSync(path.join(TODO, name), `[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);
  }
  const files = fs.readdirSync(TODO).filter((f) => f.endsWith('.json'));
  console.log(`  ${pending.length} words need enrichment; ${fresh.length} newly put into batches. ${estimates.length} course-only words need a level/topic estimate; ${freshEst.length} newly put into batches. Batches waiting: ${files.length ? files.join(', ') : 'none'}`);
}

// level / topics of an estimate (item.needsLevel / item.needsTopics say what is required)
function validateEstimate(out, item, topicSet) {
  const errs = [];
  if (out.level !== undefined && !CEFR.includes(out.level)) errs.push('level must be A1, A2 or B1');
  if (item?.needsLevel && !out.level) errs.push('level is missing (estimate A1, A2 or B1)');
  if (out.topics !== undefined) {
    if (!Array.isArray(out.topics) || !out.topics.length) errs.push('topics must be a non-empty list');
    else if (topicSet) for (const t of out.topics) if (!topicSet.has(t)) errs.push(`unknown topic "${t}" (use an existing "Section › List" in English, or "${OTHER_TOPIC}")`);
  }
  if (item?.needsTopics && !out.topics) errs.push('topics is missing (best fitting existing "Section › List")');
  return errs;
}

// Checks one enrichment result; returns a list of problems (empty = fine).
export function validate(out, item, topicSet) {
  const errs = [];
  if (!out || typeof out !== 'object') return ['out is missing'];
  errs.push(...validateEstimate(out, item, topicSet));
  if (item?.kind === 'estimate') return errs;
  if (!TYPES.includes(out.type)) errs.push(`type must be one of ${TYPES.join(', ')}`);
  if (!out.en || typeof out.en !== 'string') errs.push('en is missing');
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string' && /ß/.test(v)) errs.push(`${k} contains ß`);
  if (out.type === 'noun') {
    if (!/^(der|die|das)$/.test(out.article || '')) errs.push('noun needs article der/die/das');
    if (!out.noun) errs.push('noun needs "noun" (without article)');
    if (out.plural == null) errs.push('noun needs plural ("" if none)');
    if (out.plural && !/^die /.test(out.plural)) errs.push('plural must start with "die "');
    if (!['', 'sg', 'pl'].includes(out.number ?? '')) errs.push('number must be "", "sg" or "pl"');
  }
  if (out.type === 'verb' && !/^(hat|ist|hat\/ist) /.test(out.perfekt || '')) errs.push('verb needs perfekt starting with hat / ist');
  if (out.type !== 'noun' && (out.article || out.plural)) errs.push('only nouns have article/plural');
  if (item && out.type === 'noun' && /^(der|die|das) /i.test(item.de) && !item.de.toLowerCase().startsWith(out.article) && !out.fix)
    errs.push('article differs from Emilio\'s – add a "fix" note or keep his');
  return errs;
}

function merge() {
  if (!fs.existsSync(TODO)) return console.log('Nothing to merge.');
  const words = loadWords();
  const byId = new Map(words.map((w) => [w.id, w]));
  const topicSet = allowedTopics(words);
  let merged = 0;
  let problems = 0;
  let stale = 0;
  for (const f of fs.readdirSync(TODO).filter((x) => x.endsWith('.json')).sort()) {
    const file = path.join(TODO, f);
    let items;
    try {
      items = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.log(`! ${f}: not valid JSON (${e.message})`);
      problems++;
      continue;
    }
    if (items.every((x) => x.out == null)) continue; // not started yet
    const bad = [];
    for (const item of items) {
      const errs = validate(item.out, item, topicSet);
      if (errs.length) bad.push(`  ${item.id}: ${errs.join('; ')}`);
    }
    if (bad.length) {
      console.log(`! ${f}: ${bad.length} problem(s), nothing merged from this file:\n${bad.join('\n')}`);
      problems += bad.length;
      continue;
    }
    for (const item of items) {
      const w = byId.get(item.id);
      if (!w) continue;
      if (item.fp && item.fp !== w.fp) {
        stale++; // Emilio changed the word after this batch was made; it goes into a new batch
        continue;
      }
      const { fp, ...out } = item.out;
      if (item.kind === 'estimate') {
        if (!validEnriched(w)) {
          stale++;
          continue;
        }
        w.enriched = { ...w.enriched, ...out, ...(out.level ? { levelEstimated: true } : {}) }; // keep the word's enrichment, add the estimate
      } else {
        w.enriched = { ...out, ...(out.level ? { levelEstimated: true } : {}), fp: w.fp };
      }
      derive(w);
      merged++;
    }
    fs.unlinkSync(file);
    console.log(`✓ ${f} merged`);
  }
  saveWords(words);
  console.log(`${merged} words merged${stale ? ` (${stale} skipped: changed since – run batches again)` : ''}. ${words.filter(needsEnrichment).length} still need enrichment, ${words.filter(needsEstimate).length} still need a level/topic estimate. ${problems ? `${problems} problem(s) – fix them and run merge again.` : ''}`);
}

function status() {
  const words = loadWords();
  const active = words.filter((w) => !w.removed);
  const count = (fn) => active.filter(fn).length;
  const byType = {};
  for (const w of active) if (w.enriched) byType[w.enriched.type] = (byType[w.enriched.type] || 0) + 1;
  const byLevel = {};
  for (const w of active) byLevel[w.level || '?'] = (byLevel[w.level || '?'] || 0) + 1;
  const bySource = {};
  for (const w of active) for (const s of w.sources || []) bySource[s] = (bySource[s] || 0) + 1;
  const estimated = {};
  for (const w of active) if (w.levelEstimated) estimated[w.level] = (estimated[w.level] || 0) + 1;
  console.log(`${active.length} active words (${words.length - active.length} removed, kept hidden)`);
  console.log(`enriched: ${count((w) => !needsEnrichment(w))} · waiting: ${count(needsEnrichment)}`);
  console.log(`levels: ${Object.entries(byLevel).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`sources: ${SOURCES.map((s) => `${s} ${bySource[s] || 0}`).join(' · ')}`);
  console.log(`estimated levels (course-only words): ${Object.entries(estimated).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} · still to estimate: ${count(needsEstimate)}`);
  console.log(`words in no topic: ${count((w) => !w.topics.length)} · topic estimated: ${count((w) => w.topicsEstimated)}`);
  if (Object.keys(byType).length) console.log(`types: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const incomplete = active.filter((w) => !w.sources?.length || !CEFR.includes(w.level) || !w.topics.length);
  if (incomplete.length) console.log(`! ${incomplete.length} words without sources, level or topic: ${incomplete.slice(0, 5).map((w) => w.id).join(', ')}`);
  const fixes = active.filter((w) => w.enriched?.fix);
  if (fixes.length) console.log(`corrections to review: ${fixes.length} (see vocab/REVIEW.md after: node scripts/vocab.mjs review)`);
  const bad = active.filter((w) => w.enriched && !needsEnrichment(w) && validate(w.enriched, null, allowedTopics(words)).length);
  if (bad.length) console.log(`! ${bad.length} enriched words fail the checks: ${bad.slice(0, 5).map((w) => w.id).join(', ')}`);
}

function review() {
  const words = loadWords().filter((w) => !w.removed && w.enriched?.fix);
  const md = [
    '# Review – corrections for Emilio',
    'The model thinks these entries in the Word list are wrong. Please fix them in the next version of the',
    'Word file (or tell Claude to ignore them). Generated by `node scripts/vocab.mjs review`.\n',
    '| In the list | Suggested | Why |',
    '|---|---|---|',
    ...words.map((w) => `| ${w.src.de} · ${w.src.second || '—'} | ${w.enriched.fix.replace(/\|/g, '/')} | ${(w.enriched.why || '').replace(/\|/g, '/')} |`),
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'REVIEW.md'), `${md}\n`);
  console.log(`${words.length} correction(s) written to vocab/REVIEW.md`);
}

const [cmd, ...args] = process.argv.slice(2);
const commands = { import: () => importDocx(args[0], args[1]), merge, status, review };
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!commands[cmd]) {
    console.log('Usage: node scripts/vocab.mjs import <file.docx> [vNN] | merge | status | review');
    process.exit(1);
  }
  try {
    commands[cmd]();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
