// MOCK=1: a scripted tutor that answers in the same JSON shape as the real one, without AI.
// It builds its questions from the lesson files:
//   grammar topics    → the "Beispielübungen" table (gap fill, find the mistake …)
//   vocabulary topics → flashcards from the word tables (English ↔ German), optionally followed
//                       by a sentence task with the same word (article + adjective ending)
// The app counts the questions; the demo only answers for the question numbers it is given.
// Extra test words: "langsam" (slow answer), "kaputt" (broken JSON), "rohtext" (plain text
// instead of JSON), "absturz" (server error), "keine lust mehr" (the student wants to stop).

import { ModelError } from './gemini';
import { getExamples, getVocab, listLessons } from './content';
import { detectIntent, detectTopicWish } from './intents';

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
    watchOut: 'Im Dativ: dem alten Schrank, der hellen Lampe, dem breiten Bett – das Adjektiv endet auf -en.',
  },
};

// ---------- small helpers ----------
const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (hay, needle) => ` ${norm(hay)} `.includes(` ${norm(needle)} `);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DIFF_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

// ---------- grammar questions from the example table ----------
const WRONG_FORM = { den: 'dem', dem: 'den', der: 'die', die: 'der', das: 'dem', mir: 'mich', mich: 'mir' };

function grammarItem(examples, n) {
  const ex = examples[(n - 1) % examples.length];
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
  let correct = item.keys.some((k) => a.includes(norm(k)));
  let studentAnswer = answer.trim();
  if (item.gaps && words.length <= item.gaps + 3) {
    // only the missing word(s) (maybe with a neighbour word): put them into the sentence
    const taskWords = new Set(norm(item.ex.task.replace(/\([^)]*\)/g, '')).split(' '));
    const parts = item.parts.map(norm);
    const given = words.filter((w) => w && (!taskWords.has(w) || parts.includes(w)) && w !== '___');
    correct = given.length === parts.length && parts.every((p, i) => given[i] === p);
    studentAnswer = item.fill(given);
  }
  return { correct, studentAnswer, corrected: item.solved };
}

function grammarQuestion(examples, n, difficulty, strongHint = false) {
  const item = grammarItem(examples, n);
  const first = item.parts[0];
  const choices = item.gaps === 1 && WRONG_FORM[norm(first)] ? [first, WRONG_FORM[norm(first)]].sort() : [];
  const hint = strongHint
    ? `Tipp: ${item.ex.type || 'Achte auf das Verb und die Präposition.'}`
    : difficulty === 'hard' ? null
      : difficulty === 'easy' ? (choices.length ? `(${choices.join(' oder ')}?)` : '(Achte auf das Verb.)')
        : item.type === 'Fehler finden' ? 'Schreib den Satz richtig.' : item.gaps ? 'Achte auf das Verb.' : null;
  return {
    exercise: { number: n, type: item.type, direction: null, line: item.type === 'Fehler finden' ? item.ex.task.replace(/^[^:]*:\s*/, 'Finde den Fehler: ') : item.ex.task, hint },
    options: difficulty === 'easy' && choices.length ? choices : [],
  };
}

// ---------- vocabulary: flashcards + sentence tasks ----------
// with sentences: odd questions are cards, even ones a sentence with the card just before
function vocabSlot(n, sentences) {
  if (!sentences || n % 2 === 1) return { kind: 'card', idx: n - 1, cardNo: sentences ? (n - 1) / 2 : n - 1 };
  return { kind: 'sentence', idx: n - 2, cardNo: (n - 2) / 2 };
}

function cardDirection(settings, cardNo) {
  if (settings.direction === 'mixed') return cardNo % 2 === 0 ? 'en-de' : 'de-en';
  return settings.direction === 'de-en' ? 'de-en' : 'en-de';
}

const CASES = ['Nominativ', 'Akkusativ', 'Dativ'];
const FRAME = {
  Nominativ: (phrase, plural) => `${cap(phrase)} ${plural ? 'gefallen' : 'gefällt'} mir.`,
  Akkusativ: (phrase) => `Ich brauche ${phrase}.`,
  Dativ: (phrase) => `Ich bin zufrieden mit ${phrase}.`,
};
const FRAME_HINT = { Nominativ: 'z. B. … gefällt mir.', Akkusativ: 'z. B. Ich brauche …', Dativ: 'z. B. mit …' };

function adjStem(adj) {
  const a = adj || 'neu';
  if (a === 'hoch') return 'hoh';
  if (/[^aeiou]el$/.test(a)) return a.replace(/el$/, 'l');
  return a;
}

