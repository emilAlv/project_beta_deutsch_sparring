// Grammar tasks for ONE word, used by the demo tutor (MOCK=1). The real tutor (Gemini) gets the
// same rules as text in lib/prompt.js; this file builds and checks the same kinds of tasks without AI.
//   nouns      → the noun phrase in Akkusativ / Dativ / Genitiv (+ its adjective with the right ending)
//   verbs      → Perfekt (hat/ist + Partizip) and a sentence with the case the verb needs
//   adjectives → fill in the ending
// Every task: { kind, type, line, rule, hint(strong, difficulty), options(difficulty), solution, check(answer) }
// check() → { correct, corrected, changedWords, explanation, rule, errorType }  (errorType in German, as the tutor writes it:
// Artikel / Wortschatz = the word or its article · Kasus / Adjektivendung / Verbform / Präposition = the grammar)
// The German in here is written out by hand and checked by scripts/check-word-tasks.mjs.

import { align } from './variants.js';
import { GRAMMAR_POINTS, CASE_POINTS, RULES } from './grammar.js';
import {
  nounPhrase, withEnding, genderOf, pluralOf, articlesOfGender, definiteArticle, indefiniteArticle, weakEnding, mixedEnding,
} from './declension.js';

// ---------- small helpers ----------
export const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, ' ').replace(/\s+/g, ' ').trim();
// a Swiss word in the answer counts for its German word and the other way round (lib/variants.js); ss = ß (norm)
const has = (hay, needle) => ` ${norm(align(hay, needle))} `.includes(` ${norm(needle)} `);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const GENDER_DE = { m: 'maskulin', f: 'feminin', n: 'neutral', pl: 'Plural' };

// "in dem" ↔ "im": the forms of a preposition + phrase that are both correct
const CONTRACT = [[/^(in) dem /, 'im '], [/^(in) das /, 'ins '], [/^(an) dem /, 'am '], [/^(an) das /, 'ans '], [/^(auf) das /, 'aufs '],
  [/^(zu) dem /, 'zum '], [/^(zu) der /, 'zur '], [/^(bei) dem /, 'beim '], [/^(von) dem /, 'vom ']];
function prepForms(prep, phrase) {
  const full = `${prep} ${phrase}`;
  const out = [full];
  for (const [re, short] of CONTRACT) if (re.test(full)) out.push(full.replace(re, short));
  return out;
}

const usableAdjective = (a) => (/^[a-zäöü]+$/.test(a || '') ? a : '');
// adjectives that get no ending (or only stand after the noun): no ending task
const NO_ENDING = new Set(['lila', 'rosa', 'orange', 'online', 'egal', 'fit', 'allein', 'bio', 'chic', 'mittlere', 'verschiedene']);

// ---------- nouns ----------
// The vocabulary table knows a noun's fitting adjective, but not which verbs or situations fit
// that noun. Noun tasks therefore practise the noun phrase itself. The live tutor can create
// contextual sentences; the deterministic demo must not manufacture arbitrary predicates.
const NOUN_RULES = {
  Akkusativ: RULES.nounAkk,
  Dativ: RULES.nounDat,
  Genitiv: RULES.nounGen,
};

function nounTasks(w, grammar) {
  const g = genderOf(w);
  if (!g || !w.noun) return [];
  const useAdj = grammar.includes('adjective-endings');
  const adj = useAdj ? usableAdjective(w.adjective) || 'neu' : null;
  let cases = Object.entries(CASE_POINTS).filter(([point]) => grammar.includes(point)).map(([, c]) => c);
  if (!cases.length) cases = ['Akkusativ', 'Dativ'];
  const out = [];
  for (const kase of cases) {
    const np = nounPhrase(w, kase, { adj });
    if (np) out.push(nounTask(w, kase, np, adj));
  }
  return out;
}

