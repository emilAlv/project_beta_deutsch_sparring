import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const SKIP = new Set(['template.md', 'known-grammar.md']);

function readFile(name) {
  try {
    return fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8');
  } catch {
    return '';
  }
}

// Every .md file in /content (except the template) becomes a topic button.
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
      const title = (text.match(/^#\s+(.+)$/m) || [])[1] || file.replace(/\.md$/, '');
      const type = ((text.match(/^-\s*Typ:\s*(\w+)/m) || [])[1] || 'Gemischt').trim();
      return { id: file.replace(/\.md$/, ''), title: title.trim(), type };
    });
}

export function getLesson(id) {
  if (!/^[a-z0-9-]+$/i.test(id || '')) return null;
  const text = readFile(`${id}.md`);
  return text || null;
}

export function getKnownGrammar() {
  return readFile('known-grammar.md');
}