// definite article + adjective (weak ending) + noun in the asked case
function declined(word, kase) {
  const plural = word.article === 'die' && !word.plural && /en$/.test(word.noun);
  const g = plural ? 'pl' : { der: 'm', die: 'f', das: 'n' }[word.article];
  const art = {
    Nominativ: { m: 'der', f: 'die', n: 'das', pl: 'die' },
    Akkusativ: { m: 'den', f: 'die', n: 'das', pl: 'die' },
    Dativ: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
  }[kase][g];
  const end = g === 'pl' || kase === 'Dativ' || (kase === 'Akkusativ' && g === 'm') ? 'en' : 'e';
  const noun = word.noun === 'Nachbar' && kase !== 'Nominativ' ? 'Nachbarn' : word.noun;
  return { phrase: `${art} ${adjStem(word.adjective)}${end} ${noun}`, plural: g === 'pl', g };
}

// indefinite variants are fine too ("einen alten Schrank")
function indefinite(word, kase, g) {
  const stem = adjStem(word.adjective);
  const table = {
    Nominativ: { m: ['ein', 'er'], f: ['eine', 'e'], n: ['ein', 'es'] },
    Akkusativ: { m: ['einen', 'en'], f: ['eine', 'e'], n: ['ein', 'es'] },
    Dativ: { m: ['einem', 'en'], f: ['einer', 'en'], n: ['einem', 'en'] },
  }[kase][g];
  if (!table) return null;
  const noun = word.noun === 'Nachbar' && kase !== 'Nominativ' ? 'Nachbarn' : word.noun;
  return `${table[0]} ${stem}${table[1]} ${noun}`;
}

// pin = { word, kind?, kase? }: keep the word (and kind) of a question that is asked again
function vocabQuestion(vocab, n, settings, strongHint = false, pin = null) {
  const slot = { ...vocabSlot(n, settings.sentences), ...(pin?.kind ? { kind: pin.kind } : {}) };
  const word = pin?.word || vocab[slot.idx % vocab.length];
  const d = settings.difficulty;
  if (slot.kind === 'sentence') {
    const kase = pin?.kase || CASES[slot.idx % 3];
    const adj = word.adjective || 'neu';
    return {
      exercise: {
        number: n,
        type: 'Satzbau',
        direction: null,
        line: `Bilde einen Satz: ${word.de} + ${adj} · ${kase}`,
        hint: strongHint ? `(${declined(word, kase).phrase} …)` : d === 'hard' ? null : `(${FRAME_HINT[kase]})`,
      },
      options: [],
      word,
      kase,
    };
  }
  const dir = cardDirection(settings, slot.cardNo);
  const others = vocab.filter((w) => w !== word);
  const pick = (k) => others[(slot.idx * 7 + k * 13) % others.length];
  if (dir === 'en-de') {
    const choices = ['der', 'die', 'das'].map((a) => `${a} ${word.noun}`);
    return {
      exercise: {
        number: n,
        type: 'Karteikarte',
        direction: 'en-de',
        line: word.en[0],
        hint: strongHint ? `(${word.article} …, Anfang: ${word.noun.slice(0, 3)}…)`
          : d === 'hard' ? null : d === 'easy' ? `(Anfang: ${word.noun.slice(0, 2)}…)` : 'mit Artikel',
      },
      options: d === 'easy' ? choices : [],
      word,
    };
  }
  const choices = [word.en[0], pick(1).en[0], pick(2).en[0]].sort();
  return {
    exercise: {
      number: n,
      type: 'Karteikarte',
      direction: 'de-en',
      line: word.de,
      hint: strongHint ? `(${word.en[0].replace(/^the /, '').slice(0, 3)}…)` : d === 'hard' ? null : d === 'easy' ? '(Wähle die Bedeutung.)' : 'auf Englisch',
    },
    options: d === 'easy' ? choices : [],
    word,
  };
}

