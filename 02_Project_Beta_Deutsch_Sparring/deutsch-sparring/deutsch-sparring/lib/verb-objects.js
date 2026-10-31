// A fitting object for each verb in the demo tutor's "verb + case" task (lib/word-tasks.js).
// The word list (vocab/words.json) says only WHICH case a verb takes, not what it can be used with – so a sentence
// like «Ich möchte den Brief anrufen» used to be possible. Here every verb has the nouns that really go with it.
// A verb that is not listed gets NO verb + case task (better no task than a wrong model answer). On purpose not listed:
//   · two objects (geben, sagen, schicken, mitteilen: «jemandem etwas»), reflexive verbs (sich freuen …)
//   · verbs that need a second object or a place (merken, vergleichen, verwechseln, informieren, erinnern, legen,
//     stecken) and verbs that sound wrong after «Ich möchte …» (kosten, wissen, kennen, wiegen, mögen, passen,
//     schmecken, reichen, weh tun)
// Key: the infinitive, or «infinitive preposition» for verbs with a preposition («warten auf», «teilnehmen an»).
// Value: the nouns, separated by spaces (see NOUNS). The order is the order of the tasks.

// Noun → [article, plural]. Pure data, spelling is Swiss (ss).
const NOUNS = {
  Freund: ['der', 'Freunde'], Freundin: ['die', 'Freundinnen'], Lehrerin: ['die', 'Lehrerinnen'], Kind: ['das', 'Kinder'],
  Kollege: ['der', 'Kollegen'], Mitarbeiter: ['der', 'Mitarbeiter'], Kunde: ['der', 'Kunden'], Patient: ['der', 'Patienten'],
  Bruder: ['der', 'Brüder'], Nachbar: ['der', 'Nachbarn'], Vermieter: ['der', 'Vermieter'],
  Brief: ['der', 'Briefe'], Karte: ['die', 'Karten'], Text: ['der', 'Texte'], Paket: ['das', 'Pakete'], Tasche: ['die', 'Taschen'],
  Buch: ['das', 'Bücher'], Zeitung: ['die', 'Zeitungen'], Rechnung: ['die', 'Rechnungen'], Kuchen: ['der', 'Kuchen'],
  Brot: ['das', 'Brote'], Suppe: ['die', 'Suppen'], Fisch: ['der', 'Fische'], Fleisch: ['das', ''], Milch: ['die', ''],
  Kaffee: ['der', 'Kaffees'], Pizza: ['die', 'Pizzas'], Auto: ['das', 'Autos'], Fahrrad: ['das', 'Fahrräder'],
  Tür: ['die', 'Türen'], Fenster: ['das', 'Fenster'], Wohnung: ['die', 'Wohnungen'], Zimmer: ['das', 'Zimmer'],
  Haus: ['das', 'Häuser'], Garten: ['der', 'Gärten'], Stadt: ['die', 'Städte'], Bus: ['der', 'Busse'], Zug: ['der', 'Züge'],
  Hotel: ['das', 'Hotels'], Reise: ['die', 'Reisen'], Kurs: ['der', 'Kurse'], Test: ['der', 'Tests'], Prüfung: ['die', 'Prüfungen'],
  Arbeit: ['die', 'Arbeiten'], Aufgabe: ['die', 'Aufgaben'], Problem: ['das', 'Probleme'], Thema: ['das', 'Themen'],
  Plan: ['der', 'Pläne'], Frage: ['die', 'Fragen'], Antwort: ['die', 'Antworten'], Gespräch: ['das', 'Gespräche'],
  Spiel: ['das', 'Spiele'], Fest: ['das', 'Feste'], Geburtstag: ['der', 'Geburtstage'], Geld: ['das', ''], Zeit: ['die', ''],
  Preis: ['der', 'Preise'], Termin: ['der', 'Termine'], Name: ['der', 'Namen'], Adresse: ['die', 'Adressen'], Wort: ['das', 'Wörter'],
  Regel: ['die', 'Regeln'], Lied: ['das', 'Lieder'], Bild: ['das', 'Bilder'], Foto: ['das', 'Fotos'], Video: ['das', 'Videos'],
  Schlüssel: ['der', 'Schlüssel'], Koffer: ['der', 'Koffer'], Jacke: ['die', 'Jacken'], Mantel: ['der', 'Mäntel'],
  Hund: ['der', 'Hunde'], Katze: ['die', 'Katzen'], Tisch: ['der', 'Tische'], Formular: ['das', 'Formulare'],
  Geschenk: ['das', 'Geschenke'], Film: ['der', 'Filme'], Wahrheit: ['die', ''], Geschichte: ['die', 'Geschichten'],
  Idee: ['die', 'Ideen'], Fehler: ['der', 'Fehler'], Programm: ['das', 'Programme'], Datei: ['die', 'Dateien'],
  Strasse: ['die', 'Strassen'], Ball: ['der', 'Bälle'], Wetter: ['das', ''], Team: ['das', 'Teams'],
  Projekt: ['das', 'Projekte'], Firma: ['die', 'Firmen'], Medizin: ['die', ''], Musik: ['die', ''], Wasser: ['das', ''],
  Müll: ['der', ''], Papier: ['das', 'Papiere'], Glas: ['das', 'Gläser'], Batterie: ['die', 'Batterien'], Nachricht: ['die', 'Nachrichten'],
  Tag: ['der', 'Tage'], Urlaub: ['der', 'Urlaube'], Wochenende: ['das', 'Wochenenden'], Schule: ['die', 'Schulen'], Platz: ['der', 'Plätze'],
  Rätsel: ['das', 'Rätsel'], Fach: ['das', 'Fächer'], Garage: ['die', 'Garagen'], Gasse: ['die', 'Gassen'], Lösung: ['die', 'Lösungen'],
};

