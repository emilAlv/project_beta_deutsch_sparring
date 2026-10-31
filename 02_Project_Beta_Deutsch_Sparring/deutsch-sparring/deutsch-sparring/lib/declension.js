// German noun phrases (article + adjective + noun) in Nominativ / Akkusativ / Dativ / Genitiv.
// Pure functions, used by the demo tutor (lib/mock.js, lib/word-tasks.js) to build and check
// sentence tasks. Spelling: the word list is Swiss ("ss"); lib/variants.js turns it into "ß" for the German variant before it gets here.
// A noun that we cannot decline with confidence (e.g. a masculine noun with an unusual genitive)
// gets no Genitiv task (nounPhrase returns null) – better no task than a wrong "correct" answer.

export const CASES = ['Nominativ', 'Akkusativ', 'Dativ', 'Genitiv'];

const DEFINITE = {
  Nominativ: { m: 'der', f: 'die', n: 'das', pl: 'die' },
  Akkusativ: { m: 'den', f: 'die', n: 'das', pl: 'die' },
  Dativ: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
  Genitiv: { m: 'des', f: 'der', n: 'des', pl: 'der' },
};
const INDEFINITE = {
  Nominativ: { m: 'ein', f: 'eine', n: 'ein' },
  Akkusativ: { m: 'einen', f: 'eine', n: 'ein' },
  Dativ: { m: 'einem', f: 'einer', n: 'einem' },
  Genitiv: { m: 'eines', f: 'einer', n: 'eines' },
};
// adjective endings after der/die/das (weak) and after ein/eine (mixed)
const WEAK_END = {
  Nominativ: { m: 'e', f: 'e', n: 'e', pl: 'en' },
  Akkusativ: { m: 'en', f: 'e', n: 'e', pl: 'en' },
  Dativ: { m: 'en', f: 'en', n: 'en', pl: 'en' },
  Genitiv: { m: 'en', f: 'en', n: 'en', pl: 'en' },
};
const MIXED_END = {
  Nominativ: { m: 'er', f: 'e', n: 'es' },
  Akkusativ: { m: 'en', f: 'e', n: 'es' },
  Dativ: { m: 'en', f: 'en', n: 'en' },
  Genitiv: { m: 'en', f: 'en', n: 'en' },
};
const STRONG_PL_END = { Nominativ: 'e', Akkusativ: 'e', Dativ: 'en', Genitiv: 'er' }; // no article: "alte Schränke"

// adjective + ending: hoch → hohe, dunkel → dunkle, teuer → teure
export function withEnding(adj, ending) {
  let a = adj || 'neu';
  if (a === 'hoch') a = 'hoh';
  else if (/[^aeiou]el$/.test(a)) a = a.replace(/el$/, 'l');
  else if (/(eu|au)er$/.test(a)) a = a.replace(/er$/, 'r');
  if (/e$/.test(a) && ending.startsWith('e')) return a + ending.slice(1); // müde + en = müden, böse + e = böse
  return a + ending;
}

export const genderOf = (w) => (w.number === 'pl' ? 'pl' : { der: 'm', die: 'f', das: 'n' }[w.article] || null);

// "die Schränke" → "Schränke" ('' when the word has no usable plural)
export function pluralOf(w) {
  if (w.number === 'pl') return w.noun;
  const p = String(w.plural || '').replace(/^(der|die|das)\s+/, '').trim();
  return /^[A-ZÄÖÜ][^\s/,()]*$/.test(p) ? p : '';
}

