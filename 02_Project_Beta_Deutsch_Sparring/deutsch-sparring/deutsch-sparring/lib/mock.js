// MOCK=1: a scripted tutor that answers in the same JSON shape as the real one, without AI.
// It builds its questions from the lesson files:
//   grammar topics    → the "Beispielübungen" table (gap fill, find the mistake …)
//   vocabulary topics → flashcards from the word tables (English ↔ German), optionally followed
//                       by a sentence task with the same word (article + adjective ending)
// Curriculum topics (lib/curriculum.js, ids "g-a1-…") have no lesson file: their gap fills are made from the
// entry's example sentences (the marked key word is blanked, the full sentence is the solution).
// The app counts the questions; the demo only answers for the question numbers it is given.
// Extra test words: "langsam" (slow answer), "kaputt" (broken JSON), "rohtext" (plain text
// instead of JSON), "absturz" (server error), "keine lust mehr" (the student wants to stop).

import { genderRule } from './gender.js';
import { ModelError } from './gemini.js';
import { getExamples } from './content.js';
import { curriculumEntry, gapExample, shortTitle } from './curriculum.js';
import { detectIntent, detectTopicWish } from './intents.js';
import { RULES } from './grammar.js';
import { chooseTask, findTask, infinitive } from './word-tasks.js';
import { align, localizeWord, toVariant } from './variants.js';
import { getWords } from './words.js';
import { focusRevealsAnswer } from './reply.js';
import { asksArticle, asksPlural as asksPluralAt } from './scores.js';

const DEFAULT_GRAMMAR = 'lektion-01-dativ-akkusativ';

const FOCUS = {
  grammar: {
    title: 'Wechselpräpositionen',
    rule: 'an, auf, hinter, in, neben, über, unter, vor, zwischen: Wo? (Position) → Dativ. Wohin? (Bewegung, Ziel) → Akkusativ.',
    boxes: [
      { label: 'Wo?', value: 'Dativ', note: 'Position: liegen, stehen, hängen, sitzen' },
      { label: 'Wohin?', value: 'Akkusativ', note: 'Bewegung: legen, stellen, hängen, setzen' },
    ],
    watchOut: '«hängen» geht beides: Ich hänge das Bild an die Wand (Wohin?). Das Bild hängt an der Wand (Wo?).',
  },
  vocab: {
    title: 'Nomen immer mit Artikel',
    rule: 'Lerne jedes Nomen mit Artikel und Plural. Der Artikel zeigt das Genus – und das Genus entscheidet die Endungen.',
    boxes: [
      { label: 'der', value: 'maskulin', note: 'der Tisch, der Schrank (CH: der Kasten)' },
      { label: 'die / das', value: 'feminin / neutral', note: 'die Lampe · das Bett' },
    ],
    watchOut: 'Im Dativ und Genitiv endet das Adjektiv auf -en: mit dem alten Schrank, wegen des alten Schranks.',
  },
};

// The example words in the vocabulary focus card: never the word of the open card (it would give the answer away).
const VOCAB_EXAMPLES = [
  [{ label: 'der', value: 'maskulin', note: 'der Tisch, der Schrank (CH: der Kasten)' }, { label: 'die / das', value: 'feminin / neutral', note: 'die Lampe · das Bett' }],
  [{ label: 'der', value: 'maskulin', note: 'der Stuhl, der Garten' }, { label: 'die / das', value: 'feminin / neutral', note: 'die Tür · das Fenster' }],
];
// answers: the German answers of ALL the session's cards, so no example is a word that is asked later
function vocabFocus(answers) {
  const pick = (boxes) => ({ ...FOCUS.vocab, boxes });
  const safe = VOCAB_EXAMPLES.find((boxes) => answers.every((a) => !focusRevealsAnswer(pick(boxes), a)));
  return safe ? pick(safe) : { ...FOCUS.vocab, boxes: [] };
}

function grammarErrorType(topic) {
  const text = `${topic?.title || ''} ${topic?.rule || ''}`.toLowerCase();
  if (/adjektiv|endung/.test(text)) return 'Adjektivendung';
  if (/präposition|praeposition/.test(text)) return 'Präposition';
  if (/artikel/.test(text)) return 'Artikel';
  if (/wortstellung|nebensatz|konnektor|satzbau|relativsatz/.test(text)) return 'Wortstellung';
  if (/perfekt|präteritum|praeteritum|passiv|konjunktiv|modal|verb/.test(text)) return 'Verbform';
  if (/dativ|akkusativ|genitiv|kasus/.test(text)) return 'Kasus';
  return 'Andere';
}

