import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const SKIP = new Set(['template.md', 'known-grammar.md']);
export const LEVELS = ['A1', 'A2', 'B1'];

// Special topic for free practice on a theme that has no lesson file (e.g. "im Café bestellen").
export const FREE_TOPIC = { id: 'free', title: 'Freies Üben', short: 'Freies Üben', type: 'Gemischt', levels: LEVELS };

function readFile(name) {
  try {
    return fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8');
  } catch {
    return '';
  }
}

function meta(text, key) {
  return ((text.match(new RegExp(`^-\\s*${key}:\\s*(.+)$`, 'mi')) || [])[1] || '').trim();
}

function section(text, heading) {
  const m = text.match(new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

// "- Niveau: A2, B1" → ['A2', 'B1']. No line (or nothing readable) → all levels.
function parseLevels(text) {
  const found = (meta(text, 'Niveau').toUpperCase().match(/\b(A1|A2|B1)\b/g) || []);
  return found.length ? LEVELS.filter((l) => found.includes(l)) : LEVELS;
}

// Every .md file in /content (except the template) becomes a topic.
export function listLessons() {
  let files = [];
  try {
    files = fs.readdirSync(CONTENT_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.md') && !SKIP.has(f))
    .sort()
    .map((file) => {
      const text = readFile(file);
      const title = ((text.match(/^#\s+(.+)$/m) || [])[1] || file.replace(/\.md$/, '')).trim();
      const typeWord = (meta(text, 'Typ').match(/\w+/) || ['Gemischt'])[0];
      const type = ['Grammatik', 'Wortschatz', 'Gemischt'].includes(typeWord) ? typeWord : 'Gemischt';
      return {
        id: file.replace(/\.md$/, ''),
        title,
        // short name for chips and the panel: the part of the title before " – " or "?"
        short: title.split(/\s+[–-]\s+/)[0].replace(/\?$/, '').trim(),
        type,
        levels: parseLevels(text),
        // title, theme, type – plus only the long, specific words of the rule (e.g. "Wechselpräpositionen")
        keywords: `${title} ${meta(text, 'Thema')} ${meta(text, 'Typ')} ${meta(text, 'Stichwörter')} ${(section(text, 'Regel').match(/[A-Za-zÄÖÜäöüß]{11,}/g) || []).join(' ')}`.toLowerCase(),
      };
    });
}

export function getLesson(id) {
  if (!/^[a-z0-9-]+$/i.test(id || '') || id === FREE_TOPIC.id) return null;
  const text = readFile(`${id}.md`);
  return text || null;
}

// ---- word tables and example exercises (used by the demo tutor; the real tutor reads the file) ----

const ARTICLES = /^(der|die|das)\s+/i;
const stripNotes = (x) => x.replace(/\((?!CH\))[^)]*\)/g, '').replace(/\s+/g, ' ').trim();

// "das Wohnzimmer / (CH) die Stube" → { main: 'das Wohnzimmer', variants: ['die Stube'] }
function nounVariants(cell) {
  const parts = cell.split('/').map((x) => stripNotes(x).replace(/\(CH\)\s*/g, '').trim()).filter(Boolean);
  const first = parts[0] || '';
  const article = (first.match(ARTICLES) || [])[1] || '';
  const all = parts.map((x) => (ARTICLES.test(x) || !article ? x : `${article} ${x}`));
  return { main: all[0], variants: all.slice(1) };
}

function tableRows(text) {
  const rows = [];
  let header = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] || ''])));
  }
  return rows;
}

// Nouns from the "Nomen | Englisch | Plural | … | Typisches Adjektiv" tables.
export function getVocab(id) {
  const text = getLesson(id);
  if (!text) return [];
  return tableRows(text)
    .filter((r) => r.nomen && ARTICLES.test(r.nomen) && r.englisch)
    .map((r) => {
      const { main, variants } = nounVariants(r.nomen);
      const [, article, noun] = main.match(/^(der|die|das)\s+(.+)$/i) || [];
      return {
        de: main,
        article: (article || '').toLowerCase(),
        noun: noun || main,
        variants,
        en: r.englisch.split(',').map((x) => x.trim()).filter(Boolean),
        plural: stripNotes((r.plural || '').split('/')[0]).replace(/^[–-]$/, ''),
        adjective: stripNotes((r['typisches adjektiv'] || '').split(',')[0]),
      };
    });
}

// The "# | Übung | Lösung | Typ" table.
export function getExamples(id) {
  const text = getLesson(id);
  if (!text) return [];
  return tableRows(text)
    .filter((r) => r['übung'] && r['lösung'])
    .map((r) => ({ task: r['übung'], solution: r['lösung'], type: r.typ || '' }));
}

export function getKnownGrammar() {
  return readFile('known-grammar.md');
}

// Best guess which lesson a free-text wish is about ("Dativ und Akkusativ, Stufe mittel").
// Returns a lesson id or null. Cheap keyword overlap, no AI needed.
export function guessTopic(text, lessons = listLessons()) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .split(/[^a-zäöü0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  let best = null;
  let bestScore = 0;
  for (const l of lessons) {
    const hay = l.keywords.replace(/ß/g, 'ss');
    const score = words.reduce((n, w) => n + (hay.includes(w.slice(0, 6)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = l.id;
      bestScore = score;
    }
  }
  return best;
}

const STOP = new Set([
  'bitte', 'möchte', 'moechte', 'gerne', 'heute', 'üben', 'ueben', 'stufe', 'mittel', 'leicht', 'schwer',
  'thema', 'lektion', 'please', 'practise', 'practice', 'want', 'with', 'und', 'oder', 'mit', 'eine', 'einen',
  'machen', 'können', 'koennen', 'wir', 'ich', 'über', 'ueber', 'meine', 'meinen', 'deine', 'unsere', 'brauche',
  'sprechen', 'reden', 'lernen', 'gern', 'gerne', 'etwas', 'mehr', 'noch', 'jetzt', 'lieber', 'about', 'some',
  'more', 'learn', 'talk', 'would', 'like', 'something', 'verben', 'nomen', 'sätze', 'saetze', 'wörter', 'woerter',
]);