function nounTask(w, kase, np, adj) {
  const g = np.gender;
  // The prompt supplies the definite base article, so only definite variants are valid.
  const phrases = [np.phrase, ...np.alts.filter((p) => p.split(' ')[0] === np.art)];
  const solution = np.phrase;
  const cue = [w.article, adj, w.noun].filter(Boolean).join(' · ');
  const line = `Setze in den ${kase}: ${cue}`;
  const rule = NOUN_RULES[kase];
  const nounForms = [w.noun, pluralOf(w), np.noun].filter(Boolean).map(norm);
  const ending = adj ? `Das Adjektiv endet auf -${np.ending} nach «${np.art}».` : '';
  const caseNote = kase === 'Genitiv' && g !== 'f' && g !== 'pl' ? `Maskulin und neutral: ${np.noun} (${kase}).` : '';
  return {
    kind: 'noun', type: 'Nomen-Drill', line, rule, solution, wordId: w.id,
    hint: (strong, d) => {
      if (d === 'hard' && !strong) return null;
      const parts = [GENDER_DE[g], kase];
      if (strong || d === 'easy') {
        parts.push(`Artikel: ${np.art}`);
        if (adj) parts.push(`Adjektivendung: -${np.ending}`);
      }
      return `(${parts.join(' · ')})`;
    },
    options: () => [],
    check(answer) {
      const a = norm(answer);
      const correct = phrases.some((p) => has(a, p));
      const explanation = [`${kase}: ${np.phrase}.`, ending, caseNote].filter(Boolean).join(' ');
      if (correct) return { correct: true, corrected: answer.trim(), changedWords: [], explanation, rule, errorType: null };

      const tokens = a.split(' ');
      const nounAt = tokens.findIndex((t) => nounForms.some((f) => t.startsWith(f) && t.length <= f.length + 4));
      let errorType = 'Kasus';
      let ruleOut = rule;
      let note = '';
      if (nounAt < 0) {
        errorType = 'Wortschatz';
        ruleOut = `${w.article} ${w.noun}`;
        note = `Benutze das Wort «${w.article} ${w.noun}».`;
      } else {
        const artAt = nounAt - (adj ? 2 : 1);
        const art = artAt >= 0 ? tokens[artAt] : '';
        const sameGender = articlesOfGender(g);
        const anyDefinite = ['der', 'die', 'das', 'den', 'dem', 'des'];
        if (art === np.art) {
          errorType = adj && tokens[nounAt - 1] !== norm(withEnding(adj, np.ending))
            && !phrases.some((p) => p.split(' ').includes(tokens[nounAt - 1]))
            ? 'Adjektivendung' : 'Kasus';
        } else if (!art || !anyDefinite.includes(art) || !sameGender.includes(art)) {
          errorType = 'Artikel';
          ruleOut = `${w.article} ${w.noun}`;
          note = `Der Ausgangsartikel von «${w.noun}» ist «${w.article}».`;
        }
      }
      return {
        correct: false,
        corrected: solution,
        changedWords: [np.phrase],
        explanation: [note, explanation].filter(Boolean).join(' '),
        rule: ruleOut,
        errorType,
      };
    },
  };
}

// ---------- verbs ----------
const PERSONS = [
  { p: 'ich', haben: 'habe', sein: 'bin', refl: 'mich' },
  { p: 'du', haben: 'hast', sein: 'bist', refl: 'dich' },
  { p: 'er', haben: 'hat', sein: 'ist', refl: 'sich' },
  { p: 'wir', haben: 'haben', sein: 'sind', refl: 'uns' },
];

export function infinitive(w) {
  return String(w.de || '').split(/\s*→\s*/)[0].split(',')[0].replace(/^\(sich\)\s*/, '').trim(); // "(sich) duschen" → "duschen"
}

function perfektParts(w) {
  const m = String(w.perfekt || '').match(/^(hat|ist) (.+)$/);
  return m ? { aux: m[1] === 'hat' ? 'haben' : 'sein', rest: m[2].trim() } : null;
}

