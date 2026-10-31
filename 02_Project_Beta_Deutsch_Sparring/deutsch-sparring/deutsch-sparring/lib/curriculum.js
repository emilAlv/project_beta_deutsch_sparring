// The grammar curriculum A1–B1: ONE list that the coach, the tutor, the setup screen and the demo tutor all use.
// Order = the order of "Schritte plus Neu" / Goethe-Zertifikat. No React, no fs: runs in the browser, on the server and in scripts.
//
// How to add or change a grammar topic: edit the list below (see README.md, "Grammar topics").
// Every entry has:
//   id            "g-<level>-<name>", lower case, unique; never change an id that students may have saved
//   level         "A1" | "A2" | "B1"
//   needs         ids of the topics that must come first in a plan (review R10, redesign §2.2); [] = none
//   role          'productive' (you write and say it yourself in the exam: solid = 80 % of the last 20 answers)
//                 or 'receptive' (you must understand it, mostly in Lesen: 70 %). Optional threshold: overrides it.
//   title         German, short; the text before ":" is the short name on the chips
//   titleEn       short English name
//   rule          2–5 plain sentences in simple German with the key forms (Swiss spelling: ss, never ß)
//   examples      3–5 correct sentences. Mark the key word with *stars*: "Ich sehe *den* Mann."
//                 Optional hint after "|": "*einen|ein*" (the demo tutor shows it in brackets after the gap).
//                 Single words only. Two marks in one sentence = two gaps.
//   exerciseIdeas 2–3 short lines: which exercise types fit
//   ruleNames     the names for feedback.rule (the stats group by them); reuse lib/grammar.js RULES where they fit
//   traps         optional: 1–3 typical mistakes of learners (short German lines); the tutor mentions one when a student falls into it
//   appNote       optional: one line of extra advice for the tutor
import { RULES } from './grammar.js';

export const CURRICULUM_LEVELS = ['A1', 'A2', 'B1'];
// Fallback only (Goethe vocabulary size per level). The coach is told the REAL counts of vocab/words.json: see wordCountsByLevel in lib/words.js.
export const CURRICULUM_WORDS = { A1: 650, A2: 1300, B1: 2400 };