const MAP = {
  // ---- Akkusativ ----
  'abbrechen': 'Kurs Test Gespräch', 'abbuchen': 'Rechnung Geld', 'abgeben': 'Paket Brief Tasche', 'abheben': 'Geld',
  'abholen': 'Paket Kind Freund', 'abonnieren': 'Zeitung Film', 'abschliessen': 'Tür Fahrrad Auto', 'akzeptieren': 'Preis Plan Rechnung',
  'analysieren': 'Text Problem Plan', 'anlächeln': 'Freund Lehrerin Kind', 'anmelden': 'Kind Auto Freund', 'anrufen': 'Freund Lehrerin Kollege',
  'ansprechen': 'Freund Lehrerin Kollege', 'anstellen': 'Lehrerin Kollege Mitarbeiter', 'anwenden': 'Regel Plan Lösung',
  'anziehen': 'Jacke Mantel Kind', 'aufbauen': 'Tisch Firma Team', 'aufmachen': 'Tür Fenster Paket', 'aufnehmen': 'Lied Video Gespräch',
  'aufräumen': 'Zimmer Wohnung Garten', 'aufstellen': 'Tisch Plan Team', 'ausfüllen': 'Formular Test Adresse',
  'ausleihen': 'Buch Fahrrad Auto', 'austragen': 'Zeitung Paket Brief', 'backen': 'Kuchen Brot Pizza', 'beachten': 'Regel Preis Plan',
  'beenden': 'Gespräch Kurs Arbeit', 'begründen': 'Antwort Plan Idee', 'begrüssen': 'Freund Lehrerin Kunde', 'behandeln': 'Patient Kind Thema',
  'bemerken': 'Fehler Problem Preis', 'beobachten': 'Kind Hund Wetter', 'beraten': 'Kunde Freund Kollege', 'beschäftigen': 'Kind Mitarbeiter',
  'beschreiben': 'Zimmer Freund Stadt', 'besichtigen': 'Wohnung Haus Stadt', 'besorgen': 'Brot Geschenk Paket', 'besprechen': 'Problem Thema Plan',
  'bestehen': 'Prüfung Test Kurs', 'bestellen': 'Pizza Buch Kaffee', 'besuchen': 'Freund Lehrerin Stadt', 'bezahlen': 'Rechnung Paket Buch',
  'braten': 'Fleisch Fisch Brot', 'bringen': 'Paket Kind Brief', 'buchen': 'Reise Zimmer Hotel', 'buchstabieren': 'Name Wort Adresse',
  'darstellen': 'Problem Plan Idee', 'dekorieren': 'Zimmer Haus Kuchen', 'drucken': 'Text Brief Foto', 'eintragen': 'Name Termin Adresse',
  'einzahlen': 'Geld Rechnung', 'empfehlen': 'Buch Hotel Film', 'entdecken': 'Stadt Garten Idee', 'entsorgen': 'Papier Batterie Glas',
  'entwickeln': 'Idee Plan Programm', 'erfahren': 'Wahrheit Preis Nachricht', 'erfinden': 'Spiel Geschichte Programm', 'erklären': 'Regel Wort Problem',
  'erleben': 'Geschichte Stadt Reise', 'erledigen': 'Arbeit Aufgabe Brief', 'ernähren': 'Kind Hund', 'erreichen': 'Zug Bus Kollege',
  'ersetzen': 'Fenster Tür Programm', 'erstellen': 'Plan Text Formular', 'erweitern': 'Haus Garten Plan', 'erzählen': 'Geschichte Kind',
  'erziehen': 'Kind Bruder', 'feiern': 'Geburtstag Fest Urlaub', 'finanzieren': 'Reise Haus Auto', 'finden': 'Schlüssel Auto Tasche',
  'fragen': 'Lehrerin Freund Kollege', 'füttern': 'Hund Katze Kind', 'gewinnen': 'Spiel Preis Geld', 'giessen': 'Garten Wasser',
  'googeln': 'Name Adresse Wort', 'heiraten': 'Freund Freundin', 'herausfinden': 'Wahrheit Name Preis', 'herunterladen': 'Foto Video Programm',
  'hineinstecken': 'Karte Brief Schlüssel', 'holen': 'Brot Paket Kind', 'hören': 'Lied Musik Nachricht', 'kaufen': 'Brot Auto Buch',
  'kleben': 'Foto Karte Brief', 'kochen': 'Suppe Kaffee Fisch', 'kontrollieren': 'Rechnung Text Auto', 'leeren': 'Tasche Glas',
  'leiten': 'Kurs Firma Projekt', 'lernen': 'Wort Regel Lied', 'lesen': 'Buch Brief Zeitung', 'liefern': 'Paket Pizza Brot',
  'lösen': 'Problem Aufgabe Rätsel', 'machen': 'Foto Aufgabe Kaffee', 'malen': 'Bild Haus Katze', 'mieten': 'Wohnung Auto Haus',
  'mitkaufen': 'Brot Milch Geschenk', 'nehmen': 'Bus Zug Kuchen', 'nennen': 'Name Preis Termin', 'öffnen': 'Tür Fenster Paket',
  'organisieren': 'Fest Reise Kurs', 'packen': 'Tasche Koffer Paket', 'parken': 'Auto Fahrrad', 'pflegen': 'Garten Katze Hund',
  'planen': 'Reise Fest Tag', 'probieren': 'Kuchen Suppe Brot', 'putzen': 'Fenster Zimmer Wohnung', 'renovieren': 'Haus Wohnung Zimmer',
  'reparieren': 'Auto Fahrrad Fenster', 'reservieren': 'Tisch Zimmer Hotel', 'retten': 'Kind Hund Freund', 'sammeln': 'Geld Foto Karte',
  'schaffen': 'Prüfung Test Arbeit', 'schliessen': 'Tür Fenster Garten', 'schreiben': 'Brief Text Karte', 'singen': 'Lied',
  'sparen': 'Geld Zeit', 'speichern': 'Foto Text Datei', 'stellen': 'Frage Aufgabe', 'stören': 'Kind Freund Nachbar',
  'studieren': 'Medizin Musik Fach', 'suchen': 'Schlüssel Wohnung Tasche', 'tauschen': 'Zimmer Platz Geld', 'tragen': 'Tasche Koffer Jacke',
  'trainieren': 'Team Kind Hund', 'trennen': 'Müll Papier Glas', 'üben': 'Lied Text Wort', 'überholen': 'Auto Bus Fahrrad',
  'übernehmen': 'Aufgabe Arbeit Rechnung', 'übersetzen': 'Text Wort Brief', 'überweisen': 'Geld Rechnung',
  'untersuchen': 'Kind Patient Problem', 'verbessern': 'Text Plan Fehler', 'verbringen': 'Tag Urlaub Wochenende',
  'verdienen': 'Geld Preis', 'vergessen': 'Schlüssel Name Tasche', 'verkaufen': 'Auto Haus Fahrrad', 'verlieren': 'Schlüssel Spiel Tasche',
  'vermeiden': 'Fehler Problem', 'vermieten': 'Wohnung Zimmer Haus', 'verschieben': 'Termin Fest Reise',
  'verstecken': 'Geschenk Schlüssel Brief', 'versteigern': 'Auto Bild Haus', 'versuchen': 'Kuchen Suppe Brot',
  'wählen': 'Name Strasse Plan', 'waschen': 'Auto Jacke Kind', 'wechseln': 'Geld Zimmer Schule', 'wecken': 'Kind Freund Kollege',
  'wegwerfen': 'Brief Papier Glas', 'werfen': 'Ball', 'zahlen': 'Rechnung Preis', 'zeichnen': 'Bild Haus Katze',
  // ---- Dativ (a person) ----
  'antworten': 'Freund Lehrerin Kind', 'glauben': 'Freund Lehrerin Kind', 'helfen': 'Freund Lehrerin Kind',
  'kündigen': 'Mitarbeiter Vermieter', 'mailen': 'Freund Lehrerin Kollege',
  // ---- with a preposition ----
  'abbiegen in': 'Strasse Gasse Garage', 'achten auf': 'Kind Preis Zeit', 'anfangen mit': 'Kurs Arbeit Buch',
  'anstossen auf': 'Freund Geburtstag Fest', 'aufhören mit': 'Arbeit Kurs Spiel', 'aufpassen auf': 'Kind Tasche Hund',
  'aussteigen aus': 'Bus Zug Auto', 'beginnen mit': 'Kurs Arbeit Spiel', 'berichten über': 'Reise Problem Fest',
  'denken an': 'Freund Lehrerin Urlaub', 'diskutieren über': 'Problem Thema Plan', 'einsteigen in': 'Bus Zug Auto',
  'einziehen in': 'Haus Wohnung Stadt', 'nachdenken über': 'Problem Frage Plan', 'reagieren auf': 'Brief Frage Nachricht',
  'reden mit': 'Freund Lehrerin Kind', 'streiten mit': 'Freund Kollege Bruder', 'teilnehmen an': 'Kurs Fest Spiel',
  'telefonieren mit': 'Freund Lehrerin Kollege', 'umziehen in': 'Stadt Wohnung Haus', 'warten auf': 'Bus Zug Freund',
  'zusammenstossen mit': 'Auto Fahrrad Bus',
};

/** The objects for a verb: [{ id, article, noun, plural }] or [] when the verb has no fitting object list. */
export function objectsFor(inf, prep = null) {
  const key = prep ? `${inf} ${prep}` : inf;
  const names = (MAP[key] || '').split(' ').filter(Boolean);
  return names.filter((n) => NOUNS[n]).map((n) => ({ id: `o-${n}`, article: NOUNS[n][0], noun: n, plural: NOUNS[n][1] ? `die ${NOUNS[n][1]}` : '' }));
}

export const VERB_OBJECT_KEYS = Object.keys(MAP);