function checkVocab(q, answer, settings) {
  const a = norm(answer);
  const w = q.word;
  if (q.exercise.type === 'Satzbau') {
    const { phrase, plural, g } = declined(w, q.kase);
    const nouns = [w.noun, w.noun === 'Nachbar' ? 'Nachbarn' : null].filter(Boolean);
    const okPhrases = [phrase, indefinite(w, q.kase, g)].filter(Boolean);
    if (q.kase === 'Dativ' && g !== 'f' && g !== 'pl') okPhrases.push(phrase.replace(/^dem /, 'im '), phrase.replace(/^dem /, 'am '));
    const correct = okPhrases.some((p) => a.includes(norm(p)));
    let corrected = FRAME[q.kase](phrase, plural);
    const original = answer.trim();
    const nounAt = original.toLowerCase().split(/\s+/).findIndex((x) => nouns.some((nn) => norm(x) === norm(nn)));
    const from = Math.max(0, nounAt - 2);
    // keep the student's sentence and fix only "article + adjective + noun" – if the phrase sits
    // where that case belongs (subject at the start for Nominativ, an object later otherwise)
    if (!correct && nounAt >= 0 && (q.kase === 'Nominativ' ? from === 0 : from > 0)) {
      const parts = original.split(/\s+/);
      const punct = (parts[nounAt].match(/[.!?,]+$/) || [''])[0];
      parts.splice(from, nounAt - from + 1, `${phrase}${punct}`);
      corrected = parts.join(' ');
      if (from === 0) corrected = cap(corrected);
    }
    return {
      correct,
      corrected: correct ? original : corrected,
      changedWords: correct ? [] : [phrase],
      explanation: `${q.kase}: ${phrase}.${q.kase === 'Dativ' ? ' Im Dativ endet das Adjektiv auf -en.' : ''}`,
      rule: `${q.kase} + Adjektiv`,
      errorType: correct ? null : 'Adjektivendung',
    };
  }
  const card = `${w.de}${settings.difficulty === 'hard' && w.plural ? `, ${w.plural}` : ''}`;
  const extra = [w.plural ? `Plural: ${w.plural}.` : 'Nur Plural.', w.variants.length ? `Auch: ${w.variants.join(', ')}.` : ''].filter(Boolean).join(' ');
  if (q.exercise.direction === 'en-de') {
    const forms = [w.de, ...w.variants];
    const right = forms.some((f) => has(a, f));
    const nounOnly = forms.some((f) => has(a, f.replace(/^(der|die|das) /, '')));
    const plural = settings.difficulty !== 'hard' || !w.plural || has(a, w.plural);
    const correct = right && plural;
    return {
      correct,
      corrected: correct ? answer.trim() : card,
      changedWords: correct ? [] : right ? [w.plural] : [nounOnly ? w.article : w.de],
      explanation: correct ? extra : nounOnly && !right ? `Das Nomen stimmt, aber der Artikel ist «${w.article}». ${extra}` : extra,
      rule: w.de,
      errorType: correct ? null : nounOnly ? 'Artikel' : 'Wortschatz',
    };
  }
  const meanings = w.en.map((e) => e.replace(/^the /, ''));
  const correct = meanings.some((m) => a.includes(norm(m)));
  return {
    correct,
    corrected: correct ? answer.trim() : w.en.join(' / '),
    changedWords: correct ? [] : [w.en[0]],
    explanation: `${w.de}: ${w.en.join(', ')}. ${extra}`,
    rule: w.de,
    errorType: correct ? null : 'Wortschatz',
  };
}

// The open question as it was asked (settings may have changed since then): found by its text.
function openVocabQuestion(vocab, n, settings, line) {
  const sentence = String(line || '').match(/^Bilde einen Satz: (.+?) \+ (.+?) · (Nominativ|Akkusativ|Dativ)/);
  if (sentence) {
    const word = vocab.find((w) => w.de === sentence[1]);
    if (word) return { exercise: { number: n, type: 'Satzbau', direction: null, line }, word, kase: sentence[3] };
  }
  const byEn = vocab.find((w) => w.en[0] === line);
  if (byEn) return { exercise: { number: n, type: 'Karteikarte', direction: 'en-de', line }, word: byEn };
  const byDe = vocab.find((w) => w.de === line);
  if (byDe) return { exercise: { number: n, type: 'Karteikarte', direction: 'de-en', line }, word: byDe };
  return vocabQuestion(vocab, n, settings);
}

function openGrammarItem(examples, n, line) {
  const i = examples.findIndex((ex) => ex.task === line || line === ex.task.replace(/^[^:]*:\s*/, 'Finde den Fehler: '));
  return grammarItem(examples, i >= 0 ? i + 1 : n);
}

