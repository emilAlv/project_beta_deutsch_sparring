// Quick check of the lesson files: run `node content-source/check-content.mjs` from the app folder.
// Lists every topic with its levels and how many rows of each verb, word and phrase table the app can read,
// and warns about the most common mistakes.
import fs from 'fs';

const content = await import(process.cwd() + '/lib/content.js');
let problems = 0;
const warn = (file, msg) => { problems++; console.log(`  ! ${file}: ${msg}`); };

for (const l of content.listLessons()) {
  const text = fs.readFileSync(`content/${l.id}.md`, 'utf8');
  const rows = (head) => {
    let n = 0, inTable = false;
    for (const line of text.split('\n')) {
      if (line.startsWith(`| ${head} |`)) { inTable = true; continue; }
      if (!line.startsWith('|')) inTable = false;
      else if (inTable && !/^\|[\s|-]+\|$/.test(line)) n++;
    }
    return n;
  };
  console.log(`${l.id}  [${l.levels.join(', ')}]  ${l.type}  verbs:${rows('Verb')} words:${rows('Wort')} phrases:${rows('Ausdruck')}`);
  if (/ß/.test(text)) warn(l.id, 'contains ß – write ss');
  if (!/^- Niveau:/m.test(text)) warn(l.id, 'no "- Niveau:" line');
  if (!/^- Stichwörter:/m.test(text)) warn(l.id, 'no "- Stichwörter:" line');
  let width = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) { width = 0; continue; }
    const n = line.split('|').length - 2;
    if (!width) width = n;
    else if (n !== width) warn(l.id, `row has ${n} cells, header has ${width}: ${line}`);
  }
}
console.log(problems ? `\n${problems} problem(s).` : '\nNo problems found.');