export const CURRICULUM = [
  // ---------------------------------------------------------------- A1
  {
    id: 'g-a1-artikel-plural', level: 'A1',
    needs: [], role: 'productive',
    title: 'Artikel und Plural: der, die, das', titleEn: 'Articles and plural',
    rule: 'Jedes Nomen hat ein Geschlecht: der (maskulin), die (feminin) oder das (neutral). Im Plural heisst der Artikel immer die: die Tische, die Lampen, die Bücher. Den Plural bildest du mit -e, -er, -(e)n, -s oder mit Umlaut (der Stuhl – die Stühle). Lerne jedes Nomen mit Artikel und Plural.',
    examples: [
      '*Der* Tisch ist gross.',
      '*Die* Lampe ist neu.',
      '*Das* Buch liegt auf dem Tisch.',
      'Auf dem Regal stehen drei *Bücher|das Buch*.',
      'Ich habe zwei *Schwestern|die Schwester*.',
    ],
    exerciseIdeas: ['Lückentext: der, die oder das ergänzen.', 'Auswahl: den richtigen Plural wählen (Stühle / Stuhle).', 'Übersetzung: «The books are new.»'],
    ruleNames: [RULES.plural, 'Artikel und Genus'],
  },
  {
    id: 'g-a1-personalpronomen', level: 'A1',
    needs: [], role: 'productive',
    title: 'Personalpronomen: ich, du, er/sie/es', titleEn: 'Personal pronouns',
    rule: 'Die Personalpronomen im Nominativ sind ich, du, er, sie, es, wir, ihr, sie und Sie (höflich). Das Verb passt zum Pronomen: ich bin, du bist, er ist, wir sind, ihr seid, sie sind. Für Dinge sagst du er, sie oder es, je nach Artikel: der Tisch – er, die Lampe – sie, das Buch – es.',
    examples: [
      '*Ich* heisse Maria und komme aus Spanien.',
      'Woher kommst *du*?',
      'Das ist Herr Meier. *Er* wohnt in Bern.',
      'Wir *sind|sein* aus der Schweiz.',
      'Die Lampe ist schön. *Sie* kostet zwanzig Franken.',
    ],
    exerciseIdeas: ['Lückentext: das passende Pronomen oder die Form von sein ergänzen.', 'Auswahl: er, sie oder es für ein Nomen.', 'Übersetzung: «Where are you from?»'],
    ruleNames: ['Personalpronomen', 'Verb sein'],
  },
  {
    id: 'g-a1-praesens', level: 'A1',
    needs: [], role: 'productive',
    title: 'Präsens: regelmässige Verben', titleEn: 'Present tense',
    rule: 'Im Präsens hängst du an den Verbstamm die Endung an: ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en (ich lerne, du lernst, er lernt). Einige Verben ändern den Vokal bei du und er/sie/es: fahren – du fährst, sprechen – er spricht, lesen – sie liest. Unregelmässig sind sein (ich bin, du bist, er ist) und haben (ich habe, du hast, er hat).',
    examples: [
      'Ich *lerne|lernen* jeden Tag Deutsch.',
      'Du *fährst|fahren* mit dem Bus zur Arbeit.',
      'Er *spricht|sprechen* gut Englisch.',
      'Meine Schwester *hat|haben* zwei Kinder.',
      'Ihr *arbeitet|arbeiten* in Zürich.',
    ],
    exerciseIdeas: ['Lückentext: das Verb in der richtigen Form ergänzen.', 'Fehler finden: falsche Endung oder falscher Vokal.', 'Übersetzung: «She reads a book.»'],
    ruleNames: ['Präsens Verbendungen', 'Präsens unregelmässige Verben'],
  },
  {
    id: 'g-a1-trennbare-verben', level: 'A1',
    needs: [], role: 'productive',
    title: 'Trennbare Verben: aufstehen, einkaufen', titleEn: 'Separable verbs',
    rule: 'Trennbare Verben haben ein Präfix wie auf-, an-, ein-, mit-, ab-. Im Hauptsatz steht das Verb auf Position 2 und das Präfix am Satzende: Ich stehe um sieben Uhr auf. Mit einem Modalverb bleibt das Verb zusammen: Ich muss um sieben Uhr aufstehen.',
    examples: [
      'Ich *stehe|aufstehen* um sieben Uhr *auf*.',
      'Der Zug *kommt|ankommen* um acht Uhr *an*.',
      'Wir *kaufen|einkaufen* am Samstag *ein*.',
      '*Rufst|anrufen* du mich bitte *an*?',
      'Sie *sieht|fernsehen* am Abend *fern*.',
    ],
    exerciseIdeas: ['Lückentext: Verb und Präfix ergänzen.', 'Satzbau: aus den Wörtern einen Satz bilden (ich + abholen + dich).', 'Fehler finden: Präfix am falschen Ort.'],
    ruleNames: ['Trennbare Verben'],
  },
  {
    id: 'g-a1-modalverben', level: 'A1',
    needs: [], role: 'productive',
    title: 'Modalverben: können, müssen, wollen, möchten', titleEn: 'Modal verbs',
    rule: 'Modalverben sind können, müssen, wollen, möchten, dürfen und sollen. Das Modalverb steht auf Position 2, das zweite Verb steht als Infinitiv am Satzende: Ich kann gut schwimmen. Formen: ich kann, du kannst; ich muss, du musst; ich will, du willst; ich möchte, du möchtest. Mit sollen sagst du, was eine andere Person verlangt (Du sollst mehr Wasser trinken); mit sollte gibst du einen Rat (Du solltest früh ins Bett gehen).',
    examples: [
      'Ich *kann|können* gut Klavier spielen.',
      'Du *musst|müssen* heute früh aufstehen.',
      'Was *möchtest|möchten* du trinken?',
      'Er *will|wollen* nach Italien fahren.',
      'Hier *darf|dürfen* man nicht rauchen.',
    ],
    exerciseIdeas: ['Lückentext: das Modalverb in der richtigen Form.', 'Satzbau: Satz mit Modalverb und Infinitiv am Ende.', 'Übersetzung: «I have to work today.»'],
    ruleNames: ['Modalverben'],
    traps: ['sollen = eine andere Person verlangt es (Du sollst mehr trinken). sollte = dein Rat (Du solltest früh ins Bett gehen).', 'Das zweite Verb steht als Infinitiv am Satzende, auch bei trennbaren Verben: Ihr sollt die Hefte mitbringen.'],
  },
  {
    id: 'g-a1-wortstellung', level: 'A1',
    needs: ['g-a1-praesens'], role: 'productive',
    title: 'Wortstellung: Verb auf Position 2, Fragen', titleEn: 'Word order and questions',
    rule: 'Im Aussagesatz steht das konjugierte Verb auf Position 2: Ich wohne in Basel. Heute wohne ich in Basel: Das Verb bleibt auf Position 2, das Subjekt folgt. W-Fragen beginnen mit dem Fragewort, danach kommt das Verb: Wo wohnst du? Bei Ja/Nein-Fragen steht das Verb auf Position 1: Wohnst du in Basel?',
    examples: [
      'Heute *gehe|gehen* ich ins Kino.',
      'Am Montag *habe|haben* ich Deutschkurs.',
      'Wo *wohnst|wohnen* du?',
      '*Wohnst|wohnen* du in Bern?',
      'Wann *beginnt|beginnen* der Kurs?',
    ],
    exerciseIdeas: ['Satzbau: Wörter in die richtige Reihenfolge bringen.', 'Fehler finden: Verb auf der falschen Position.', 'Lückentext: Frage mit Fragewort und Verb.'],
    ruleNames: ['Wortstellung Verb Position 2', 'Wortstellung Fragen'],
  },
  {
    id: 'g-a1-akkusativ', level: 'A1',
    needs: ['g-a1-artikel-plural'], role: 'productive',
    title: 'Akkusativ: ein/einen, kein', titleEn: 'Accusative, ein/einen, kein',
    rule: 'Das direkte Objekt steht im Akkusativ. Nur der maskuline Artikel ändert sich: der – den, ein – einen, kein – keinen. Die, das, eine und der Plural bleiben gleich: Ich kaufe einen Tisch, eine Lampe, ein Buch. Typische Verben sind haben, brauchen, kaufen, sehen, suchen, essen und trinken.',
    examples: [
      'Ich kaufe *einen|ein* Tisch.',
      'Er hat *keinen|kein* Hund.',
      'Siehst du *den|der* Mann dort?',
      'Sie trinkt *einen|ein* Kaffee.',
      'Wir brauchen *eine|ein* neue Lampe.',
    ],
    exerciseIdeas: ['Lückentext: den richtigen Artikel im Akkusativ ergänzen.', 'Auswahl: ein oder einen, kein oder keinen.', 'Übersetzung: «I need a table.»'],
    ruleNames: [RULES.verbAkk, RULES.akkBrauchen, 'Verneinung mit kein'],
  },
  {
    id: 'g-a1-possessivartikel', level: 'A1',
    needs: [], role: 'productive',
    title: 'Possessivartikel: mein, dein, sein, ihr', titleEn: 'Possessive articles',
    rule: 'Possessivartikel zeigen, wem etwas gehört: mein, dein, sein, ihr, unser, euer, ihr, Ihr. Sie haben dieselben Endungen wie ein und kein: mein Bruder, meine Schwester, mein Kind, meine Eltern. Im Akkusativ ändert sich nur das Maskulin: Ich besuche meinen Bruder. Sein gehört zu er und es, ihr zu sie.',
    examples: [
      'Das ist *meine|mein* Schwester.',
      '*Mein* Bruder wohnt in Genf.',
      'Ich besuche *meinen|mein* Onkel.',
      'Maria besucht *ihre|ihr* Eltern.',
      'Peter und *seine|sein* Frau kommen heute.',
    ],
    exerciseIdeas: ['Lückentext: Possessivartikel mit der richtigen Endung.', 'Auswahl: sein oder ihr?', 'Übersetzung: «This is my brother and his wife.»'],
    ruleNames: ['Possessivartikel'],
    traps: ['Maskulin im Akkusativ: -en (Ich brauche meinen Pass, nicht «meine Pass»).', 'Plural: meine Augen, nicht «mein Augen».', 'Höflich: Ihr / Ihre wird gross geschrieben.'],
  },
  {
    id: 'g-a1-dativ-praepositionen', level: 'A1',
    needs: ['g-a1-akkusativ'], role: 'productive',
    title: 'Dativ nach mit, bei, von, zu, aus, nach', titleEn: 'Dative after mit, bei, von, zu …',
    rule: 'Nach mit, bei, von, zu, aus, nach und seit steht immer der Dativ. Die Artikel im Dativ: dem (maskulin), der (feminin), dem (neutral), den + n (Plural). Mit ein-Wörtern: einem, einer, einem. Es gibt Kurzformen: zum (zu dem), zur (zu der), beim (bei dem), vom (von dem). Auch bei einer Bewegung bleibt zu im Dativ: Ich gehe zum Arzt.',
    examples: [
      'Ich fahre mit *dem|der Bus* zur Arbeit.',
      'Sie wohnt bei *ihrer|ihr* Tante.',
      'Das Geschenk ist von *meinem|mein* Vater.',
      'Nach *dem|der* Unterricht gehen wir essen.',
      'Ich komme aus *der|die* Schweiz.',
    ],
    exerciseIdeas: ['Lückentext: Artikel im Dativ nach der Präposition.', 'Auswahl: dem, der oder den?', 'Satzbau: Satz mit mit + Verkehrsmittel.'],
    ruleNames: [RULES.datMit, 'Dativ nach bei/von/zu', 'Dativ nach aus/nach'],
    traps: ['zu steht immer mit Dativ, auch bei einer Bewegung: Ich gehe zum Arzt (nicht «in den Arzt»).', 'nach vor Städten und Ländern ohne Artikel (nach Luzern); mit Artikel: in die Schweiz.', 'von (Person, Ort) ist nicht aus (Land, Stadt, Material): Ich komme von der Post – ich komme aus Spanien.'],
  },
  {
    id: 'g-a1-perfekt', level: 'A1',
    needs: [], role: 'productive',
    title: 'Perfekt mit haben und sein', titleEn: 'Perfect tense, haben and sein',
    rule: 'Das Perfekt bildest du mit haben oder sein und dem Partizip II am Satzende: Ich habe Kaffee getrunken. Die meisten Verben brauchen haben. Mit sein bildest du das Perfekt bei Bewegung und Zustandswechsel: ich bin gefahren, ich bin gegangen, ich bin geblieben. Regelmässige Verben haben ge-…-t (gemacht), unregelmässige oft ge-…-en (gegessen).',
    examples: [
      'Ich *habe* gestern Fussball *gespielt|spielen*.',
      'Wir *sind* nach Bern *gefahren|fahren*.',
      'Hast du schon *gegessen|essen*?',
      'Sie *ist* um acht Uhr *angekommen|ankommen*.',
      'Er *hat* das Buch *gelesen|lesen*.',
    ],
    exerciseIdeas: ['Lückentext: haben oder sein und das Partizip II.', 'Satzbau: Perfektsatz aus Pronomen + Infinitiv.', 'Fehler finden: falsches Hilfsverb.'],
    ruleNames: [RULES.perfektHaben, RULES.perfektSein],
  },
  {
    id: 'g-a1-imperativ', level: 'A1',
    needs: [], role: 'productive',
    title: 'Imperativ: Komm! Kommt! Kommen Sie!', titleEn: 'Imperative',
    rule: 'Mit dem Imperativ bittest du jemanden, etwas zu tun. Die du-Form ist der Verbstamm (Komm! Mach!), die ihr-Form wie im Präsens ohne ihr (Kommt!), die Sie-Form hat Sie nach dem Verb (Kommen Sie!). Einige Verben ändern den Vokal: Lies! Sprich! Nimm! Trennbare Verben trennen sich: Steh auf! Unregelmässig ist sein: Sei! Seid! Seien Sie!',
    examples: [
      '*Komm|kommen, du* bitte schnell!',
      '*Öffnen|Sie-Form* Sie bitte das Fenster!',
      '*Lies|lesen, du* den Text laut!',
      '*Macht|machen, ihr* bitte die Hausaufgaben!',
      '*Steh|aufstehen, du* um sieben Uhr *auf*!',
    ],
    exerciseIdeas: ['Lückentext: den Imperativ in du-, ihr- oder Sie-Form.', 'Übersetzung: «Please open the door.»', 'Fehler finden: falsche Form (Lese! statt Lies!).'],
    ruleNames: ['Imperativ'],
    traps: ['Vokalwechsel e → i bei der du-Form: Sprich! Lies! Nimm! (nicht «Sprech!»), und die du-Form hat kein -st.', 'Trennbare Verben: Mach die Tür zu! (das Präfix steht am Ende).', 'sein ist unregelmässig: Sei! Seid! Seien Sie!'],
  },
  {
    id: 'g-a1-zeit-ort', level: 'A1',
    needs: [], role: 'productive',
    title: 'Präpositionen: am, um, im, in, aus, nach', titleEn: 'Time and place prepositions',
    rule: 'Zeit: am + Tag (am Montag), um + Uhrzeit (um acht Uhr), im + Monat oder Jahreszeit (im Mai, im Sommer), von … bis für Anfang und Ende (von neun bis zwölf Uhr). Seit + Dativ: es dauert noch (seit einem Jahr). Vor + Dativ: es ist vorbei (vor einer Woche). Ort: in + Stadt oder Land (in Bern), aus + Herkunft (aus Italien), nach + Stadt oder Land ohne Artikel (nach Zürich). Am, im und zum sind verkürzte Formen mit dem.',
    examples: [
      'Der Kurs beginnt *am* Montag.',
      'Wir essen *um* zwölf Uhr.',
      '*Im* Sommer fahre ich ans Meer.',
      'Ich fahre *nach* Zürich.',
      'Sie kommt *aus* Spanien.',
    ],
    exerciseIdeas: ['Lückentext: die richtige Präposition ergänzen.', 'Auswahl: am, um oder im?', 'Übersetzung: «The course starts on Monday at nine.»'],
    ruleNames: ['Zeitpräpositionen am/um/im', 'Ortspräpositionen in/aus/nach'],
    traps: ['seit = es hat begonnen und dauert noch (Ich lerne seit einem Jahr Deutsch). vor = es ist passiert (Ich bin vor einer Woche umgezogen). nach / vor + Ereignis: nach dem Unterricht, vor dem Unterricht.', 'seit und vor stehen mit Dativ: seit einem Jahr, vor einer Woche, seit drei Jahren (nicht «seit drei Jahre»).', 'am + Tag, im + Monat, um + Uhrzeit: nicht «im Montag», nicht «am acht Uhr».'],
  },

  // ---------------------------------------------------------------- A2
  {
    id: 'g-a2-dativ-akkusativ-objekte', level: 'A2',
    needs: [], role: 'productive',
    title: 'Dativ und Akkusativ: zwei Objekte', titleEn: 'Dative and accusative objects',
    rule: 'Viele Verben haben zwei Objekte: die Person im Dativ, die Sache im Akkusativ (geben, schenken, zeigen, schicken, erklären). Ich gebe dem Kind einen Apfel. Pronomen stehen vor Nomen: Ich gebe ihm einen Apfel. Bei zwei Pronomen steht der Akkusativ zuerst: Ich gebe ihn ihm. Die Dativpronomen sind mir, dir, ihm, ihr, uns, euch, ihnen.',
    examples: [
      'Ich schenke *meiner|mein* Mutter einen Blumenstrauss.',
      'Der Lehrer erklärt *den|die* Schülern die Regel.',
      'Kannst du *mir|ich* das Salz geben?',
      'Wir zeigen *ihm|er* die Stadt.',
      'Sie schickt *ihrem|ihr* Freund einen Brief.',
    ],
    exerciseIdeas: ['Lückentext: Dativ für die Person, Akkusativ für die Sache.', 'Satzbau: Satz mit geben/schenken/zeigen aus Wörtern bauen.', 'Übersetzung: «I show her the room.»'],
    ruleNames: ['Dativobjekt und Akkusativobjekt', RULES.verbDat, RULES.verbAkk],
    traps: ['Die Person steht im Dativ, die Sache im Akkusativ: Ich gebe der Frau das Formular (nicht «den Frau»).', 'Dativ Plural bekommt -n: den Kindern.', 'Zwei Pronomen: erst der Akkusativ, dann der Dativ (Ich gebe ihn ihm).'],
  },
  {
    id: 'g-a2-verben-dativ', level: 'A2',
    needs: [], role: 'productive',
    title: 'Verben mit Dativ: helfen, gefallen, gehören', titleEn: 'Verbs with dative',
    rule: 'Einige Verben haben nur ein Dativobjekt: helfen, gefallen, gehören, danken, schmecken, passen, gratulieren, antworten. Die Person steht im Dativ: Ich helfe dem Nachbarn. Das Buch gehört mir. Lerne diese Verben immer mit dem Dativ: helfen + Dativ.',
    examples: [
      'Ich helfe *meinem|mein* Bruder bei den Hausaufgaben.',
      'Die Jacke gefällt *mir|ich*.',
      'Das Auto gehört *meinen|mein* Eltern.',
      'Wir danken *Ihnen|Sie* für die Einladung.',
      'Schmeckt *dir|du* die Suppe?',
    ],
    exerciseIdeas: ['Lückentext: Pronomen oder Artikel im Dativ.', 'Auswahl: Dativ oder Akkusativ (mir / mich)?', 'Fehler finden: Ich helfe ihn.'],
    ruleNames: [RULES.verbDat],
    traps: ['gefallen, passen, schmecken, gehören: die Sache ist das Subjekt, die Person steht im Dativ. Die Hose gefällt mir. Die Schuhe gefallen mir.', 'gefallen (Dativ) ≠ finden (Akkusativ): Die Hose gefällt mir. Ich finde die Hose schön.', 'Dativ: helfen, danken, antworten. Akkusativ: kennen, sehen, anrufen, fragen (Ich helfe ihm. Ich kenne ihn.).'],
  },
  {
    id: 'g-a2-wechselpraepositionen', level: 'A2',
    needs: [], role: 'productive',
    title: 'Wechselpräpositionen: Wo? Wohin?', titleEn: 'Two-way prepositions',
    rule: 'An, auf, hinter, in, neben, über, unter, vor und zwischen haben zwei Fälle. Wo? (Position) → Dativ: Das Buch liegt auf dem Tisch. Wohin? (Bewegung) → Akkusativ: Ich lege das Buch auf den Tisch. Position: liegen, stehen, hängen, sitzen. Bewegung: legen, stellen, hängen, setzen. Das gilt nur für diese neun Präpositionen: zu, mit, bei, von, aus und nach haben immer Dativ.',
    examples: [
      'Das Bild hängt an *der|die* Wand.',
      'Ich stelle die Vase auf *den|der* Tisch.',
      'Die Katze sitzt unter *dem|das* Sofa.',
      'Er legt das Handy in *die|der* Tasche.',
      'Das Handy liegt in *der|die* Tasche.',
    ],
    exerciseIdeas: ['Lückentext: Artikel nach Wo? oder Wohin?', 'Auswahl: Dativ oder Akkusativ, mit liegen/legen.', 'Fehler finden: Ich gehe in dem Park.'],
    ruleNames: [RULES.datIn, RULES.akkIn],
    traps: ['Wo? und Wohin? entscheiden den Fall nur bei den neun Wechselpräpositionen. zu, mit, bei, von, aus, nach haben immer Dativ: Ich gehe zur Bäckerei.', 'stellen, legen, setzen (Wohin?) + Akkusativ; stehen, liegen, sitzen (Wo?) + Dativ.', 'hängen: Das Bild hängt an der Wand (Wo?). Ich hänge das Bild an die Wand (Wohin?).'],
  },
  {
    id: 'g-a2-welcher-dieser', level: 'A2',
    needs: ['g-a1-akkusativ', 'g-a1-dativ-praepositionen'], role: 'productive',
    title: 'welcher / dieser: Fragen und zeigen', titleEn: 'welcher / dieser',
    rule: 'Welcher fragt nach einer Auswahl, dieser zeigt auf eine bestimmte Sache. Beide haben die Endungen von der/die/das. Nominativ: welcher Mantel, welche Jacke, welches Kleid, welche Schuhe. Akkusativ: nur Maskulin ändert sich (welchen Mantel, diesen Mantel). Dativ: welchem, welcher, welchem, welchen (mit welchem Bus, in diesem Geschäft, bei dieser Firma).',
    examples: [
      '*Welchen|welcher* Mantel möchtest du anprobieren?',
      'Ich nehme *diesen|dieser* blauen Pullover.',
      '*Welche|welcher* Jacke findest du schön?',
      '*Welches|welcher* Kleid passt dir besser?',
      'Mit *welchem|welcher* Bus fährst du zur Arbeit?',
    ],
    exerciseIdeas: ['Lückentext: welcher oder dieser mit der richtigen Endung.', 'Auswahl: welcher, welche, welches oder welchen?', 'Übersetzung: «Which jacket do you like?»'],
    ruleNames: ['welcher/dieser Endungen'],
    traps: ['welcher und dieser haben die Endungen von der/die/das: welcher Mantel, welche Jacke, welches Kleid.', 'Akkusativ Maskulin: welchen / diesen (Welchen Mantel nimmst du? nicht «welcher Mantel»).', 'Dativ: mit welchem Bus, in diesem Laden, bei dieser Firma, mit diesen Schuhen.'],
  },
  {
    id: 'g-a2-hin-her', level: 'A2',
    needs: ['g-a2-wechselpraepositionen', 'g-a1-trennbare-verben'], role: 'productive',
    title: 'hin / her: herein, hinaus, herauf, herunter', titleEn: 'hin / her (direction)',
    rule: 'Hin und her zeigen die Richtung aus der Sicht der sprechenden Person. Her = zu mir, zum Sprecher: Komm herein! Komm herauf! Hin = weg von mir: Ich gehe hinaus. Ich gehe die Treppe hinunter. Mit rein, raus, rauf, runter sagt man im Alltag dasselbe: Komm rein! Geh raus! Die Wörter sind trennbar: Er kommt herunter. Er geht hinaus.',
    examples: [
      'Die Tür ist offen. Komm bitte *herein|zu mir, rein*!',
      'Ich stehe unten. Komm die Treppe *herunter|zu mir, runter*!',
      'Ich stehe oben. Komm die Treppe *herauf|zu mir, rauf*!',
      'Ich gehe jetzt ins Büro *hinein|weg von mir, rein*.',
      'Es ist heiss. Geh bitte *hinaus|weg von mir, raus* in den Garten!',
    ],
    exerciseIdeas: ['Lückentext: hin- oder her- mit herein / hinaus / herauf / herunter.', 'Auswahl: Richtung vom Sprecher aus (her oder hin)?', 'Übersetzung: «Come in, please!»'],
    ruleNames: ['hin/her Richtung'],
    traps: ['her = zu mir (Komm herein!), hin = weg von mir (Ich gehe hinein).', 'Alltag: rein, raus, rauf, runter sind richtig: Komm rein! Geh raus!', 'Die Richtung hängt vom Sprecher ab, nicht vom Ort: herein/hinein, heraus/hinaus, herauf/hinauf, herunter/hinunter.'],
  },
  {
    id: 'g-a2-adjektivendungen', level: 'A2',
    needs: ['g-a2-wechselpraepositionen'], role: 'productive', threshold: 70,
    title: 'Adjektivendungen nach der/die/das und ein/eine', titleEn: 'Adjective endings',
    rule: 'Adjektive vor einem Nomen bekommen eine Endung. Nach dem bestimmten Artikel (der, die, das) ist sie im Nominativ -e (der neue Tisch), im Akkusativ nur beim Maskulin -en (den neuen Tisch), im Dativ und im Plural immer -en. Nach ein/eine zeigt das Adjektiv das Geschlecht im Nominativ: ein neuer Tisch, eine neue Lampe, ein neues Buch.',
    examples: [
      'Das ist ein *neuer|neu* Computer.',
      'Ich sehe den *grossen|gross* Baum.',
      'Sie trägt eine *rote|rot* Jacke.',
      'Wir wohnen in einem *kleinen|klein* Haus.',
      'Das *alte|alt* Auto ist sehr teuer.',
    ],
    exerciseIdeas: ['Lückentext: Adjektiv mit der richtigen Endung (alt → alten).', 'Auswahl: die richtige Endung wählen.', 'Fehler finden: falsche Adjektivendung.'],
    ruleNames: [RULES.endingDefinite, RULES.endingIndefinite],
  },
  {
    id: 'g-a2-komparativ-superlativ', level: 'A2',
    needs: [], role: 'productive',
    title: 'Komparativ und Superlativ', titleEn: 'Comparative and superlative',
    rule: 'Mit dem Komparativ vergleichst du zwei Dinge: Adjektiv + -er und als (Der Zug ist schneller als das Auto). Der Superlativ endet auf -sten und steht mit am (am schnellsten) oder vor einem Nomen (der schnellste Zug). Viele kurze Adjektive bekommen einen Umlaut: alt – älter – am ältesten, gross – grösser – am grössten. Unregelmässig: gut – besser – am besten, gern – lieber – am liebsten, viel – mehr – am meisten.',
    examples: [
      'Zürich ist *grösser|gross* als Bern.',
      'Mein Bruder ist *älter|alt* als ich.',
      'Im Sommer ist es *wärmer|warm* als im Frühling.',
      'Das ist der *beste|gut* Kuchen der Stadt.',
      'Ich esse *lieber|gern* Pizza als Pasta.',
    ],
    exerciseIdeas: ['Lückentext: Komparativ oder Superlativ ergänzen.', 'Satzbau: zwei Dinge vergleichen (Zug + schnell + Auto).', 'Übersetzung: «This is the best book.»'],
    ruleNames: ['Komparativ', 'Superlativ'],
  },
  {
    id: 'g-a2-praeteritum-sein-haben-modal', level: 'A2',
    needs: [], role: 'productive',
    title: 'Präteritum: sein, haben, Modalverben', titleEn: 'Simple past of sein, haben, modals',
    rule: 'Für sein, haben und die Modalverben benutzt man in der Vergangenheit meistens das Präteritum, nicht das Perfekt. Sein: ich war, du warst, er war, wir waren, ihr wart. Haben: ich hatte, du hattest, wir hatten. Modalverben verlieren den Umlaut und enden auf -te: ich konnte, musste, wollte, durfte, sollte.',
    examples: [
      'Gestern *war|sein* ich krank.',
      'Wir *hatten|haben* keine Zeit.',
      'Als Kind *konnte|können* ich nicht schwimmen.',
      'Er *musste|müssen* früh aufstehen.',
      'Wo *wart|sein* ihr am Wochenende?',
    ],
    exerciseIdeas: ['Lückentext: Präteritum von sein, haben oder einem Modalverb.', 'Übersetzung: «I had to work yesterday.»', 'Fehler finden: Perfekt statt Präteritum (Ich habe gewollt).'],
    ruleNames: ['Präteritum sein', 'Präteritum haben', 'Präteritum Modalverben'],
  },
  {
    id: 'g-a2-perfekt-partizip', level: 'A2',
    needs: ['g-a1-perfekt'], role: 'productive',
    title: 'Perfekt: Partizip II der Verben', titleEn: 'Perfect: past participles',
    rule: 'Regelmässige Verben bilden das Partizip II mit ge-…-t: machen – gemacht. Unregelmässige Verben haben ge-…-en und oft einen anderen Vokal: schreiben – geschrieben, trinken – getrunken, gehen – gegangen. Bei trennbaren Verben steht ge in der Mitte: aufstehen – aufgestanden. Verben auf -ieren und mit be-, ver-, er-, ent- haben kein ge-: telefoniert, bekommen, verstanden.',
    examples: [
      'Ich habe den Brief *geschrieben|schreiben*.',
      'Sie hat mit ihrer Mutter *telefoniert|telefonieren*.',
      'Er ist früh *aufgestanden|aufstehen*.',
      'Wir haben ein Taxi *genommen|nehmen*.',
      'Hast du den Text *verstanden|verstehen*?',
    ],
    exerciseIdeas: ['Lückentext: Partizip II ergänzen.', 'Satzbau: Perfektsatz aus Pronomen + Infinitiv.', 'Fehler finden: gegefahren statt gefahren.'],
    ruleNames: [RULES.perfektHaben, RULES.perfektSein, 'Partizip II'],
    traps: ['sein im Perfekt bei Bewegung und Zustandswechsel: Ich bin aufgestanden, wir sind angekommen (nicht «habe aufgestanden»).', 'Trennbare Verben: ge steht in der Mitte: angerufen, eingekauft, abgeholt.'],
  },
  {
    id: 'g-a2-reflexive-verben', level: 'A2',
    needs: [], role: 'productive',
    title: 'Reflexive Verben: sich freuen, sich treffen', titleEn: 'Reflexive verbs',
    rule: 'Bei reflexiven Verben bezieht sich das Pronomen auf das Subjekt: ich wasche mich, du wäschst dich, er wäscht sich, wir waschen uns, ihr wascht euch, sie waschen sich. Typisch sind sich freuen, sich treffen, sich anziehen, sich setzen, sich interessieren. Im Perfekt steht haben: Ich habe mich gefreut. Mit einem Akkusativobjekt steht das Pronomen im Dativ: Ich wasche mir die Hände.',
    examples: [
      'Ich freue *mich|ich* auf das Wochenende.',
      'Wir treffen *uns|wir* um drei Uhr.',
      'Er setzt *sich|er* auf das Sofa.',
      'Hast du *dich|du* schon angezogen?',
      'Ich wasche *mir|ich, Dativ* die Hände.',
    ],
    exerciseIdeas: ['Lückentext: das Reflexivpronomen ergänzen.', 'Satzbau: Satz mit sich + Verb aus Wörtern bilden.', 'Fehler finden: falsches Reflexivpronomen (Ich freue dich).'],
    ruleNames: ['Reflexive Verben', 'Reflexivpronomen'],
    traps: ['Das Reflexivpronomen ist meistens Akkusativ: Ich freue mich (nicht «mir»).', 'Im Perfekt steht haben: Ich habe mich gefreut.', 'Das Reflexivpronomen steht direkt nach dem Verb oder nach dem Subjekt: Wir treffen uns heute. Heute treffen wir uns.'],
  },
  {
    id: 'g-a2-weil', level: 'A2',
    needs: [], role: 'productive',
    title: 'Nebensatz mit weil', titleEn: 'Subordinate clause with weil',
    rule: 'Mit weil gibst du einen Grund an. Im Nebensatz mit weil steht das konjugierte Verb am Ende: Ich bleibe zu Hause, weil ich krank bin. Hauptsatz und Nebensatz trennst du mit einem Komma. Steht der Nebensatz am Anfang, folgt danach sofort das Verb des Hauptsatzes: Weil ich krank bin, bleibe ich zu Hause.',
    examples: [
      'Ich lerne Deutsch, weil ich in der Schweiz *arbeite|arbeiten*.',
      'Er kommt nicht, weil er krank *ist|sein*.',
      'Wir bleiben zu Hause, weil es *regnet|regnen*.',
      'Sie ist müde, weil sie gestern lange gearbeitet *hat|haben*.',
      'Weil es kalt ist, *trage|tragen* ich eine Jacke.',
    ],
    exerciseIdeas: ['Satzbau: zwei Sätze mit weil verbinden.', 'Lückentext: Verb am Satzende ergänzen.', 'Fehler finden: Verb auf Position 2 im weil-Satz.'],
    ruleNames: ['Nebensatz mit weil', 'Verbstellung im Nebensatz'],
  },
  {
    id: 'g-a2-dass-wenn', level: 'A2',
    needs: ['g-a2-weil'], role: 'productive',
    title: 'Nebensätze mit dass und wenn', titleEn: 'Subordinate clauses with dass and wenn',
    rule: 'Dass leitet einen Inhalt ein: Ich glaube, dass du recht hast. Mit wenn sagst du eine Bedingung oder wann etwas immer passiert: Wenn es regnet, bleibe ich zu Hause. In beiden Nebensätzen steht das Verb am Ende. Steht der Nebensatz am Anfang, folgt danach sofort das Verb des Hauptsatzes.',
    examples: [
      'Ich glaube, *dass* er heute kommt.',
      'Ich weiss, dass du müde *bist|sein*.',
      'Wenn ich Zeit *habe|haben*, rufe ich dich an.',
      'Sie sagt, dass sie morgen nicht kommen *kann|können*.',
      '*Wenn* es schneit, fahren wir Ski.',
    ],
    exerciseIdeas: ['Satzbau: Sätze mit dass oder wenn verbinden.', 'Lückentext: Verb am Ende des Nebensatzes.', 'Auswahl: dass oder wenn?'],
    ruleNames: ['Nebensatz mit dass', 'Nebensatz mit wenn', 'Verbstellung im Nebensatz'],
  },
  {
    id: 'g-a2-konjunktiv2-hoeflich', level: 'A2',
    needs: [], role: 'productive',
    title: 'Konjunktiv II: höfliche Bitten', titleEn: 'Polite requests (Konjunktiv II)',
    rule: 'Mit dem Konjunktiv II fragst du höflich und äusserst Wünsche. Wichtige Formen sind ich hätte, ich wäre, ich könnte und ich würde + Infinitiv. Höfliche Bitte: Könnten Sie mir helfen? Wunsch im Café: Ich hätte gern einen Kaffee. Rat: Du solltest mehr schlafen.',
    examples: [
      '*Könnten|können* Sie mir bitte helfen?',
      'Ich *hätte|haben* gern einen Kaffee.',
      '*Würden|werden* Sie bitte das Fenster öffnen?',
      'Das *wäre|sein* sehr nett.',
      '*Könntest|können* du mir das Salz geben?',
    ],
    exerciseIdeas: ['Übersetzung: «Could you help me, please?»', 'Lückentext: hätte, wäre, könnte oder würde ergänzen.', 'Auswahl: die höflichere Form wählen.'],
    ruleNames: ['Konjunktiv II höflich'],
  },

  // ---------------------------------------------------------------- B1
  {
    id: 'g-b1-genitiv', level: 'B1',
    needs: [], role: 'receptive',
    title: 'Genitiv und wegen, trotz, während', titleEn: 'Genitive and wegen, trotz, während',
    rule: 'Der Genitiv zeigt Besitz oder Zugehörigkeit: das Auto des Vaters, die Tasche der Frau, das Dach des Hauses. Maskulin und neutral haben des + Nomen mit -s oder -es, feminin und Plural haben der. Nach wegen, trotz, während und statt steht der Genitiv: wegen des Regens, trotz der Kälte, während des Urlaubs. Gesprochen hört man oft den Dativ (wegen dem Regen), geschrieben ist der Genitiv richtig.',
    examples: [
      'Das ist das Auto *meines|mein* Vaters.',
      'Wegen *des|der* Regens bleiben wir zu Hause.',
      'Trotz *der|die* Kälte gehen wir spazieren.',
      'Während *des|der* Urlaubs haben wir viel gesehen.',
      'Die Wohnung *meiner|mein* Schwester ist gross.',
    ],
    exerciseIdeas: ['Lückentext: Artikel und Nomenendung im Genitiv.', 'Satzbau: Satz mit wegen oder trotz bilden.', 'Fehler finden: wegen dem Regen → wegen des Regens.'],
    ruleNames: [RULES.genWegen, RULES.genTrotz, 'Genitiv nach während', 'Genitiv Besitz'],
  },
  {
    id: 'g-b1-verben-praepositionen', level: 'B1',
    needs: [], role: 'productive',
    title: 'Verben mit festen Präpositionen', titleEn: 'Verbs with fixed prepositions',
    rule: 'Viele Verben brauchen eine feste Präposition mit einem bestimmten Fall: warten auf + Akkusativ, sich freuen über + Akkusativ, sich interessieren für + Akkusativ, teilnehmen an + Dativ, träumen von + Dativ. Lerne das Verb immer mit Präposition und Fall. Frage mit wo-: Worauf wartest du? Antworte mit da-: Ich warte darauf.',
    examples: [
      'Ich warte *auf|warten* den Bus.',
      'Wir freuen uns *über|sich freuen* das Geschenk.',
      'Sie interessiert sich *für|sich interessieren* Geschichte.',
      'Er nimmt *an|teilnehmen* einem Kurs teil.',
      'Ich träume *von|träumen* einem Haus am See.',
    ],
    exerciseIdeas: ['Lückentext: die richtige Präposition und der richtige Artikel.', 'Auswahl: auf oder über?', 'Satzbau: Satz mit einem Verb + Präposition bilden.'],
    ruleNames: ['Verb + Präposition', 'Akkusativ nach auf', 'Akkusativ nach über', 'Akkusativ nach für', 'Dativ nach an', 'Dativ nach von'],
  },
  {
    id: 'g-b1-relativsaetze', level: 'B1',
    needs: [], role: 'productive',
    title: 'Relativsätze: der, die, das, den, dem', titleEn: 'Relative clauses',
    rule: 'Ein Relativsatz gibt mehr Information zu einem Nomen. Das Relativpronomen richtet sich nach dem Nomen in Geschlecht und Zahl, der Fall hängt vom Verb im Relativsatz ab. Nominativ: der Mann, der dort wohnt. Akkusativ: der Mann, den ich kenne. Dativ: der Mann, dem ich helfe. Das Verb steht am Ende, der Relativsatz steht zwischen Kommas.',
    examples: [
      'Der Mann, *der|Nominativ* neben mir wohnt, ist Arzt.',
      'Der Film, *den|Akkusativ* wir gestern gesehen haben, war lang.',
      'Die Frau, *der|Dativ* ich geholfen habe, hat sich bedankt.',
      'Das Buch, *das|Akkusativ* ich lese, ist spannend.',
      'Die Kinder, *die|Nominativ* im Garten spielen, sind meine Nachbarn.',
    ],
    exerciseIdeas: ['Lückentext: das Relativpronomen ergänzen.', 'Satzbau: zwei Sätze zu einem Satz mit Relativsatz verbinden.', 'Fehler finden: falscher Fall oder Verb nicht am Ende.'],
    ruleNames: ['Relativsatz Nominativ', 'Relativsatz Akkusativ', 'Relativsatz Dativ'],
  },
  {
    id: 'g-b1-praeteritum', level: 'B1',
    needs: [], role: 'productive',
    title: 'Präteritum: häufige Verben', titleEn: 'Simple past',
    rule: 'Das Präteritum benutzt du vor allem beim Schreiben und Erzählen. Regelmässige Verben: Stamm + -te (ich machte, du machtest, wir machten). Unregelmässige Verben ändern den Vokal: gehen – ging, kommen – kam, sehen – sah, schreiben – schrieb, bleiben – blieb. Bei ich und er/sie/es hat das unregelmässige Verb keine Endung (ich ging), bei du kommt -st (du gingst).',
    examples: [
      'Gestern *ging|gehen* ich ins Kino.',
      'Er *kam|kommen* spät nach Hause.',
      'Wir *machten|machen* einen Spaziergang.',
      'Sie *schrieb|schreiben* ihm einen Brief.',
      'Ich *sah|sehen* den Mann am Bahnhof.',
    ],
    exerciseIdeas: ['Lückentext: das Verb im Präteritum.', 'Übersetzung: «She wrote a letter and went home.»', 'Fehler finden: gehte statt ging.'],
    ruleNames: ['Präteritum regelmässige Verben', 'Präteritum unregelmässige Verben'],
  },
  {
    id: 'g-b1-plusquamperfekt', level: 'B1',
    needs: ['g-b1-praeteritum'], role: 'receptive',
    title: 'Plusquamperfekt', titleEn: 'Past perfect',
    rule: 'Das Plusquamperfekt zeigt, dass etwas vor einem anderen Moment in der Vergangenheit passiert ist. Du bildest es mit hatte oder war und dem Partizip II: ich hatte gegessen, ich war gegangen. Haben oder sein wählst du wie im Perfekt. Oft steht es mit nachdem: Nachdem ich gegessen hatte, ging ich spazieren.',
    examples: [
      'Nachdem ich gegessen *hatte|haben*, ging ich spazieren.',
      'Als wir ankamen, *hatte|haben* der Film schon angefangen.',
      'Er *war|sein* schon gegangen, als ich kam.',
      'Sie *hatte|haben* den Schlüssel vergessen und musste warten.',
      'Wir *waren|sein* schon eingeschlafen, als das Telefon klingelte.',
    ],
    exerciseIdeas: ['Lückentext: hatte oder war ergänzen.', 'Satzbau: zwei Ereignisse mit nachdem verbinden.', 'Auswahl: Plusquamperfekt oder Präteritum?'],
    ruleNames: ['Plusquamperfekt'],
  },
  {
    id: 'g-b1-passiv', level: 'B1',
    needs: [], role: 'receptive',
    title: 'Passiv: Präsens und Präteritum', titleEn: 'Passive voice',
    rule: 'Im Passiv ist die Handlung wichtig, nicht wer sie macht. Präsens: werden + Partizip II (Das Auto wird repariert). Präteritum: wurde + Partizip II (Das Auto wurde repariert). Die handelnde Person nennst du mit von + Dativ: Das Auto wird von dem Mechaniker repariert. Mit Modalverb: Das Auto muss repariert werden.',
    examples: [
      'Das Brot *wird|werden* jeden Morgen gebacken.',
      'Das Haus *wurde|werden* 1990 gebaut.',
      'In der Schweiz *werden|werden, Plural, Präsens* viele Sprachen gesprochen.',
      'Der Brief wurde von der Sekretärin *geschrieben|schreiben*.',
      'Das Fenster muss geöffnet *werden|Infinitiv*.',
    ],
    exerciseIdeas: ['Lückentext: werden oder wurde und das Partizip II.', 'Satzbau: einen Aktivsatz ins Passiv umformen.', 'Übersetzung: «The house was built in 1990.»'],
    ruleNames: ['Passiv Präsens', 'Passiv Präteritum'],
  },
  {
    id: 'g-b1-konjunktiv2', level: 'B1',
    needs: [], role: 'productive',
    title: 'Konjunktiv II: wäre, hätte, würde', titleEn: 'Subjunctive II',
    rule: 'Der Konjunktiv II drückt Wünsche, unwirkliche Situationen und Ratschläge aus. Häufig sind wäre, hätte, könnte und würde + Infinitiv. Mit einem wenn-Satz beschreibst du eine unwirkliche Bedingung: Wenn ich Zeit hätte, würde ich reisen. Für Ratschläge: An deiner Stelle würde ich den Arzt anrufen.',
    examples: [
      'Wenn ich mehr Zeit *hätte|haben*, würde ich reisen.',
      'Wenn ich reich *wäre|sein*, würde ich ein Haus kaufen.',
      'An deiner Stelle *würde|werden* ich den Arzt anrufen.',
      'Mit mehr Geld *könnte|können* ich eine Reise machen.',
      'Das *wäre|sein* toll!',
    ],
    exerciseIdeas: ['Lückentext: wäre, hätte, würde oder könnte ergänzen.', 'Satzbau: Wenn-Satz mit Konjunktiv II bilden.', 'Übersetzung: «If I were you, I would call him.»'],
    ruleNames: ['Konjunktiv II'],
  },
  {
    id: 'g-b1-zu-infinitiv', level: 'B1',
    needs: [], role: 'productive',
    title: 'zu-Infinitiv, um … zu, damit', titleEn: 'Infinitive with zu, um … zu, damit',
    rule: 'Der Infinitiv mit zu steht am Satzende: Ich habe keine Lust, früh aufzustehen. Bei trennbaren Verben steht zu in der Mitte: aufzustehen, anzurufen. Mit um … zu nennst du den Zweck: Ich lerne Deutsch, um in der Schweiz zu arbeiten. Mit damit nennst du den Zweck, wenn das Subjekt wechselt: Ich erkläre es, damit du es verstehst.',
    examples: [
      'Ich habe keine Zeit, ins Kino *zu|zu-Infinitiv* gehen.',
      'Er lernt Deutsch, *um|Zweck* in Bern zu arbeiten.',
      'Sie ruft an, *damit|anderes Subjekt* ich nicht warte.',
      'Es ist schwer, so früh *aufzustehen|aufstehen*.',
      'Ich habe vergessen, dich *anzurufen|anrufen*.',
    ],
    exerciseIdeas: ['Lückentext: zu, um oder damit ergänzen.', 'Satzbau: zwei Sätze mit um … zu oder damit verbinden.', 'Fehler finden: damit statt um … zu bei gleichem Subjekt.'],
    ruleNames: ['zu-Infinitiv', 'um … zu', 'damit'],
  },
  {
    id: 'g-b1-zweiteilige-konnektoren', level: 'B1',
    needs: [], role: 'receptive',
    title: 'Zweiteilige Konnektoren', titleEn: 'Two-part connectors',
    rule: 'Zweiteilige Konnektoren verbinden zwei Satzteile oder Sätze: nicht nur … sondern auch, entweder … oder, weder … noch, sowohl … als auch, je … desto. Bei den meisten bleibt die normale Wortstellung. Bei je … desto steht ein Komparativ in beiden Teilen, und das Verb steht im je-Satz am Ende: Je mehr du übst, desto besser sprichst du. Weder … noch bedeutet «nicht das eine und auch nicht das andere».',
    examples: [
      'Er spricht nicht nur Englisch, *sondern|nicht nur …* auch Spanisch.',
      'Wir fahren *entweder|… oder* mit dem Zug oder mit dem Bus.',
      'Er hat *weder|… noch* Zeit noch Geld.',
      'Je mehr du übst, *desto|je …* besser wirst du.',
      'Sie spricht *sowohl|… als auch* Deutsch als auch Französisch.',
    ],
    exerciseIdeas: ['Lückentext: den fehlenden Teil des Konnektors ergänzen.', 'Satzbau: zwei Aussagen mit weder … noch oder nicht nur … sondern auch verbinden.', 'Auswahl: entweder … oder oder weder … noch?'],
    ruleNames: ['Zweiteilige Konnektoren'],
  },
  {
    id: 'g-b1-n-deklination', level: 'B1',
    needs: ['g-b1-genitiv'], role: 'receptive',
    title: 'n-Deklination: der Student, den Studenten', titleEn: 'Weak masculine nouns',
    rule: 'Einige maskuline Nomen bekommen in allen Fällen ausser im Nominativ die Endung -n oder -en. Man nennt das n-Deklination: der Junge, der Student, der Kollege, der Mensch, der Nachbar, der Herr. Akkusativ: den Studenten. Dativ: dem Studenten. Genitiv: des Studenten. Nur bei der Herr ist es -n: den Herrn.',
    examples: [
      'Ich kenne den *Studenten|der Student* gut.',
      'Wir helfen dem *Nachbarn|der Nachbar* beim Umzug.',
      'Das ist das Auto des *Kollegen|der Kollege*.',
      'Sie fragt den *Jungen|der Junge* nach dem Weg.',
      'Er spricht mit dem *Herrn|der Herr* dort.',
    ],
    exerciseIdeas: ['Lückentext: das Nomen mit der richtigen Endung.', 'Fehler finden: den Student → den Studenten.', 'Auswahl: Nachbar oder Nachbarn?'],
    ruleNames: ['n-Deklination'],
  },
  {
    id: 'g-b1-nebensaetze', level: 'B1',
    needs: [], role: 'productive',
    title: 'Nebensätze: obwohl, nachdem, bevor, während', titleEn: 'Subordinate clauses',
    rule: 'Mit obwohl nennst du einen Gegensatz: Obwohl es regnet, gehen wir spazieren. Mit nachdem sagst du, was zuerst passiert ist; im Nebensatz steht dann oft das Plusquamperfekt oder das Perfekt. Mit bevor und während verbindest du zwei Handlungen zeitlich. Im Nebensatz steht das Verb immer am Ende.',
    examples: [
      '*Obwohl|Gegensatz* es regnet, gehen wir spazieren.',
      'Ich putze die Zähne, *bevor|zeitlich* ich ins Bett gehe.',
      'Er hört Musik, *während|zeitlich* er kocht.',
      '*Nachdem|zuerst* sie gegessen hatten, spielten die Kinder.',
      'Wir gehen raus, obwohl es kalt *ist|sein*.',
    ],
    exerciseIdeas: ['Satzbau: zwei Sätze mit obwohl, bevor oder nachdem verbinden.', 'Lückentext: Konjunktion oder Verb am Satzende.', 'Auswahl: obwohl oder weil?'],
    ruleNames: ['Nebensatz mit obwohl', 'Nebensatz mit nachdem/bevor/während'],
  },
];

