# Vocabulary knowledge base

Emilio's word list (the Word file *MASTERLIST Alemán*) is the source. A new version comes
about every week (v10, v11, v12 …). This folder turns it into data the tutor can use, and
does the expensive part (a model adding English, articles, Perfekt …) **only once per word**.

```
vocab/
  sources/     every version of the Word file, as Emilio sent it (never edit)
  words.json   the knowledge base: one word per line (see "Data" below)
  changes/     one report per version: new, changed, removed words, things to fix in the list
  todo/        batches of words waiting for the model (empty when everything is done)
  REVIEW.md    corrections the model suggests for the Word list (made by `review`)
```
The script is `scripts/vocab.mjs` (no packages). Run it from the app folder
`02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring`.

---

## Weekly update (for the AI session; Emilio only uploads the file)

Emilio starts a new chat (Sonnet is enough), attaches the new Word file and writes:

> New vocabulary version. Follow `02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring/vocab/README.md`, section "Weekly update".

Steps:

1. Create a branch from `main` (or use the branch the session was given). Never commit to `main`.
2. Copy the attached file to `vocab/sources/` keeping its name (it must contain the version, e.g. `…_v11.docx`).
3. `node scripts/vocab.mjs import vocab/sources/<file>.docx`
   - It prints how many words are new / changed / removed and writes `vocab/changes/vNN.md`.
   - If it stops with "Only N rows found", the table layout of the Word file changed: stop and tell
     Emilio which part of the file looks different. Do not guess.
   - A removed word is kept in `words.json` (hidden, with `"removed": "vNN"`), so its enrichment is
     not lost if it comes back.
4. `node scripts/vocab.mjs batches` → writes `vocab/todo/batch-NNN.json` (80 words each).
5. Fill every batch (rules below), then `node scripts/vocab.mjs merge`. It checks each batch and
   merges only batches without problems. Fix the problems it lists and run `merge` again until
   `0 still need enrichment`.
6. `node scripts/vocab.mjs review` (writes `vocab/REVIEW.md`) and `node scripts/vocab.mjs status`.
7. Commit (`Vocabulary vNN: +X words`), push, and open a pull request titled `Vocabulary vNN`.
   PR text in plain English for Emilio: numbers from step 3, the corrections from `REVIEW.md`
   and the "written differently in two places" list from `changes/vNN.md`, so he can fix his Word file.

A normal week (20–80 new words) is one batch: a few minutes and very little cost.

---

## Filling a batch (enrichment rules)

Each line of a batch is one word Emilio wrote:

```json
{"id":"umziehen","fp":"…","de":"umziehen","second":"umgezogen (s)","es":"mudarse","level":"A2","also":["umgezogen · cambiarse de ropa · B1"],"out":null}
```
- `de` German word as written (nouns often as dictionary entry: `der Name, -n`), `second` plural
  or Partizip II (`(s)` = Perfekt with *sein*), `es` Emilio's Spanish meaning, `level` A1/A2/B1/Kurs.
- `also` (optional): the same word appears elsewhere in the list with another level or meaning.
  Cover all meanings in `en`.

**Replace only `"out":null`** with an object. Do not change any other field, do not delete or add
lines. Edit the file in place; keep one word per line.

### `out` fields

