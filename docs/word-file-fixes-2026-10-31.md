# Fixes for your Word file (31 Oct 2026)

The app did not change any word level or case. These are the places where your Word file looks wrong or
inconsistent. Please check them and fix what you agree with. Created with `node scripts/vocab.mjs flags` (run it again
after you load a new version of the Word file).

## 1. Levels that look too high

Everyday words that are normally A1 (or A2) are listed higher in your file. A word at a higher level comes late in
the study plan, and the per-level word counts are misleading.

| Word | Level now | Suggested |
|---|---|---|
| dürfen | B1 | A1 |
| sollen | B1 | A1 |
| interessant | B1 | A1 |
| der Urlaub | B1 | A1 |
| das Büro | B1 | A1 |
| der Hund | B1 | A1 |
| die Katze | B1 | A1 |
| das Tier | B1 | A1 |
| die Firma | B1 | A2 |
| lernen | A2 | A1 |
| reisen | A2 | A1 |
| die Reise | A2 | A1 |
| die Arbeit | A2 | A1 |
| der Kollege | A2 | A1 |
| der Chef / die Chefin | A2 | A1 |
| der Termin | A2 | A1 |
| das Hotel | A2 | A1 |

(The suggestions follow the usual A1/A2 word lists; if you teach a word later on purpose, keep your level.)

## 2. kündigen: two different cases

- Word list: `Dat` (in the wortschatz files: "kündigen … Dat").
- Lesson "Wohnen im Haus": `Akk`.

Both are right, depending on the meaning. Suggested entry: **Dat (Person) / Akk (Vertrag)**, with two short examples:
*Ich kündige dem Vermieter.* (Dat, the person) and *Ich kündige den Vertrag.* (Akk, the contract).

## 3. Other points

- **stecken** (position, "Der Schlüssel steckt in der Tasche") is regular: steckte, gesteckt. Mark it as regular in the
  verb pairs table.
- **Perfekt with sein:** bleiben, sein and werden also take *sein* (ich bin geblieben, gewesen, geworden). The movement
  rule in your file now says so.
- **stehen, liegen, sitzen, hängen** (Perfekt): Swiss *ich bin gestanden / gelegen / gesessen / gehangen* and German
  *ich habe gestanden …* are both right. The word list already notes this ("CH: ist …"); the demo and the tutor accept both.
- **Modal verbs** (dürfen, können, müssen, sollen, wollen, möchten, mögen): the Perfekt column says "hat gedurft",
  "hat gekonnt" …, but in speech people use the Präteritum (ich musste, ich durfte, ich wollte). Consider adding the
  Präteritum form in the note column.