function perfektTasks(w) {
  const parts = perfektParts(w);
  const inf = infinitive(w);
  if (!parts || !inf) return [];
  const rule = parts.aux === 'sein' ? RULES.perfektSein : RULES.perfektHaben;
  return PERSONS.map((who) => {
    const auxForm = who[parts.aux];
    const rest = parts.rest.replace(/\bsich\b/, who.refl);
    const solution = `${cap(who.p)} ${auxForm} ${rest}.`;
    const wrongAux = who[parts.aux === 'sein' ? 'haben' : 'sein'];
    const participle = rest.split(' ').pop();
    return {
      kind: 'perfekt', type: 'Satzbau', line: `Bilde das Perfekt: ${who.p} + ${inf}`, rule, solution, wordId: w.id,
      hint: (strong, d) => (strong ? `(Hilfsverb: ${parts.aux === 'sein' ? 'sein' : 'haben'})` : d === 'hard' ? null : d === 'easy' ? '(haben oder sein?)' : '(Hilfsverb + Partizip)'),
      options: (d) => (d === 'easy' ? [`${cap(who.p)} ${auxForm} ${rest}`, `${cap(who.p)} ${wrongAux} ${rest}`].sort() : []),
      check(answer) {
        const a = norm(answer);
        const needed = [auxForm, ...rest.split(' ')];
        const correct = needed.every((t) => has(a, t));
        const explanation = `Perfekt: ${parts.aux === 'sein' ? 'sein' : 'haben'} + Partizip → ${auxForm} ${rest}.${parts.aux === 'sein' ? ' Bewegung oder Zustandsänderung: Perfekt mit «sein».' : ''}`;
        if (correct) return { correct: true, corrected: answer.trim(), changedWords: [], explanation, rule, errorType: null };
        const auxWrong = has(a, wrongAux) && !has(a, auxForm);
        return {
          correct: false,
          corrected: solution,
          changedWords: auxWrong ? [auxForm] : [auxForm, participle],
          explanation: `${auxWrong ? `Das Hilfsverb ist «${auxForm}». ` : ''}${explanation}`,
          rule,
          errorType: 'Verbform',
        };
      },
    };
  });
}

// the objects for the verb + case sentences (nouns we know how to decline)
const OBJECTS = {
  person: [{ id: 'o1', article: 'der', noun: 'Freund', plural: 'die Freunde' }, { id: 'o2', article: 'die', noun: 'Lehrerin', plural: 'die Lehrerinnen' }, { id: 'o3', article: 'das', noun: 'Kind', plural: 'die Kinder' }],
  thing: [{ id: 'o4', article: 'der', noun: 'Brief', plural: 'die Briefe' }, { id: 'o5', article: 'die', noun: 'Tasche', plural: 'die Taschen' }, { id: 'o6', article: 'das', noun: 'Paket', plural: 'die Pakete' }],
  place: [{ id: 'o7', article: 'der', noun: 'Garten', plural: 'die Gärten' }, { id: 'o8', article: 'die', noun: 'Stadt', plural: 'die Städte' }, { id: 'o9', article: 'das', noun: 'Haus', plural: 'die Häuser' }],
};
const PREP_SHORT = { in: ['im', 'ins'], an: ['am', 'ans'], auf: ['aufs'], zu: ['zum', 'zur'], bei: ['beim'], von: ['vom'] };
const PLACE_PREPS = ['in', 'an', 'auf', 'aus', 'nach', 'zu'];

// "in + Akk" / "Dat" / "bei + Dat, für + Akk" (the first part counts) → { prep, kase } or null
export function verbCase(w) {
  const first = String(w.case || '').split(',')[0].trim();
  const m = first.match(/^(?:([a-zäöü]+) \+ )?(Akk|Dat)$/);
  return m ? { prep: m[1] || null, kase: m[2] === 'Akk' ? 'Akkusativ' : 'Dativ' } : null;
}

