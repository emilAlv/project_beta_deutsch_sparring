// Swiss or German Hochdeutsch – ONE shared place for everything that differs between the two:
//   spelling      Swiss "ss" (Strasse) ↔ German "ß" (Straße)           → toVariant()
//   word choice   Velo ↔ Fahrrad, Spital ↔ Krankenhaus …              → PAIRS, localizeWord()
//   comparing     "Strasse" = "Straße", "das Velo" = "das Fahrrad"     → sameAnswer(), align()
// The word list (vocab/words.json) stays Swiss. The conversion happens when something is SHOWN
// (flashcards, corrections); an answer is accepted in either variant.
// The student's variant: 'ch' (default) | 'de'. Pure functions, no React, no server code.

export const VARIANTS = ['ch', 'de'];
export const DEFAULT_VARIANT = 'ch';

// Anything from the browser → 'ch' | 'de' ('ch' when unknown).
export const cleanVariant = (v) => (VARIANTS.includes(v) ? v : DEFAULT_VARIANT);

// ---------- the word pairs (only pairs that are certain) ----------
// Nouns: art = article, w = word, pl = plural (without "die"; null = no usual plural).
// Verbs: forms = [infinitive, er/sie/es-form, participle, ich-form].
export const PAIRS = [
  { id: 'velo', type: 'noun', ch: { art: 'das', w: 'Velo', pl: 'Velos' }, de: { art: 'das', w: 'Fahrrad', pl: 'Fahrräder' } },
  { id: 'spital', type: 'noun', ch: { art: 'das', w: 'Spital', pl: 'Spitäler' }, de: { art: 'das', w: 'Krankenhaus', pl: 'Krankenhäuser' } },
  { id: 'trottoir', type: 'noun', ch: { art: 'das', w: 'Trottoir', pl: 'Trottoirs' }, de: { art: 'der', w: 'Bürgersteig', pl: 'Bürgersteige' } },
  { id: 'estrich', type: 'noun', ch: { art: 'der', w: 'Estrich', pl: 'Estriche' }, de: { art: 'der', w: 'Dachboden', pl: 'Dachböden' } },
  { id: 'kasten', type: 'noun', ch: { art: 'der', w: 'Kasten', pl: 'Kästen' }, de: { art: 'der', w: 'Schrank', pl: 'Schränke' } },
  { id: 'stube', type: 'noun', ch: { art: 'die', w: 'Stube', pl: 'Stuben' }, de: { art: 'das', w: 'Wohnzimmer', pl: 'Wohnzimmer' } },
  { id: 'lavabo', type: 'noun', ch: { art: 'das', w: 'Lavabo', pl: 'Lavabos' }, de: { art: 'das', w: 'Waschbecken', pl: 'Waschbecken' } },
  { id: 'glace', type: 'noun', ch: { art: 'die', w: 'Glace', pl: 'Glaces' }, de: { art: 'das', w: 'Eis', pl: null } },
  { id: 'natel', type: 'noun', noLocalize: true, ch: { art: 'das', w: 'Natel', pl: 'Natels' }, de: { art: 'das', w: 'Handy', pl: 'Handys' } },
  { id: 'billett', type: 'noun', ch: { art: 'das', w: 'Billett', pl: 'Billette' }, de: { art: 'die', w: 'Fahrkarte', pl: 'Fahrkarten' } },
  { id: 'poulet', type: 'noun', ch: { art: 'das', w: 'Poulet', pl: 'Poulets' }, de: { art: 'das', w: 'Hähnchen', pl: 'Hähnchen' } },
  { id: 'rueebli', type: 'noun', ch: { art: 'das', w: 'Rüebli', pl: 'Rüebli' }, de: { art: 'die', w: 'Karotte', pl: 'Karotten' } },
  { id: 'znueni', type: 'noun', ch: { art: 'der', w: 'Znüni', pl: null }, de: { art: 'das', w: 'Pausenbrot', pl: 'Pausenbrote' } },
  { id: 'coiffeur', type: 'noun', ch: { art: 'der', w: 'Coiffeur', pl: 'Coiffeure' }, de: { art: 'der', w: 'Friseur', pl: 'Friseure' } },
  { id: 'kehrichtabfuhr', type: 'noun', ch: { art: 'die', w: 'Kehrichtabfuhr', pl: null }, de: { art: 'die', w: 'Müllabfuhr', pl: null } },
  { id: 'identitaetskarte', type: 'noun', ch: { art: 'die', w: 'Identitätskarte', pl: 'Identitätskarten' }, de: { art: 'der', w: 'Personalausweis', pl: 'Personalausweise' } },
  { id: 'parkieren', type: 'verb', ch: { forms: ['parkieren', 'parkiert', 'parkiert', 'parkiere'] }, de: { forms: ['parken', 'parkt', 'geparkt', 'parke'] } },
  { id: 'grillieren', type: 'verb', ch: { forms: ['grillieren', 'grilliert', 'grilliert', 'grilliere'] }, de: { forms: ['grillen', 'grillt', 'gegrillt', 'grille'] } },
];

