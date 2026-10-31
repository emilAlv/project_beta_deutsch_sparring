// Checks the German-variant spelling (toVariant in lib/variants.js, review T21) on sample words:
//   node scripts/check-to-variant.mjs
// ß only where a stem stands at a word start, after a verb prefix, or (for noun/adjective stems) inside a compound.

process.removeAllListeners('warning');
const V = await import('../lib/variants.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const de = (s) => V.toVariant(s, 'de');
const eq = (name, got, want) => check(name, got === want, `got "${got}", want "${want}"`);

// converted (Swiss → German)
const yes = {
  aussen: 'außen', Aussenseite: 'Außenseite', nach: 'nach', äusserst: 'äußerst', äusserlich: 'äußerlich', ausserdem: 'außerdem',
  draussen: 'draußen', Strasse: 'Straße', Hauptstrasse: 'Hauptstraße', Einbahnstrasse: 'Einbahnstraße', gross: 'groß', Urgrossvater: 'Urgroßvater',
  Fuss: 'Fuß', Fussball: 'Fußball', barfuss: 'barfuß', heiss: 'heiß', weiss: 'weiß', Eiweiss: 'Eiweiß', süss: 'süß', Spass: 'Spaß',
  schliessen: 'schließen', abschliessen: 'abschließen', ausschliesslich: 'ausschließlich', Schliessfach: 'Schließfach',
  reissen: 'reißen', zerreissen: 'zerreißen', Reissverschluss: 'Reißverschluss', Anstoss: 'Anstoß', Zusammenstoss: 'Zusammenstoß',
  giessen: 'gießen', eingiessen: 'eingießen', geniessen: 'genießen', ungeniessbar: 'ungenießbar', Fleiss: 'Fleiß', fleissig: 'fleißig',
  Gruss: 'Gruß', begrüssen: 'begrüßen', Blumenstrauss: 'Blumenstrauß', zeitgemäss: 'zeitgemäß', regelmässig: 'regelmäßig', Massnahme: 'Maßnahme',
  Sofortmassnahme: 'Sofortmaßnahme', Spiess: 'Spieß', beissen: 'beißen', abbeissen: 'abbeißen', bloss: 'bloß', ermässigt: 'ermäßigt',
};
for (const [from, to] of Object.entries(yes)) eq(`de: ${from}`, de(from), to);

// must NOT change: the "ss" is not a stem (the s belongs to the first part of a compound, or the vowel is short)
const no = ['Preisschild', 'Preisstufe', 'Kreisstadt', 'Kreisstrasse'.replace('strasse', 'stadt'), 'Eisschrank', 'Waisse'.replace('Waisse', 'Waisenhaus'),
  'Wasser', 'Klasse', 'muss', 'dass', 'müssen', 'Tasse', 'Fluss', 'essen', 'vergessen', 'lassen', 'Adresse', 'interessant', 'Schloss', 'passen',
  'Ergebnisse', 'Messer', 'Pass', 'nass', 'Kuss', 'Mittagessen', 'Mineralwasser', 'Anschluss', 'Wissenschaft', 'Handy', 'Natel', 'Kasten'];
for (const w of no) eq(`de keeps ${w}`, de(w), w);
eq('Preisschild in a sentence', de('Auf dem Preisschild steht der Preis, ausserdem die Strasse.'), 'Auf dem Preisschild steht der Preis, außerdem die Straße.');

// Swiss: ß always becomes ss
eq('ch: ß → ss', V.toVariant('Die Straße ist groß. Maßnahme, äußerst, außen', 'ch'), 'Die Strasse ist gross. Massnahme, äusserst, aussen');

// Handy / Natel: the word list is not rewritten with Natel, but both are accepted as the answer
const handy = { id: 'das handy', type: 'noun', article: 'das', noun: 'Handy', plural: 'die Handys', number: '' };
eq('Swiss variant keeps Handy', V.localizeWord(handy, 'ch').noun, 'Handy');
check('Natel = Handy as an answer', V.sameAnswer('das Natel', 'das Handy'));
check('the Swiss tutor rule no longer lists Natel', !/Natel/.test(V.VARIANT_RULE.ch));

// Schrank / Kasten: no second Kasten card when Kasten is a word of its own in the list
const schrank = { id: 'der schrank', type: 'noun', article: 'der', noun: 'Schrank', plural: 'die Schränke', number: '' };
eq('Schrank → Kasten without a list', V.localizeWord(schrank, 'ch').noun, 'Kasten');
eq('Schrank stays Schrank when Kasten is in the list', V.localizeWord(schrank, 'ch', (n) => n === 'Kasten').noun, 'Schrank');
check('Kasten = Schrank as an answer', V.sameAnswer('der Kasten', 'der Schrank'));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall toVariant checks passed');
process.exit(failed ? 1 : 0);