// A curriculum entry → the same shape as the rows of a lesson file's example table (task, solution, type) + the rule name
function curriculumExamples(entry) {
  return entry.examples.map((x) => {
    const g = gapExample(x);
    return { task: g.task, solution: g.solution, type: shortTitle(entry), rule: entry.ruleNames[0] };
  });
}

// the "grammar focus" card of a curriculum topic: rule + two examples as boxes. The LAST two examples: the questions
// start with the first ones, so the card does not show the solution of question 1 or 2.
function curriculumFocus(entry) {
  const [a, b] = entry.examples.slice(-2).map(gapExample);
  return {
    title: shortTitle(entry),
    rule: entry.rule.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '),
    boxes: [a, b].map((g) => ({ label: 'Beispiel', value: g.solution, note: g.sentence.slice(0, 80) })),
    watchOut: entry.appNote || entry.exerciseIdeas[0] || '',
  };
}

// An exercise MODEL (lib/exercise-models.js) → a row like the example rows. The demo cannot vary a model, so it asks it as it is
// (the real tutor never does). `model: true` makes grammarItem() build the item from the model's answer and alternatives.
function modelRows(models, entry, topic) {
  return models.map((m) => ({ task: m.model, solution: m.answer, type: m.focus, rule: entry?.ruleNames?.[0] || topic?.short || '', model: m }));
}

const splitGaps = (answer) => answer.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);

function modelItem(ex) {
  const m = ex.model;
  const gaps = (ex.task.match(/___/g) || []).length;
  const type = m.type === 'Kommunikative Aufgabe' ? 'Satzbau' : m.type;
  if (gaps) {
    const fill = (words) => {
      let i = 0;
      return ex.task.replace(/___/g, () => words[i++] || '___').replace(/\s*\([^)]*\)/g, '').replace(/\s+([.!?])/g, '$1');
    };
    const parts = splitGaps(m.answer);
    const altParts = m.alternatives.map(splitGaps);
    const solved = fill(parts);
    return { ex, type: 'Lückentext', parts, altParts, gaps, fill, solved, keys: [solved, ...altParts.map(fill)] };
  }
  return { ex, type, parts: [m.answer], altParts: [], gaps: 0, fill: () => ex.task, solved: m.answer, keys: [m.answer, ...m.alternatives] };
}

// ---------- small helpers ----------
const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, ' ').replace(/\s+/g, ' ').trim();
// Swiss and German words count the same (Velo = Fahrrad), ss = ß (norm): lib/variants.js
const has = (hay, needle) => ` ${norm(align(hay, needle))} `.includes(` ${norm(needle)} `);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DIFF_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

// ---------- grammar questions from the example table ----------
const WRONG_FORM = { den: 'dem', dem: 'den', der: 'die', die: 'der', das: 'dem', mir: 'mich', mich: 'mir' };

function grammarItem(examples, n) {
  const ex = examples[(n - 1) % examples.length];
  if (ex.model) return modelItem(ex);
  const parts = ex.solution.split(/\s+[–-]\s+/);
  const gaps = (ex.task.match(/___/g) || []).length;
  let type = 'Lückentext';
  let sentence = ex.task;
  let fill = (words) => sentence;
  if (gaps) {
    fill = (words) => {
      let i = 0;
      return ex.task.replace(/___/g, () => words[i++] || '___').replace(/\s*\([^)]*\)/g, '').replace(/\s+([.!?])/g, '$1');
    };
  } else if (/^verbinde/i.test(ex.task)) {
    type = 'Satzbau';
  } else if (/^finde den fehler/i.test(ex.task)) {
    type = 'Fehler finden';
    sentence = ex.task.replace(/^[^:]*:\s*/, '');
  }
  const solved = (() => {
    if (gaps) return fill(parts);
    const plain = ex.solution.replace(/\s*\([^)]*\)/g, '');
    if (type === 'Fehler finden') {
      const w = sentence.replace(/[.!?]$/, '').split(' ');
      const fix = plain.split(' ');
      const at = w.findIndex((x) => norm(x) === norm(fix[0]));
      if (at >= 0) w.splice(at, fix.length, ...fix);
      return `${w.join(' ')}.`;
    }
    return plain;
  })();
  // accepted answers: the full solved sentence, or (for gaps) just the missing words
  const alt = ex.solution.match(/(\S+) \(([^)]+)\)/);
  const keys = [solved, alt ? ex.solution.replace(alt[0], alt[2]) : null].filter(Boolean);
  return { ex, type, parts, gaps, fill, solved, keys };
}