const NOUNS = PAIRS.filter((p) => p.type === 'noun');
const VERBS = PAIRS.filter((p) => p.type === 'verb');
const other = (v) => (v === 'de' ? 'ch' : 'de');

// ---------- spelling: ss ↔ ß ----------
// German standard spelling writes ß after a long vowel or a diphthong (Straße, groß, heißen, Fuß) and ss after a
// short vowel (Wasser, muss, dass, Klasse, Tasse, müssen). A computer cannot hear the vowel, so we never replace
// every "ss": only words that contain one of these stems (written the Swiss way) change. Everything else keeps its "ss".
// Add a stem here when a word is missing; never add one with a short vowel.
// Two kinds of stem (review T21 – «Preisschild» must not become «Preißchild»):
//  · ROOT stems can stand anywhere in a compound: Hauptstrasse, Urgrossvater, Barfuss, zeitgemäss, Eiweiss, Blumenstrauss.
//  · VERB stems (schliessen, giessen, reissen, stossen …) only count at the start of a word or after a verb prefix
//    (ver-, be-, ab-, an-, auf-, aus-, ein- …): abschliessen, zerreissen, Anstoss. In «Preis|schild» or «Kreis|stoss»
//    the "s" belongs to the first word, so nothing changes.
const ROOT_STEMS = [
  'strasse', 'gross', 'gröss', 'heiss', 'weiss', 'fuss', 'füss', 'süss', 'spass', 'gruss', 'grüss', 'spiess',
  'strauss', 'sträuss', 'gemäss', 'mässig', 'massnahme', 'massstab', 'draussen', 'aussen', 'ausser', 'äusser',
].sort((a, b) => b.length - a.length);
const VERB_STEMS = ['schliess', 'fliess', 'schiess', 'geniess', 'giess', 'beiss', 'reiss', 'stoss', 'stöss', 'fleiss', 'bloss', 'ermäss']
  .sort((a, b) => b.length - a.length);
const PREFIXES = ['zusammen', 'zurück', 'heraus', 'hinaus', 'herunter', 'hinunter', 'durch', 'unter', 'nieder', 'weiter', 'wieder', 
  'ver', 'be', 'ge', 'er', 'zer', 'ent', 'an', 'ab', 'auf', 'aus', 'ein', 'um', 'zu', 'vor', 'nach', 'mit', 'über', 'hin', 'her', 'weg', 'fest',
  'los', 'dar', 'un', 'bei', 'fort', 'frei', 'ab', 'hinein', 'herein']
  .sort((a, b) => b.length - a.length);
const SS_ROOT_RE = new RegExp(ROOT_STEMS.join('|'), 'giu');
const SS_VERB_RE = new RegExp(`(?<![\\p{L}])((?:${PREFIXES.join('|')})*)(${VERB_STEMS.join('|')})`, 'giu');
// Reis (rice) + s…: Reissalat, Reissuppe are rice dishes, not reissen (Reissverschluss)
const RICE = /^reiss$/i;
const RICE_NEXT = /^(alat|uppe|orte|ack|peise|ilo)/i;
const toEszett = (m) => (m === m.toUpperCase() && /[A-ZÄÖÜ]{2}/.test(m) ? m : m.replace(/ss/i, 'ß'));