| field | for | value |
|---|---|---|
| `type` | all | `noun`, `verb`, `adjective`, `adverb`, `preposition`, `conjunction`, `pronoun`, `number`, `name` (countries, cities, without article), `phrase` (more than one word or a sentence), `other` |
| `en` | all | English meaning, common meaning first, alternatives with `, ` – nouns with *the* (`the name`), verbs with *to* (`to move house, to get changed`), phrases as natural English |
| `article` | noun | `der`, `die` or `das` |
| `noun` | noun | the noun without article: `Name` |
| `plural` | noun | full plural with article: `die Namen`; `""` if there is none |
| `number` | noun | `""` normal, `"sg"` only singular (das Alter), `"pl"` only plural (die Eltern) |
| `adjective` | noun | one simple, regular adjective that fits (for sentence practice: *der alte Name* is wrong, *der lange Name* fine). No `lila`, `rosa`, `super`, `hoch`, `dunkel`-type adjectives if a simple one fits. `""` if nothing fits |
| `note` | noun | `"n-Dekl."` (der Name, der Junge, der Kunde …), `"Adj.-Nomen"` (der Erwachsene, der Jugendliche), `"CH"` (Swiss word), else omit |
| `perfekt` | verb | `hat` / `ist` + Partizip: `ist umgezogen`; reflexive: `hat sich gewaschen`; both possible: `hat/ist gefahren`. Swiss: stehen/liegen/sitzen → `hat gestanden` with note `CH: ist gestanden` |
| `case` | verb, preposition | what it needs: `Akk`, `Dat`, `mit + Dat`, `auf + Akk`, `Wechsel (Dat/Akk)` … – only if sure, else omit |
| `extra` | optional | second word of a pair (`abholen → die Abholung`): `"die Abholung, die Abholungen – the collection"`; feminine form (`der Einwohner / die Einwohnerin`): `"die Einwohnerin, die Einwohnerinnen"` |
| `fix` + `why` | only if Emilio's entry is wrong | `fix`: the correct form (`die Frühschicht`), `why`: short reason in English. Then fill the other fields with the **correct** values |

Examples:
```json
"out":{"type":"noun","en":"the name","article":"der","noun":"Name","plural":"die Namen","number":"","adjective":"lang","note":"n-Dekl."}
"out":{"type":"noun","en":"the parents","article":"die","noun":"Eltern","plural":"","number":"pl","adjective":"streng"}
"out":{"type":"verb","en":"to move (house), to get changed","perfekt":"ist umgezogen","case":"in + Akk","extra":"sich umziehen (hat sich umgezogen) = to get changed"}
"out":{"type":"adjective","en":"single, unmarried"}
"out":{"type":"phrase","en":"How about …?"}
"out":{"type":"noun","en":"the early shift","article":"die","noun":"Frühschicht","plural":"die Frühschichten","number":"","adjective":"früh","fix":"die Frühschicht","why":"Schicht is feminine"}
```

### Rules
- **Swiss spelling: "ss", never "ß"** (the merge rejects ß).
- Keep Emilio's word: if his article, plural or Partizip is wrong, give the correct values **and** `fix`/`why`.
  Do not add `fix` for formatting differences (`-n` vs `Namen`).
- Don't invent meanings Emilio did not intend: `en` translates his Spanish (and `also`), not every
  dictionary meaning.
- Unsure about `case`, `adjective` or `note` → leave it out. Unsure about a required field → give your
  best value and add `"fix"` = Emilio's own word, `"why"` = `"please check: …"`, so it shows up in REVIEW.md.
- Work batch by batch: fill one, run `merge`, fix, next. Do not hold all batches in context at once.

---

## Data (`words.json`)

One object per line, sorted by `id`:
```json
{"id":"der name","src":{"de":"der Name, -n","second":"Namen","es":"el nombre","level":"A1"},
 "topics":["PERSONA E IDENTIDAD › Datos personales y documentos"],"fp":"9c75bd59b6","since":"v10",
 "enriched":{"type":"noun","en":"the name","article":"der","noun":"Name","plural":"die Namen","number":"","adjective":"lang","note":"n-Dekl.","fp":"9c75bd59b6"}}
```
- `id` = the word in lowercase, without dictionary suffix, with article for nouns. Same id = same word.
- `src` = what Emilio wrote (always replaced by the latest import). `topics` = section › list in his file.
- `fp` = fingerprint of Emilio's word, plural/Partizip, Spanish and level. When it changes, the word is
  enriched again; when only the list/section changes, nothing needs to be redone.
- `enriched` = the model's fields; valid only while `enriched.fp` equals `fp`.
- `since` / `removed` = first and last version the word appeared in.
- `variants` = the same word written differently elsewhere in the list (see `changes/vNN.md`).

How the app uses this file is decided in the app revamp (it does not read it yet). The plan: the app
picks ~40 words per session (level, topic, not practised recently) and sends only those to the tutor.

## If Emilio changes the Word layout

The import expects: headings (Word style "Heading") = sections; each table starts with a one-cell row
(the list name), then a header row, then rows with **German · plural or Partizip II · Spanish · level**
(more columns are ignored). Emojis in list names are fine. If a new layout breaks this, update
`rowsOf()` in `scripts/vocab.mjs` (that is a code change – use a stronger model).