// ---------------------------------------------------------------- plan order (review R10, redesign §2.2)
// The order of the topics in a goal's plan (Schritte plus Neu / Goethe): productive B1 topics first, the receptive
// ones last (they may end at "introduced" when time is short). A topic still never comes before its `needs`.
// Every curriculum id is in this list exactly once (scripts/check-plan.mjs).
export const TEACHING_ORDER = {
  A1: ['g-a1-artikel-plural', 'g-a1-personalpronomen', 'g-a1-praesens', 'g-a1-wortstellung', 'g-a1-trennbare-verben',
    'g-a1-modalverben', 'g-a1-akkusativ', 'g-a1-possessivartikel', 'g-a1-zeit-ort', 'g-a1-dativ-praepositionen',
    'g-a1-imperativ', 'g-a1-perfekt'],
  A2: ['g-a2-perfekt-partizip', 'g-a2-praeteritum-sein-haben-modal', 'g-a2-verben-dativ', 'g-a2-dativ-akkusativ-objekte',
    'g-a2-wechselpraepositionen', 'g-a2-hin-her', 'g-a2-reflexive-verben', 'g-a2-weil', 'g-a2-dass-wenn',
    'g-a2-adjektivendungen', 'g-a2-welcher-dieser', 'g-a2-komparativ-superlativ', 'g-a2-konjunktiv2-hoeflich'],
  B1: ['g-b1-praeteritum', 'g-b1-konjunktiv2', 'g-b1-verben-praepositionen', 'g-b1-relativsaetze', 'g-b1-nebensaetze',
    'g-b1-zu-infinitiv', 'g-b1-zweiteilige-konnektoren', 'g-b1-plusquamperfekt', 'g-b1-passiv', 'g-b1-genitiv',
    'g-b1-n-deklination'],
};
export const PRODUCTIVE_PCT = 80;
export const RECEPTIVE_PCT = 70;
// the share of the last 20 counted answers that makes a topic "solid" (never stored per milestone)
export const topicThreshold = (entry) => entry?.threshold ?? (entry?.role === 'receptive' ? RECEPTIVE_PCT : PRODUCTIVE_PCT);