// Swiss spelling → German spelling for the listed stems only. ALL-CAPS words are left alone.
function swissToGermanSpelling(text) {
  return text.replace(SS_ROOT_RE, toEszett).replace(SS_VERB_RE, (m, pre, stem, at, all) => (
    RICE.test(stem) && RICE_NEXT.test(all.slice(at + m.length)) ? m : pre + toEszett(stem)));
}

// Spelling of a text in the student's variant. 'ch': ß → ss everywhere (Swiss rule). 'de': Swiss ss → ß for the
// listed words; text that already uses ß stays as it is.
export function toVariant(text, variant) {
  const s = String(text ?? '');
  if (!s) return s;
  return cleanVariant(variant) === 'de' ? swissToGermanSpelling(s) : s.replace(/ß/g, 'ss').replace(/ẞ/g, 'SS');
}

// ---------- word choice ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const L = '(?<![\\p{L}])';
const R = '(?![\\p{L}])';

// Every written form of a pair in one variant, by "shape" (index): article-phrase and bare word, singular and plural.
function formsOf(pair, v) {
  const x = pair[v];
  if (pair.type === 'verb') return x.forms;
  return [`${x.art} ${x.w}`, x.w, x.pl ? `die ${x.pl}` : null, x.pl || null];
}

// In `text`, rewrites the words of one variant into the other variant's form, but ONLY where `ref` (the text we compare
// with) uses the other variant's form of the same shape. So "das Velo" is lined up with "das Fahrrad", but "Velo"
// is never turned into "Fahrrad" if the reference says "die Fahrräder".
// The number of words stays the same, so the result can be compared word by word.
export function align(text, ref) {
  let out = String(text ?? '');
  const reference = String(ref ?? '');
  if (!out || !reference) return out;
  for (const pair of PAIRS) {
    for (const from of VARIANTS) {
      const to = other(from);
      const a = formsOf(pair, from);
      const b = formsOf(pair, to);
      a.forEach((fa, i) => {
        const fb = b[i];
        if (!fa || !fb || fa === fb || fa.split(' ').length !== fb.split(' ').length) return;
        if (!new RegExp(`${L}${esc(fb)}${R}`, 'iu').test(reference)) return;
        out = out.replace(new RegExp(`${L}${esc(fa)}${R}`, 'giu'), (m) => (m[0] === m[0].toUpperCase() && fb[0] === fb[0].toLowerCase() ? fb[0].toUpperCase() + fb.slice(1) : fb));
      });
    }
  }
  return out;
}

const plain = (s) => String(s ?? '').toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, ' ').replace(/\s+/g, ' ').trim();

// True when two answers are the same for us: ss = ß, upper/lower case, punctuation and a Swiss word = its German word
// (with its article): "Die Strasse." = "die Straße", "das Velo" = "das Fahrrad", "die Stube" = "das Wohnzimmer".
export function sameAnswer(a, b) {
  return plain(align(a, b)) === plain(b) || plain(a) === plain(align(b, a));
}

// ---------- a word of the word list in the student's variant ----------
// pairs with noLocalize still count as the same answer (sameAnswer), but the word list is not rewritten with them
// (Swiss people say «Handy» today, so Handy stays Handy)
const LOCAL_NOUNS = NOUNS.filter((p) => !p.noLocalize);
const SWISS_NOUN = new Map(LOCAL_NOUNS.map((p) => [p.ch.w, p]));
const GERMAN_NOUN = new Map(LOCAL_NOUNS.map((p) => [p.de.w, p]));
const SWISS_VERB = new Map(VERBS.map((p) => [p.ch.forms[0], p]));
const GERMAN_VERB = new Map(VERBS.map((p) => [p.de.forms[0], p]));
const spell = (s, variant) => (s ? toVariant(s, variant) : s);