function verbCaseTasks(w) {
  const vc = verbCase(w);
  let inf = infinitive(w);
  if (!vc || !inf || /^sich /.test(inf)) return [];
  if (vc.prep) inf = inf.replace(new RegExp(`\\s+${vc.prep}$`), ''); // "achten auf" → "achten"
  const pool = vc.prep ? (PLACE_PREPS.includes(vc.prep) ? OBJECTS.place : OBJECTS.person) : vc.kase === 'Akkusativ' ? OBJECTS.thing : OBJECTS.person;
  const rule = vc.prep ? RULES.prep(vc.kase, vc.prep) : vc.kase === 'Akkusativ' ? RULES.verbAkk : RULES.verbDat;
  const core = norm(inf).replace(/e?n$/, '').slice(-3);
  return pool.map((obj) => {
    const np = nounPhrase({ ...obj, number: '' }, vc.kase);
    const phrases = [np.phrase, ...np.alts];
    const accepted = vc.prep ? phrases.flatMap((p) => prepForms(vc.prep, p)) : phrases;
    const main = vc.prep ? prepForms(vc.prep, np.phrase)[0] : np.phrase;
    const solution = `Ich möchte ${main} ${inf}.`;
    const why = vc.prep
      ? `«${inf} ${vc.prep}» steht mit ${vc.kase === 'Akkusativ' ? 'dem Akkusativ' : 'dem Dativ'}: ${main}.`
      : `«${inf}» steht mit ${vc.kase === 'Akkusativ' ? 'dem Akkusativ (Wen oder was?)' : 'dem Dativ (Wem?)'}: ${np.phrase}.`;
    return {
      kind: 'verbcase', type: 'Satzbau', line: `Bilde einen Satz: ${inf} + ${obj.article} ${obj.noun}`, rule, solution, wordId: w.id,
      hint: (strong, d) => (strong ? `(Ich möchte ${vc.prep ? `${vc.prep} ` : ''}… ${inf}) – ${vc.kase}` : d === 'hard' ? null : d === 'easy' ? `(Ich möchte … ${inf} · ${vc.kase})` : `(Ich möchte … ${inf})`),
      options: () => [],
      check(answer) {
        const a = norm(answer);
        const correct = accepted.some((p) => has(a, p));
        if (correct) return { correct: true, corrected: answer.trim(), changedWords: [], explanation: why, rule, errorType: null };
        const verbThere = a.includes(core);
        const prepThere = !vc.prep || a.split(' ').some((t) => t === vc.prep || (PREP_SHORT[vc.prep] || []).includes(t));
        let errorType = 'Kasus';
        let ruleOut = rule;
        if (!verbThere) {
          errorType = 'Wortschatz';
          ruleOut = w.de.split(/\s*→\s*/)[0];
        } else if (!prepThere) errorType = 'Präposition';
        return { correct: false, corrected: solution, changedWords: [main], explanation: why, rule: ruleOut, errorType };
      },
    };
  });
}

function verbTasks(w, grammar) {
  const wantsPerfekt = grammar.includes('perfekt');
  const wantsCase = grammar.includes('verb-case');
  const perfekt = perfektTasks(w);
  const cases = verbCaseTasks(w);
  let list;
  if (wantsPerfekt && wantsCase) list = perfekt.flatMap((t, i) => (cases[i] ? [t, cases[i]] : [t]));
  else if (wantsCase && cases.length) list = cases;
  else list = perfekt; // Perfekt chosen – or nothing for verbs chosen, or no case to practise: Perfekt is the usual task
  return list.length ? list : cases;
}

// ---------- adjectives ----------
const PERSON_NOUNS = { m: ['der', 'Mann'], f: ['die', 'Frau'], n: ['das', 'Kind'], pl: ['die', 'Kinder'] };
const GEN_NOUN = { m: 'Mannes', f: 'Frau', n: 'Kindes', pl: 'Kinder' };
const DAT_NOUN = { m: 'Mann', f: 'Frau', n: 'Kind', pl: 'Kindern' };
const NOM_NOUN = PERSON_NOUNS;

function endingTasks(w, grammar) {
  const adj = usableAdjective(String(w.de || '').split(' / ')[0]);
  if (!adj || NO_ENDING.has(adj)) return [];
  let cases = Object.entries(CASE_POINTS).filter(([point]) => grammar.includes(point)).map(([, c]) => c);
  if (!cases.length) cases = ['Nominativ', 'Akkusativ', 'Dativ'];
  const out = [];
  for (const g of ['m', 'f', 'n', 'pl']) {
    for (const definite of [true, false]) {
      if (!definite && g === 'pl') continue;
      for (const kase of cases) out.push(endingTask(w, adj, kase, g, definite));
    }
  }
  return out;
}