// ---------- the demo tutor ----------
export async function mockReply({ text, settings, session, progress, topic }) {
  const say = norm(text);
  if (/langsam|slow/.test(say)) await new Promise((r) => setTimeout(r, 4000));
  if (/kaputt|broken/.test(say)) return '{"message": "Das ist absichtlich kaputtes JSON, damit du die Fehlerbehandlung testen kannst", "feedback": {"forNumber": 2, "corr';
  if (/rohtext|raw text/.test(say)) return 'Das ist eine Antwort ohne JSON. Die App zeigt sie als normale Nachricht.';
  if (/absturz|crash/.test(say)) throw new ModelError('Simulierter Fehler (Demo-Modus)', 502);

  const lessons = listLessons();
  const topicId = topic?.id || DEFAULT_GRAMMAR;
  const isVocab = Boolean(topic) && topic.type !== 'Grammatik' && topic.id !== 'free';
  const vocab = isVocab ? getVocab(topicId) : [];
  const examples = getExamples(isVocab || topicId === 'free' ? DEFAULT_GRAMMAR : topicId);
  const useVocab = isVocab && vocab.length > 0;
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
  const openQ = useVocab && open && session.openLine ? openVocabQuestion(vocab, open, settings, session.openLine) : null;
  const ask = (n, strongHint = false) => {
    let pin = null;
    if (openQ && n === open) pin = { word: openQ.word, kind: openQ.exercise.type === 'Satzbau' ? 'sentence' : 'card', kase: openQ.kase };
    else if (openQ && settings.sentences && openQ.exercise.type !== 'Satzbau') pin = { word: openQ.word, kind: 'sentence' };
    else if (openQ) pin = { kind: 'card' };
    const q = useVocab ? vocabQuestion(vocab, n, settings, strongHint, pin) : grammarQuestion(examples, n, settings.difficulty, strongHint);
    out.exercise = q.exercise;
    out.options = q.options;
  };
  const json = () => JSON.stringify(out);

  // the session is over: talk, but no new questions
  if (session.finished) {
    out.message = 'Diese Runde ist fertig. Tippe «Same topic again» für eine neue Runde oder wähle ein anderes Thema.';
    return json();
  }
  // the student wants to stop (in words the app did not catch)
  if (/keine lust|muss (jetzt )?gehen|ich höre auf|ich hoere auf|bis morgen|tschüss|tschuess/.test(say)) {
    out.message = 'Kein Problem – gut gemacht für heute. Bis bald!';
    out.session.finished = true;
    return json();
  }
  // the student asks for another topic in their own words
  const wish = detectTopicWish(text, lessons, { running: true });
  const other = wish && lessons.find((l) => l.id !== topicId && (l.id === wish.topicId || l.type === wish.group));
  if (other) {
    out.message = `Okay, wir wechseln zu «${other.short}».`;
    out.session.topicId = other.id;
    out.session.topicName = other.short;
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
    const sq = useVocab ? openVocabQuestion(vocab, k, settings, session.skippedLine) : null;
    const solution = useVocab
      ? sq.exercise.type === 'Satzbau' ? FRAME[sq.kase](declined(sq.word, sq.kase).phrase, declined(sq.word, sq.kase).plural)
        : sq.exercise.direction === 'en-de' ? sq.word.de : sq.word.en[0]
      : openGrammarItem(examples, k, session.skippedLine).solved;
    out.message = `Kein Problem. Die Lösung: **${solution}**`;
    if (k < total) ask(k + 1);
    return json();
  }

  // nothing open: start (question 1) or continue with the next question
  if (!open) {
    out.grammarFocus = useVocab ? FOCUS.vocab : FOCUS.grammar;
    out.message = progress.done
      ? 'Weiter geht’s!'
      : useVocab
        ? `Los geht’s mit den Karteikarten zu «${topic.short}». (Demo-Modus)`
        : `Sehr gern! Wir üben «${topic?.short || 'Dativ oder Akkusativ'}». (Demo-Modus)`;
    ask(progress.done + 1);
    return json();
  }

  // help with the open question
  const intent0 = detectIntent(text);
  const q = useVocab ? openVocabQuestion(vocab, open, settings, session.openLine) : null;
  if (intent0?.type === 'rule' || /^(erklär|erklaer|explain|regel|rule)/.test(say)) {
    out.message = useVocab
      ? 'Merke dir jedes Nomen mit **Artikel** und Plural. Im Dativ enden Adjektive nach dem Artikel auf -en.'
      : 'Die Regel: Bei den Wechselpräpositionen fragst du **Wo?** (Position) → Dativ oder **Wohin?** (Bewegung) → Akkusativ.';
    out.grammarFocus = useVocab ? FOCUS.vocab : FOCUS.grammar;
    out.panelView = 'grammar';
    ask(open);
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
  if (['difficulty', 'level', 'direction', 'sentences', 'questions'].includes(intent?.type)) {
    out.message = 'Alles klar, ich passe die Aufgabe an.';
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
      changedWords: [],
      explanation: item.ex.type ? `${item.ex.type.replace(/→/g, '→')}: ${r.correct ? 'genau richtig.' : `richtig ist «${item.parts.join(' – ')}».`}` : '',
      rule: (item.ex.type || '').replace(/Akk$/, 'Akkusativ').replace(/Dat$/, 'Dativ'),
      errorType: r.correct ? null : 'Kasus',
    };
  }
  const right = out.feedback.correct;
  if (open >= total) {
    out.message = right ? 'Super, das war die letzte Frage – gut gemacht!' : 'Das war die letzte Frage. Gut gemacht – schau dir rechts deine Lücken an.';
    return json();
  }
  out.message = right ? ['Super, genau richtig!', 'Perfekt!', 'Sehr gut!'][open % 3] : 'Fast! Nur eine kleine Änderung:';
  ask(open + 1);
  return json();
}