function checkGrammar(item, answer) {
  const a = norm(answer);
  const words = a.split(' ');
  let correct = item.keys.some((k) => norm(align(answer, k)).includes(norm(k)));
  let studentAnswer = answer.trim();
  if (item.gaps && words.length <= item.gaps + 3) {
    // only the missing word(s) (maybe with a neighbour word): put them into the sentence
    const taskWords = new Set(norm(item.ex.task.replace(/\([^)]*\)/g, '')).split(' '));
    const parts = item.parts.map(norm);
    // words of the solution (and of its alternatives) count even when they also stand in the task ("Seit wann" / "Seit Januar")
    const allowed = new Set([...parts, ...(item.altParts || []).flat().map(norm)].flatMap((x) => [x, ...x.split(' ')]));
    const given = words.filter((w) => w && (!taskWords.has(w) || allowed.has(w)) && w !== '___');
    correct = [parts, ...(item.altParts || []).map((ps) => ps.map(norm))].some((ps) => given.join(' ') === ps.join(' '));
    studentAnswer = item.fill(item.gaps === 1 ? [given.join(' ')] : given);
  }
  return { correct, studentAnswer, corrected: item.solved };
}

function grammarQuestion(examples, n, difficulty, strongHint = false, topic = null) {
  const item = grammarItem(examples, n);
  const first = item.parts[0];
  const choices = item.gaps === 1 && WRONG_FORM[norm(first)] ? [first, WRONG_FORM[norm(first)]].sort() : [];
  const hint = strongHint
    ? `Tipp: ${item.ex.type || 'Achte auf das Verb und die Präposition.'}`
    : difficulty === 'hard' ? null
      : difficulty === 'easy' ? (choices.length ? `(${choices.join(' oder ')}?)` : '(Achte auf das Verb.)')
        : item.type === 'Fehler finden' ? 'Schreib den Satz richtig.' : item.gaps ? 'Achte auf das Verb.' : null;
  const baseLine = item.type === 'Fehler finden'
    ? item.ex.task.replace(/^[^:]*:\s*/, 'Finde den Fehler: ')
    : item.ex.task;
  const cycle = Math.floor((n - 1) / examples.length);
  const line = cycle
    ? `Neuer Kontext${topic?.situation ? ` – ${topic.situation}` : ''}: ${baseLine}`
    : baseLine;
  return {
    exercise: { number: n, type: item.type, direction: null, line, answer: item.gaps ? item.parts.join(' ') : item.solved, hint },
    options: difficulty === 'easy' && choices.length ? choices : [],
  };
}