function endingTask(w, adj, kase, g, definite) {
  const art = definite ? definiteArticle(kase, g) : indefiniteArticle(kase, g);
  const ending = definite ? weakEnding(kase, g) : mixedEnding(kase, g);
  const form = withEnding(adj, ending);
  const noun = kase === 'Genitiv' ? GEN_NOUN[g] : kase === 'Dativ' ? DAT_NOUN[g] : NOM_NOUN[g][1];
  const verb = g === 'pl' ? 'warten' : 'wartet';
  const frame = {
    Nominativ: (a) => `${cap(art)} ${a} ${noun} ${verb} hier.`,
    Akkusativ: (a) => `Ich sehe ${art} ${a} ${noun}.`,
    Dativ: (a) => `Ich helfe ${art} ${a} ${noun}.`,
    Genitiv: (a) => `Wegen ${art} ${a} ${noun} bleiben wir zu Hause.`,
  }[kase];
  const rule = definite ? RULES.endingDefinite : RULES.endingIndefinite;
  const solution = frame(form);
  const allEndings = ['e', 'en', 'er', 'es'];
  return {
    kind: 'ending', type: 'Lückentext', line: `Ergänze die Endung: ${frame(`___ (${adj})`)}`, rule, solution, wordId: w.id,
    hint: (strong, d) => (strong ? `(${GENDER_DE[g]}, ${kase})` : d === 'hard' ? null : d === 'easy' ? `(Nach «${art}»: ${GENDER_DE[g]}, ${kase})` : '(Adjektiv mit Endung)'),
    options: (d) => (d === 'easy' ? [form, ...allEndings.map((e) => withEnding(adj, e)).filter((x) => x !== form).slice(0, 2)].sort() : []),
    check(answer) {
      const a = norm(answer);
      const tokens = a.split(' ');
      const endOnly = a.replace(/^-/, '');
      const correct = tokens.includes(form) || (allEndings.includes(endOnly) && endOnly === ending);
      const explanation = `Nach «${art}» (${GENDER_DE[g]}, ${kase}) endet das Adjektiv auf -${ending}: ${form}.`;
      if (correct) return { correct: true, corrected: solution, changedWords: [], explanation, rule, errorType: null };
      const short = norm(withEnding(adj, '')).slice(0, 3);
      const sameAdjective = allEndings.includes(endOnly) || tokens.some((t) => t.startsWith(short));
      return {
        correct: false, corrected: solution, changedWords: [form], explanation,
        rule: sameAdjective ? rule : w.de.split(' / ')[0],
        errorType: sameAdjective ? 'Adjektivendung' : 'Wortschatz',
      };
    },
  };
}

// ---------- public ----------
// All grammar tasks a word can get with the chosen points (best first). Phrases and other word types: none.
export function taskList(w, grammar = GRAMMAR_POINTS) {
  if (w.type === 'noun') {
    const list = nounTasks(w, grammar);
    return list.length ? list : nounTasks(w, [...grammar.filter((p) => p !== 'genitiv'), 'akkusativ']);
  }
  if (w.type === 'verb') return verbTasks(w, grammar);
  if (w.type === 'adjective') return endingTasks(w, grammar);
  return [];
}

// The idx-th word of the session → its grammar task (idx also varies the case / frame between words)
export function chooseTask(w, grammar, idx = 0) {
  const list = taskList(w, grammar);
  return list.length ? list[Math.abs(idx) % list.length] : null;
}

// A task that was asked earlier, found again by its text (the demo tutor keeps no memory).
// lib/reply.js strips quotation marks at the ends of a line: compare without them.
const bare = (s) => String(s || '').replace(/^[„"“»«]+|[“"”«»]+$/g, '').trim();
export function findTask(w, line) {
  const withoutAdj = GRAMMAR_POINTS.filter((p) => p !== 'adjective-endings');
  for (const grammar of [GRAMMAR_POINTS, withoutAdj, ['adjective-endings'], []]) {
    const t = taskList(w, grammar).find((x) => bare(x.line) === bare(line));
    if (t) return t;
  }
  return null;
}