// ---- genitive / dative / accusative singular of masculine and neuter nouns ----
const MIXED_NS = /([Nn]ame|[Bb]uchstabe|[Gg]edanke|[Gg]laube|[Ww]ille|[Ff]unke|[Ff]riede|[Hh]aufe)$/; // des Namens, des Familiennamens
const WEAK_LIST = { Mensch: 'Menschen', Nachbar: 'Nachbarn', Herr: 'Herrn', Bär: 'Bären', Held: 'Helden', Prinz: 'Prinzen', Narr: 'Narren', Graf: 'Grafen', Pilot: 'Piloten' };
// masculine / neuter nouns on -ee are strong: der See – den See – des Sees (not the weak «den Seen»), also Schnee, Tee, Kaffee, Klee
const STRONG_EE = /ee$/;
// English loanwords: genitive -s only (des Jobs, des Snacks), never -es
const LOAN_S = new Set(['Job', 'Snack', 'Song', 'Hit', 'Link', 'Blog', 'Steak', 'Fan', 'Chef', 'Park', 'Club', 'Cent', 'Sport']);
// both endings are correct: des Meeres / des Meers, des Tieres / des Tiers …  (main form first)
const BOTH_S_ES = new Set(['Meer', 'Tier', 'Bier', 'Haar']);
// nouns made from an adjective (der Bekannte, das Selbstgemachte): they decline like an adjective
const isAdjNoun = (w) => w.note === 'Adj.-Nomen';
const adjNounForm = (n, ending) => cap(withEnding(n.toLowerCase(), ending)); // Selbstgemachte + en → Selbstgemachten
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const countVowelGroups = (s) => (s.toLowerCase().match(/[aeiouäöüy]+/g) || []).length;

// weak masculine nouns (der Kunde – den/dem Kunden): the form for Akkusativ and Dativ (and Genitiv).
// → string, 'unsure' for a masculine noun with a plural in -n/-en we cannot tell apart, or null (strong noun)
function weakForm(w) {
  const n = w.noun;
  if (genderOf(w) !== 'm') return null;
  if (STRONG_EE.test(n)) return null; // der See, der Tee …: plural -s / -n, but not weak
  if (WEAK_LIST[n]) return WEAK_LIST[n];
  const p = pluralOf(w);
  if (MIXED_NS.test(n)) return `${n}n`;
  if (/e$/.test(n) && p === `${n}n`) return `${n}n`; // Kunde, Kollege
  if (/(ent|ant|ist|oge)$/.test(n) && p === `${n}en`) return `${n}en`; // Student, Tourist
  if (p && p === `${n}${/e$/.test(n) ? 'n' : 'en'}` && !/(el|er|en|or)$/.test(n)) return 'unsure'; // Staat? – do not guess
  return null;
}

// genitive singular → { main, alts } or null when we are not sure
export function genitiveSg(w) {
  const n = w.noun;
  const g = genderOf(w);
  if (g === 'f') return { main: n, alts: [] };
  if (g !== 'm' && g !== 'n') return null;
  if (!/^[A-ZÄÖÜ][a-zäöüß]*$/.test(n) || !/[aeiouäöü]/.test(n)) return null; // no abbreviations (Kfz)
  const weak = weakForm(w);
  if (weak === 'unsure') return null;
  if (weak) return { main: MIXED_NS.test(n) ? `${n}ns` : weak, alts: [] };
  if (STRONG_EE.test(n)) return { main: `${n}s`, alts: [] }; // des Sees, des Tees, des Kaffees
  if (LOAN_S.has(n)) return { main: `${n}s`, alts: [] }; // des Jobs, des Snacks, des Chefs
  if (BOTH_S_ES.has(n)) return { main: `${n}s`, alts: [`${n}es`] }; // des Meers / des Meeres
  if (/e$/.test(n)) return null; // Ende, Auge, Interesse, Käse …
  if (/(au|ei|ie|eu|äu|ai)s$/.test(n) || /(ss|ß|x|z|sch)$/.test(n) || /[^aeiouäöüs]s$/.test(n)) return { main: `${n}es`, alts: [] }; // Haus, Platz, Tisch, Kurs
  if (/[aeiouäöü]s$/.test(n)) return null; // Ergebnis, Bus, Kürbis … (double s)
  if (/[aeiouäöüy]$/.test(n)) return { main: `${n}s`, alts: [] }; // Auto, Büro, Hobby
  if (/(el|er|en|chen|lein|ling)$/.test(n)) return { main: `${n}s`, alts: [] }; // des Schlüssels
  if (countVowelGroups(n) === 1) {
    return /[dtgbk]$/.test(n) ? { main: `${n}es`, alts: [`${n}s`] } : { main: `${n}s`, alts: [`${n}es`] }; // des Wortes / des Teils
  }
  return { main: `${n}s`, alts: [] }; // des Abends
}