// ---------- vocabulary: flashcards + grammar tasks ----------
// The words come from the picker (lib/scores.js, vocab/words.json) – the same words the real tutor gets.
// With grammar on (settings.grammar), every noun, verb and adjective gets a card and then ONE grammar task
// with the same word (lib/word-tasks.js); phrases and other words only get the card.
// A picked word (lib/words.js) → the shape this demo works with.
const splitMeanings = (en) => String(en || '').split(/,\s*(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);

// variant = the student's choice: the word is shown the way that variant writes it (the answer may use either)
function mockWord(word, variant) {
  const w = localizeWord(word, variant, (n) => getWords().some((x) => x.type === 'noun' && x.noun === n));
  if (w.type === 'noun') {
    return {
      id: w.id, type: 'noun', de: `${w.article} ${w.noun}`, article: w.article, noun: w.noun, variants: [],
      en: splitMeanings(w.en), plural: w.plural, adjective: w.adjective, raw: w,
    };
  }
  const de = infinitive(w);
  return { id: w.id, type: w.type, de, article: '', noun: de, variants: [], en: splitMeanings(w.en), plural: '', adjective: '', perfekt: w.perfekt, raw: w };
}
const isNoun = (w) => w.type === 'noun';
const grammarOf = (settings) => settings.grammar || [];
// What a noun card checks follows the difficulty (lib/scores.js): Easy = the word only, Medium = + article, Hard = + plural
// (English → German only). Other word types: just the word.
const articleChecked = (settings) => asksArticle(settings.difficulty);
const asksPlural = (settings, w) => isNoun(w) && Boolean(w.plural) && asksPluralAt(settings.difficulty);
const bareOf = (w) => (isNoun(w) ? w.noun : w.de); // the German word without its article
// the whole card as information: "die Lampe, die Lampen"
const fullCard = (w) => `${w.de}${isNoun(w) && w.plural ? `, ${w.plural}` : ''}`;
const meaningOf = (w) => w.en[0].replace(/^the /, '');

// Which word and which kind of question is question n? Deterministic, so the demo needs no memory:
// word after word: its card, then (grammar on, the word has a task) its grammar task.
const taskCache = new Map();
function taskOf(word, settings, idx) {
  if (!settings.sentences) return null;
  const key = `${word.id}|${idx}|${grammarOf(settings).join(',')}`;
  if (!taskCache.has(key)) taskCache.set(key, chooseTask(word.raw, grammarOf(settings), idx));
  return taskCache.get(key);
}

function plan(vocab, settings, n) {
  let q = 0;
  let cardNo = -1;
  for (let i = 0; i < 400; i += 1) {
    const idx = i % vocab.length;
    q += 1;
    cardNo += 1;
    if (q === n) return { idx, kind: 'card', cardNo };
    if (settings.sentences && taskOf(vocab[idx], settings, idx)) {
      q += 1;
      if (q === n) return { idx, kind: 'sentence', cardNo };
    }
  }
  return { idx: (n - 1) % vocab.length, kind: 'card', cardNo: n - 1 };
}

function cardDirection(settings, cardNo) {
  if (settings.direction === 'mixed') return cardNo % 2 === 0 ? 'en-de' : 'de-en';
  return settings.direction === 'de-en' ? 'de-en' : 'en-de';
}

// pin = { word, kind?, task? }: keep the word (and kind) of a question that is asked again
function vocabQuestion(vocab, n, settings, strongHint = false, pin = null) {
  const p = plan(vocab, settings, n);
  const word = pin?.word || vocab[p.idx];
  const idx = Math.max(0, vocab.indexOf(word));
  const kind = pin?.kind || p.kind;
  const d = settings.difficulty;
  if (kind === 'sentence') {
    const task = pin?.task || taskOf(word, settings, idx);
    if (task) {
      return {
        exercise: { number: n, type: task.type, direction: null, line: task.line, answer: task.solution, hint: task.hint(strongHint, d) },
        options: task.options(d),
        word,
        task,
      };
    }
  }
  const dir = cardDirection(settings, p.cardNo);
  const others = vocab.filter((w) => w !== word);
  const pick = (k) => (others.length ? others[(idx * 7 + k * 13) % others.length] : word);
  const withArticle = false; // German → English asks the meaning only (the noun is shown with its article)
  if (dir === 'en-de') {
    // Easy: choose between German words (the article is not checked on Easy)
    const choices = [word, pick(1), pick(2)].map(bareOf).filter((x, i, all) => all.indexOf(x) === i).sort();
    const plural = asksPlural(settings, word);
    return {
      exercise: {
        number: n,
        type: 'Karteikarte',
        direction: 'en-de',
        line: word.en[0],
        answer: `${word.de}${plural ? `, ${word.plural}` : ''}`,
        hint: strongHint ? `(${word.article ? `${word.article} …, ` : ''}Anfang: ${word.noun.slice(0, 3)}…)`
          : d === 'easy' ? `(Anfang: ${word.noun.slice(0, 2)}…)` : null, // the app shows what to type (lib/instructions.js)
      },
      options: d === 'easy' ? choices : [],
      word,
    };
  }
  // German → English: the meaning only (owner decision 31 Oct). The bare-noun card below is kept but not used.
  if (withArticle) {
    return {
      exercise: {
        number: n,
        type: 'Karteikarte',
        direction: 'de-en',
        line: word.noun,
        answer: `${word.article} – ${meaningOf(word)}`,
        hint: strongHint ? `(Artikel: ${word.article}, ${meaningOf(word).slice(0, 3)}…)` : null, // the app shows what to type
      },
      options: [],
      word,
      bare: true,
    };
  }
  const choices = [word.en[0], pick(1).en[0], pick(2).en[0]].sort();
  return {
    exercise: {
      number: n,
      type: 'Karteikarte',
      direction: 'de-en',
      line: word.de,
      answer: meaningOf(word),
      hint: strongHint ? `(${word.en[0].replace(/^the /, '').slice(0, 3)}…)` : d === 'hard' ? null : d === 'easy' ? '(Wähle die Bedeutung.)' : 'auf Englisch',
    },
    options: d === 'easy' ? choices : [],
    word,
  };
}

function checkVocab(q, answer, settings) {
  const a = norm(answer);
  const w = q.word;
  if (q.task) return q.task.check(answer);
  const plural = asksPlural(settings, w);
  const articleAsked = isNoun(w) && articleChecked(settings);
  const card = fullCard(w); // the article and the plural are always shown, as information on Easy
  const extra = isNoun(w)
    ? [w.plural ? `Plural: ${w.plural}.` : 'Nur Plural.', w.variants.length ? `Auch: ${w.variants.join(', ')}.` : ''].filter(Boolean).join(' ')
    : w.perfekt && !(settings.sentences && (settings.grammar || []).includes('perfekt')) ? `Perfekt: ${w.perfekt}.` : ''; // not before the Perfekt task
  if (q.exercise.direction === 'en-de') {
    const forms = [w.de, ...w.variants];
    const full = forms.some((f) => has(a, f)); // article + noun
    const wordOk = full || forms.some((f) => has(a, f.replace(/^(der|die|das) /, ''))); // the noun, with or without a (wrong) article
    const articleOk = !articleAsked || full;
    const pluralOk = !plural || has(a, w.plural);
    const correct = wordOk && articleOk && pluralOk;
    // which parts were right: only the parts this level checks; a wrong word leaves the others open
    const parts = { meaning: wordOk, article: articleAsked ? (wordOk ? articleOk : null) : null, plural: plural ? (wordOk ? pluralOk : null) : null };
    const articleInfo = wordOk && !full && isNoun(w) && !articleAsked; // Easy: the article was missing or wrong, which does not count
    return {
      correct,
      corrected: correct && (articleAsked || !isNoun(w)) ? answer.trim() : card,
      changedWords: correct ? [] : !wordOk ? [w.de] : !articleOk ? [w.article] : [w.plural],
      explanation: correct
        ? (articleInfo ? `Der Artikel ist «${w.article}» – auf Leicht zählt er nicht. ${extra}` : extra)
        : !wordOk ? extra : !articleOk ? `Das Nomen stimmt, aber der Artikel ist «${w.article}». ${extra}` : `Der Plural fehlt oder stimmt nicht. ${extra}`,
      rule: wordOk && articleOk && !pluralOk ? RULES.plural : null,
      errorType: correct ? null : wordOk && !articleOk ? 'Artikel' : 'Wortschatz',
      parts,
    };
  }
  const meanings = w.en.map((e) => e.replace(/^the /, ''));
  const meaningOk = meanings.some((m) => a.includes(norm(m)));
  if (q.bare) {
    // article + meaning of a noun shown without its article (Medium / Hard)
    const arts = a.split(' ').filter((t) => ['der', 'die', 'das'].includes(t));
    const articleOk = arts.length > 0 && arts.every((t) => t === w.article);
    const correct = meaningOk && articleOk;
    return {
      correct,
      corrected: correct ? answer.trim() : `${w.de} – ${w.en.join(' / ')}`,
      changedWords: correct ? [] : meaningOk ? [w.article] : [w.en[0]],
      explanation: correct ? `${w.de}: ${w.en.join(', ')}. ${extra}` : meaningOk ? `Die Bedeutung stimmt, aber der Artikel ist «${w.article}». ${extra}` : `${w.de}: ${w.en.join(', ')}. ${extra}`,
      rule: null, // the word is no grammar rule
      errorType: correct ? null : meaningOk ? 'Artikel' : 'Wortschatz',
      parts: { meaning: meaningOk, article: meaningOk ? articleOk : null, plural: null },
    };
  }
  return {
    correct: meaningOk,
    corrected: meaningOk ? answer.trim() : isNoun(w) ? `${card} – ${w.en.join(' / ')}` : w.en.join(' / '),
    changedWords: meaningOk ? [] : [w.en[0]],
    explanation: `${w.de}: ${w.en.join(', ')}. ${extra}`,
    rule: null,
    errorType: meaningOk ? null : 'Wortschatz',
    parts: { meaning: meaningOk, article: null, plural: null },
  };
}

// The open question as it was asked (settings may have changed since then): found by its text.
function openVocabQuestion(vocab, n, settings, line, wordId = '', task = null) {
  const byId = wordId && vocab.find((w) => w.id === wordId);
  if (byId && task === 'grammar') {
    const t = findTask(byId.raw, line);
    if (t) return { exercise: { number: n, type: t.type, direction: null, line }, word: byId, task: t };
  }
  const word = byId || vocab.find((w) => w.en[0] === line || w.de === line || (isNoun(w) && w.noun === line));
  if (word) {
    const dir = word.en.includes(line) ? 'en-de' : 'de-en';
    return { exercise: { number: n, type: 'Karteikarte', direction: dir, line }, word, bare: dir === 'de-en' && isNoun(word) && line === word.noun };
  }
  for (const w of vocab) {
    const t = findTask(w.raw, line);
    if (t) return { exercise: { number: n, type: t.type, direction: null, line }, word: w, task: t };
  }
  return vocabQuestion(vocab, n, settings);
}


function openGrammarItem(examples, n, line) {
  const same = (x, y) => toVariant(x, 'ch') === toVariant(y, 'ch'); // the line may be shown with ß
  const shown = toVariant(line, 'ch');
  const i = examples.findIndex((ex) => {
    const task = toVariant(ex.task, 'ch');
    const errorTask = toVariant(ex.task.replace(/^[^:]*:\s*/, 'Finde den Fehler: '), 'ch');
    return same(ex.task, line) || same(line, errorTask) || norm(shown).includes(norm(task)) || norm(shown).includes(norm(errorTask));
  });
  return grammarItem(examples, i >= 0 ? i + 1 : n);
}

// ---------- the demo tutor ----------
export async function mockReply({ text, settings, session, progress, topic: topic0, topics = [], words = [], models = [], reviewPlan = null }) {
  let topic = topic0;
  const say = norm(text);
  if (/langsam|slow/.test(say)) await new Promise((r) => setTimeout(r, 4000));
  if (/kaputt|broken/.test(say)) return '{"message": "Das ist absichtlich kaputtes JSON, damit du die Fehlerbehandlung testen kannst", "feedback": {"forNumber": 2, "corr';
  if (/rohtext|raw text/.test(say)) return 'Das ist eine Antwort ohne JSON. Die App zeigt sie als normale Nachricht.';
  if (/absturz|crash/.test(say)) throw new ModelError('Simulierter Fehler (Demo-Modus)', 502);

  const lessons = topics;
  const mixed = Array.isArray(reviewPlan) && reviewPlan.length > 0; // Mixed review: question n follows plan item n
  const topicId = topic?.id || DEFAULT_GRAMMAR;
  let isVocab = !mixed && Boolean(topic) && topic.type !== 'Grammatik' && topic.id !== 'free';
  const vocab = isVocab || mixed ? words.map((w) => mockWord(w, settings.variant)) : [];
  let entry = isVocab ? null : curriculumEntry(topicId);
  const examplesOf = (id, ent, tp) => {
    if (!mixed && !isVocab && models.length) return modelRows(models, ent, tp);
    return ent ? curriculumExamples(ent) : getExamples(isVocab || id === 'free' || id === 'mixed-review' ? DEFAULT_GRAMMAR : id);
  };
  let examples = examplesOf(topicId, entry, topic);
  let useVocab = isVocab && vocab.length > 0;
  let cardNo0 = 0; // mixed: how many word cards came before question n
  // mixed: aim the demo at question k of the plan (a word card, or a grammar question of the item's topic)
  const aim = (k) => {
    if (!mixed) return;
    const it = reviewPlan[(k - 1) % reviewPlan.length];
    cardNo0 = reviewPlan.slice(0, (k - 1) % reviewPlan.length).filter((x) => x.kind === 'word').length;
    if (it.kind === 'word' && vocab.length) {
      useVocab = true;
      return;
    }
    useVocab = false;
    const id = it.topicId || DEFAULT_GRAMMAR;
    entry = curriculumEntry(id);
    topic = topics.find((x) => x.id === id) || { id, short: entry?.title || id, type: 'Grammatik' };
    examples = examplesOf(id, entry, topic);
    if (!examples.length) examples = getExamples(DEFAULT_GRAMMAR);
  };
  const total = session.total;
  const open = session.openNumber;

  const out = {
    message: '',
    feedback: null,
    exercise: null,
    options: [],
    panelView: null,
    grammarFocus: null,
    session: {
      topicId,
      topicName: topic?.short || 'Dativ oder Akkusativ',
      level: settings.level,
      difficulty: DIFF_DE[settings.difficulty],
      finished: false,
    },
  };
  // the open question as it was asked: asked again → same word; the sentence after a card → its word
  aim(open || (session.skippedNumber ? session.skippedNumber : progress.done + 1));
  const openQ = useVocab && open && session.openLine ? openVocabQuestion(vocab, open, settings, session.openLine, session.openWordId, session.openTask) : null;
  const ask = (n, strongHint = false) => {
    aim(n);
    let pin = null;
    if (openQ && n === open) pin = { word: openQ.word, kind: openQ.task ? 'sentence' : 'card', task: openQ.task };
    // grammar was switched on while a card was open: the card's own grammar task comes next
    else if (openQ && settings.sentences && !openQ.task && taskOf(openQ.word, settings, vocab.indexOf(openQ.word))) pin = { word: openQ.word, kind: 'sentence' };
    else if (openQ && !settings.sentences) pin = { kind: 'card' };
    const q = useVocab ? vocabQuestion(vocab, mixed ? cardNo0 + 1 : n, mixed ? { ...settings, sentences: false } : settings, strongHint, pin) : grammarQuestion(examples, n, settings.difficulty, strongHint, topic);
    out.exercise = { ...q.exercise, number: n };
    if (q.word?.id) {
      out.exercise.wordId = q.word.id;
      out.exercise.task = q.task ? 'grammar' : 'flashcard';
    }
    out.options = q.options;
  };
  const json = () => JSON.stringify(out);

  // the session is over: talk, but no new questions
  if (session.finished) {
    out.message = 'Diese Runde ist fertig. Tippe «Same settings again» für eine neue Runde oder «New session», um etwas anderes zu üben.';
    return json();
  }
  // the student wants to stop (in words the app did not catch)
  if (/keine lust|muss (jetzt )?gehen|ich höre auf|ich hoere auf|bis morgen|tschüss|tschuess/.test(say)) {
    out.message = 'Kein Problem – gut gemacht für heute. Bis bald!';
    out.session.finished = true;
    return json();
  }
  // the student asks for another topic in their own words: settings are fixed during a session
  // (not for the app's own opening message "Starte bitte das Thema «…»": a topic name can look like a wish)
  const wish = session.start ? null : detectTopicWish(text, lessons, { running: true });
  const other = wish && lessons.find((l) => l.id !== topicId && (l.id === wish.topicId || l.type === wish.group));
  if (other) {
    out.message = 'Das Thema bleibt während der Sitzung gleich. Beende die Sitzung, um etwas anderes zu üben.';
    if (open) ask(open);
    return json();
  }
  if (/fortschritt|lücken|progress|gaps/.test(say)) {
    out.message = 'Gern! Rechts siehst du jetzt deinen Fortschritt und deine Lücken.';
    out.panelView = 'progress';
    if (open) ask(open);
    return json();
  }

  // the app counted a skipped question: give its solution, then the next question
  if (session.skippedNumber) {
    const k = session.skippedNumber;
    const sq = useVocab ? openVocabQuestion(vocab, k, settings, session.skippedLine, session.skippedWordId, session.skippedTask) : null;
    const solution = useVocab
      ? sq.task ? sq.task.solution
        : sq.exercise.direction === 'en-de' ? sq.word.de : sq.bare ? `${sq.word.de} = ${sq.word.en[0]}` : sq.word.en[0]
      : openGrammarItem(examples, k, session.skippedLine).solved;
    out.message = `Kein Problem. Die Lösung: **${solution}**`;
    if (k < total) ask(k + 1);
    return json();
  }

  // nothing open: start (question 1) or continue with the next question
  if (!open) {
    out.message = progress.done
      ? 'Weiter geht’s!'
      : mixed
        ? 'Los geht’s mit der gemischten Wiederholung: alte Fehler, fällige Themen und Wörter. (Demo-Modus)'
        : useVocab
        ? `Los geht’s mit den Karteikarten zu «${topic.short}». (Demo-Modus)`
        : `Sehr gern! Wir üben «${topic?.short || 'Dativ oder Akkusativ'}». (Demo-Modus)`;
    ask(progress.done + 1);
    out.grammarFocus = useVocab ? vocabFocus([out.exercise.answer, ...vocab.map((w) => w.de)]) : entry ? curriculumFocus(entry) : FOCUS.grammar;
    return json();
  }

  // help with the open question
  const intent0 = detectIntent(text);
  const q = openQ;
  if (intent0?.type === 'rule' || /^(erklär|erklaer|explain|regel|rule)/.test(say)) {
    out.message = useVocab
      ? 'Merke dir jedes Nomen mit **Artikel** und Plural. Im Dativ und im Genitiv enden Adjektive nach dem Artikel auf -en.'
      : entry ? `Die Regel: ${entry.rule.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')}`
        : 'Die Regel: Bei den Wechselpräpositionen fragst du **Wo?** (Position) → Dativ oder **Wohin?** (Bewegung) → Akkusativ.';
    out.panelView = 'grammar';
    ask(open);
    out.grammarFocus = useVocab ? vocabFocus([out.exercise.answer, ...vocab.map((w) => w.de)]) : entry ? curriculumFocus(entry) : FOCUS.grammar;
    return json();
  }
  if (/^(tipp|hint|give me a hint|gib mir einen tipp|einen tipp)/.test(say)) {
    out.message = 'Hier ist ein Tipp:';
    ask(open, true);
    return json();
  }
  if (/^(nochmal|noch ?mal|noch einmal|again|wiederhol|repeat)/.test(say) && !/fehler|mistake/.test(say)) {
    out.message = 'Gern, noch einmal:';
    ask(open);
    return json();
  }
  const intent = intent0;
  if (intent?.type === 'fixed') {
    out.message = 'Die Einstellungen bleiben während der Sitzung gleich. Beende die Sitzung, um sie zu ändern.';
    ask(open);
    return json();
  }
  if (/^(repeat my mistakes|wiederhole meine fehler)/.test(say)) {
    out.message = 'Gute Idee! Wir üben die Regeln, bei denen du Fehler gemacht hast.';
    ask(open);
    return json();
  }

  // an answer to the open question
  if (useVocab) {
    const r = checkVocab(q, text, settings);
    out.feedback = { forNumber: open, studentAnswer: text.trim(), ...r };
  } else {
    const item = openGrammarItem(examples, open, session.openLine);
    const r = checkGrammar(item, text);
    out.feedback = {
      forNumber: open,
      correct: r.correct,
      studentAnswer: r.studentAnswer,
      corrected: r.corrected,
      changedWords: r.correct ? [] : item.parts,
      explanation: item.ex.type
        ? `${item.ex.type.replace(/→/g, '→')}: ${r.correct ? 'genau richtig.' : `Die Bedeutung bleibt klar; korrigiere die Zielform zu «${item.parts.join(' – ')}».`}`
        : '',
      rule: item.ex.rule || (item.ex.type || topic?.short || '').replace(/Akk$/, 'Akkusativ').replace(/Dat$/, 'Dativ'),
      errorType: r.correct ? null : grammarErrorType(topic),
    };
  }
  const right = out.feedback.correct;
  // the demo's three-step explanation of a wrong answer (the real tutor writes a specific one, see lib/prompt.js)
  if (!right && !out.feedback.why) {
    const f = out.feedback;
    const fixed = (f.changedWords || []).filter(Boolean).join(' ');
    // a wrong article: the app's rule of thumb from the ending (lib/gender.js), or the honest "no rule"
    const w = useVocab && f.errorType === 'Artikel' ? q?.word : null;
    const g = w ? genderRule(w.noun || String(w.de).replace(/^(der|die|das) /, ''), w.article) : null;
    if (w) {
      f.why = {
        mistake: `Der Artikel ist «${w.article}».`,
        rule: g ? (g.fits ? g.text : g.text.replace(' AUSNAHME:', ' Aber dieses Wort ist eine Ausnahme:')) : 'Hier hilft keine Regel: lerne das Wort immer mit Artikel.',
        here: `Richtig ist: ${f.corrected}.`,
      };
    }
    if (!f.why) f.why = {
      mistake: fixed ? `Hier fehlt oder stimmt nicht: «${fixed}».` : `«${f.studentAnswer}» → «${f.corrected}»`,
      rule: f.explanation || (f.rule ? `Regel: ${f.rule}.` : 'Lerne das Wort immer mit Artikel und Plural.'),
      here: `Richtig ist: ${f.corrected}.`,
    };
    f.explanation = '';
  }
  if (open >= total) {
    out.message = right ? 'Super, das war die letzte Frage – gut gemacht!' : 'Das war die letzte Frage. Gut gemacht – schau dir rechts deine Lücken an.';
    return json();
  }
  out.message = right ? ['Super, genau richtig!', 'Perfekt!', 'Sehr gut!'][open % 3] : 'Noch nicht ganz. So ist es richtig:';
  ask(open + 1);
  return json();
}