// The topics of one level in plan order: TEACHING_ORDER, but a topic whose `needs` are not placed yet waits for them.
export function planOrder(level) {
  const ids = TEACHING_ORDER[level] || [];
  const placed = new Set(CURRICULUM.filter((e) => CURRICULUM_LEVELS.indexOf(e.level) < CURRICULUM_LEVELS.indexOf(level)).map((e) => e.id));
  const out = [];
  const rest = [...ids];
  while (rest.length) {
    const i = rest.findIndex((id) => (curriculumEntry(id)?.needs || []).every((n) => placed.has(n)));
    const id = rest.splice(i < 0 ? 0 : i, 1)[0]; // i < 0 only with a circle of needs (the check refuses that)
    placed.add(id);
    out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------- helpers

export const curriculumEntry = (id) => CURRICULUM.find((e) => e.id === id) || null;
export const isCurriculumId = (id) => Boolean(curriculumEntry(id));
export const curriculumByLevel = (level) => CURRICULUM.filter((e) => e.level === level);
// the text before ":" – the name on the chips
export const shortTitle = (entry) => entry.title.split(':')[0].trim();

const MARK = /\*([^*|]+)(?:\|([^*]+))?\*/g;

// "Ich sehe *den* Mann." → "Ich sehe den Mann."
export const plainExample = (example) => example.replace(MARK, (_, word) => word);

// "Ich sehe *den|der Mann* gut." → { task: "Ich sehe ___ (der Mann) gut.", solution: "den", words: ['den'], sentence }
// Several marks → solution "stehe – auf".
export function gapExample(example) {
  const words = [];
  const task = example.replace(MARK, (_, word, hint) => {
    words.push(word.trim());
    return hint ? `___ (${hint.trim()})` : '___';
  });
  return { task, solution: words.join(' – '), words, sentence: plainExample(example) };
}

// The lesson text the tutor gets for a curriculum topic (in /api/chat, where the lesson file goes for other topics).
export function curriculumLesson(entry) {
  return `CURRICULUM TOPIC (written by the app, from the grammar curriculum)
Title: ${entry.title} (${entry.titleEn})
Level: ${entry.level}. Make the exercises at level ${entry.level}: simple, short sentences with everyday words and only the grammar a student can know at this level.
Rule: ${entry.rule}
Correct example sentences (key words in **bold**; imitate them, but write new sentences, do not copy them):
${entry.examples.map((x) => `- ${x.replace(MARK, (_, word) => `**${word}**`)}`).join('\n')}
Exercise ideas:
${entry.exerciseIdeas.map((x) => `- ${x}`).join('\n')}
${entry.traps?.length ? `Typical traps (mention the matching one briefly in the explanation when a student falls into it; never ask about it as a quiz):\n${entry.traps.map((x) => `- ${x}`).join('\n')}\n` : ''}feedback.rule: use EXACTLY one of these names (the stats group by them): ${entry.ruleNames.map((r) => `"${r}"`).join(', ')}.${entry.appNote ? `\nNote: ${entry.appNote}` : ''}`;
}

// The CURRICULUM text of the coach (lib/coach-prompt.js): the grammar topics of every level, from this list.
export function curriculumCoachText(wordCounts = CURRICULUM_WORDS) {
  return CURRICULUM_LEVELS.map((lv) => {
    const lines = curriculumByLevel(lv).map((e) => `  - ${shortTitle(e)} (${e.titleEn}) [${e.id}]`);
    return `${lv} (${wordCounts[lv] ?? CURRICULUM_WORDS[lv]} words in the app's word list at this level). Grammar topics in the app, in teaching order:\n${lines.join('\n')}`;
  }).join('\n');
}

// The topic objects for the setup screen, the coach catalog and the tutor (lib/topics.js)
export function curriculumTopics() {
  return CURRICULUM.map((e) => ({
    id: e.id,
    title: e.title,
    titleEn: e.titleEn,
    short: shortTitle(e),
    type: 'Grammatik',
    levels: [e.level],
    curriculum: true,
    keywords: `${e.title} ${e.titleEn} ${e.ruleNames.join(' ')}`.toLowerCase(),
  }));
}