// A word as the app reads it from vocab/words.json (Swiss spelling and Swiss words) → the same word as the chosen
// variant writes it: { article, noun, plural ("die Schränke"), de, perfekt, adjective } converted; everything else as it was.
// `known(noun)` (optional) says whether a noun is a word of its own in the word list: then the pair is not used, so
// «Schrank» is not turned into a second «Kasten» card when «Kasten» is in the list anyway.
export function localizeWord(w, variant, known = null) {
  const v = cleanVariant(variant);
  const out = { ...w };
  if (w.type === 'noun') {
    let pair = (v === 'de' ? SWISS_NOUN : GERMAN_NOUN).get(w.noun);
    if (pair && known && known(pair[v].w)) pair = null;
    if (pair) {
      const x = pair[v];
      out.article = x.art;
      out.noun = x.w;
      out.plural = x.pl ? `die ${x.pl}` : '';
      if (!x.pl && !w.number) out.number = 'sg';
    }
    out.noun = spell(out.noun, v);
    out.plural = spell(out.plural, v);
    out.adjective = spell(out.adjective, v);
    out.de = spell(out.de, v);
    return out;
  }
  if (w.type === 'verb') {
    const first = String(w.de || '').split(/\s*→\s*/)[0].split(',')[0].replace(/^\(sich\)\s*/, '').trim();
    const pair = (v === 'de' ? SWISS_VERB : GERMAN_VERB).get(first);
    if (pair) {
      const from = pair[other(v)].forms;
      const to = pair[v].forms;
      out.de = String(w.de).replace(from[0], to[0]);
      if (w.perfekt) out.perfekt = String(w.perfekt).replace(from[2], to[2]);
    }
    out.de = spell(out.de, v);
    out.perfekt = spell(out.perfekt, v);
    return out;
  }
  out.de = spell(out.de, v);
  out.adjective = spell(out.adjective, v);
  return out;
}

// The text parts of a tutor reply that the student reads → the chosen spelling. The student's own answer
// (feedback.studentAnswer) is NEVER changed; ids and numbers stay as they are.
export function replyToVariant(reply, variant) {
  if (!reply || typeof reply !== 'object') return reply;
  const t = (s) => (typeof s === 'string' ? toVariant(s, variant) : s);
  const out = { ...reply, message: t(reply.message), options: (reply.options || []).map(t) };
  if (reply.feedback) {
    const f = reply.feedback;
    out.feedback = {
      ...f,
      corrected: t(f.corrected),
      changedWords: (f.changedWords || []).map(t),
      explanation: t(f.explanation),
      why: f.why ? { mistake: t(f.why.mistake), rule: t(f.why.rule), here: t(f.why.here) } : f.why,
      rule: t(f.rule),
    };
  }
  if (reply.exercise) out.exercise = { ...reply.exercise, line: t(reply.exercise.line), hint: t(reply.exercise.hint) };
  if (reply.grammarFocus) {
    const g = reply.grammarFocus;
    out.grammarFocus = {
      ...g,
      title: t(g.title),
      rule: t(g.rule),
      boxes: (g.boxes || []).map((b) => ({ ...b, label: t(b.label), value: t(b.value), note: t(b.note) })),
      watchOut: t(g.watchOut),
    };
  }
  return out;
}

// The two rules the tutor prompt uses (lib/prompt.js): one per variant.
export const VARIANT_RULE = {
  ch: 'Swiss Standard German. SPELLING: write "ss", never "ß" (Strasse, gross, heissen, Fuss, schliessen). WORD CHOICE: use the Swiss words of the course book (Velo, Spital, Trottoir, parkieren, Estrich, Kasten, Stube, Lavabo, Glace, Billett, Poulet, Rüebli, Znüni, grillieren, Coiffeur).',
  de: 'German Standard German (as written in Germany). SPELLING: use "ß" after a long vowel or diphthong (Straße, groß, heißen, Fuß, schließen, süß, Spaß), but keep "ss" after a short vowel (Wasser, muss, dass, Klasse, müssen). WORD CHOICE: use the German words, not the Swiss ones of the course book (Fahrrad, Krankenhaus, Bürgersteig, parken, Dachboden, Schrank, Wohnzimmer, Waschbecken, Eis, Handy, Fahrkarte, Hähnchen, Karotte, Pausenbrot, grillen, Friseur).',
};