// dative plural: noun + n – but not after n or s, not after a vowel other than e (Kameras, Hobbys need none anyway),
// not after units (die Euro, die Cent: mit zehn Euro) and not for abbreviations (die Lkw, die PCs)
const UNITS = new Set(['Euro', 'Cent', 'Dollar']);
const datPl = (p) => {
  if (/[ns]$/.test(p) || /[aiouäöüy]$/.test(p) || UNITS.has(p)) return p;
  if (/^[A-ZÄÖÜ]{2,}s?$/.test(p) || !/[aeiouäöüy]/i.test(p) || p.includes('.')) return p;
  return `${p}n`;
};

// The noun in the asked case and number → { text, alts } or null
function nounForm(w, kase, plural) {
  if (isAdjNoun(w)) {
    const g = plural ? 'pl' : genderOf(w);
    return g ? { text: adjNounForm(w.noun, WEAK_END[kase][g]), alts: [] } : null;
  }
  if (plural) {
    const p = pluralOf(w);
    if (!p) return null;
    return { text: kase === 'Dativ' ? datPl(p) : p, alts: [] };
  }
  if (genderOf(w) === 'pl') return null;
  if (kase === 'Genitiv') {
    const gen = genitiveSg(w);
    return gen && { text: gen.main, alts: gen.alts };
  }
  if (kase !== 'Nominativ') {
    const weak = weakForm(w);
    if (weak === 'unsure') return null;
    if (weak) return { text: weak, alts: [] };
  }
  return { text: w.noun, alts: [] };
}

// Noun phrase of a word in a case. opts: { adj (string|null), plural (bool) }
// → { phrase, alts[] (other correct phrases), art, gender, ending, noun } or null (cannot be formed safely)
export function nounPhrase(w, kase, { adj = null, plural = false } = {}) {
  const g = plural || w.number === 'pl' ? 'pl' : genderOf(w);
  if (!g) return null;
  const isPl = g === 'pl';
  const noun = nounForm(w, kase, isPl);
  if (!noun) return null;
  const art = DEFINITE[kase][g];
  const ending = WEAK_END[kase][g];
  const join = (...parts) => parts.filter(Boolean).join(' ');
  const main = join(art, adj && withEnding(adj, ending), noun.text);
  const alts = [];
  for (const n of [noun.text, ...noun.alts]) {
    if (n !== noun.text) alts.push(join(art, adj && withEnding(adj, ending), n));
    // an adjective noun takes the ending itself: ein neues Selbstgemachtes, neue Bekannte
    const nn = (end) => (isAdjNoun(w) ? adjNounForm(w.noun, end) : n);
    if (isPl) alts.push(join(adj && withEnding(adj, STRONG_PL_END[kase]), nn(STRONG_PL_END[kase]))); // "alte Schränke"
    else alts.push(join(INDEFINITE[kase][g], adj && withEnding(adj, MIXED_END[kase][g]), nn(MIXED_END[kase][g]))); // "einen alten Schrank"
  }
  return { phrase: main, alts: [...new Set(alts)].filter((x) => x !== main), art, gender: g, ending, noun: noun.text };
}

// All definite articles of a gender (any case) – to tell "wrong case" from "wrong gender"
export const articlesOfGender = (g) => [...new Set(CASES.map((c) => DEFINITE[c][g]))];
export const definiteArticle = (kase, g) => DEFINITE[kase][g];
export const indefiniteArticle = (kase, g) => INDEFINITE[kase][g];
export const weakEnding = (kase, g) => WEAK_END[kase][g];
export const mixedEnding = (kase, g) => MIXED_END[kase][g];
