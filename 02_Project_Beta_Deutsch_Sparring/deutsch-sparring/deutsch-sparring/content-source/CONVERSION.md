> **Note (R25, 2026-10-31):** the `content/wortschatz-*.md` files named below were removed from the app. Vocabulary now lives in `vocab/` (see `vocab/README.md`). The file names below are kept as history.

# Converting the MASTERLIST into lesson files

Instructions for the session (human or AI) that turns Emilio's vocabulary list into topics for
the tutor. Read all of this before writing anything. **Do data only: do not change any code**
(`app/`, `components/`, `lib/`). If something seems to need a code change, write it under
"Open questions" in `content-source/REVIEW.md` and go on.

## Inputs (in this folder)

- `MASTERLIST_Aleman_A1_A2_B1_v9.docx` – the original Word file (do not edit).
- `MASTERLIST_v9.txt` – the same content as plain text. **Work from this file.**
  - `[Heading1] 3. WOHNEN & HAUSHALT` = a section (15 sections).
  - `<TABLE> … </TABLE>` = one sub-list. Its first row is the sub-list name (e.g. `| Möbel & Einrichtung |`),
    the second row the header `| Palabra / Infinitivo | Plural / Partizip II | Español | Nivel | Fecha |`.
  - Column meanings: German word (nouns with article, verbs as infinitive) · plural (nouns) or
    Partizip II (verbs) · Spanish meaning · level `A1`/`A2`/`B1`/`aus dem Kurs` · date (always `—`, drop it).
  - Special plural values: `Pl.` = plural-only noun (die Eltern), `Sg.` = no plural (das Fieber), `—` = not a noun.

## Output: one Markdown file per section in `/content`

Every `.md` file in `/content` becomes a topic in the app, so file names and the first line matter.

| Section | File |
|---|---|
| 1. Personen & Familie | `wortschatz-01-personen-familie.md` |
| 2. Körper & Gesundheit | `wortschatz-02-koerper-gesundheit.md` |
| 3. Wohnen & Haushalt | **merge into the existing `lektion-02-wohnen-im-haus.md`** (see below) |
| 4. Essen & Trinken | `wortschatz-04-essen-trinken.md` |
| 5. Arbeit & Beruf | `wortschatz-05-arbeit-beruf.md` |
| 6. Freizeit & Hobbys | `wortschatz-06-freizeit-hobbys.md` |
| 7. Verkehr & Reise | `wortschatz-07-verkehr-reise.md` |
| 8. Einkaufen & Geld | `wortschatz-08-einkaufen-geld.md` |
| 9. Schule & Bildung | `wortschatz-09-schule-bildung.md` |
| 10. Kommunikation & Medien | `wortschatz-10-kommunikation-medien.md` |
| 11. Natur & Umwelt | `wortschatz-11-natur-umwelt.md` |
| 12. Gefühle & Eigenschaften | `wortschatz-12-gefuehle-eigenschaften.md` |
| 13. Veranstaltungen & Gesellschaft | `wortschatz-13-veranstaltungen-gesellschaft.md` |
| 14. Verben (Allgemein) | `wortschatz-14-verben.md` |
| 15. Weitere Wörter aus dem Kurs | `wortschatz-15-weitere-woerter.md` |

File names: lowercase, only `a-z 0-9 -` (ä → ae, ö → oe, ü → ue).

## The rules that matter most

1. **Keep every word Emilio wrote.** Never drop a row, never replace his Spanish meaning.
   Every row of the `.txt` must end up in exactly one table (except the header rows).
2. **Swiss spelling: "ss", never "ß"** (Fuss, gross, schliesslich). Also in English/Spanish-free cells.
3. **Reference languages:** the app's flashcards use the column `Englisch` (required, the app reads it).
   Keep Emilio's Spanish in a column `Spanisch`. You write the English yourself: short, the common
   meaning first, alternatives separated by commas (`the doctor, the physician`). Nouns in English
   get "the" (`the head`), verbs get "to" (`to cough`), plural-only nouns plural (`the parents`).
4. **Do not invent new words.** Only fill the extra columns described below.
5. **If Emilio's data looks wrong, do not silently fix it.** Use the corrected form in the table
   AND log it in `REVIEW.md` (e.g. `der Frühschicht` → `die Frühschicht`; `sich unterhalten` as
   Partizip → `hat sich unterhalten`). If you are not sure, keep his version and log a question.
6. No `|` inside a cell (use `/` instead). Every row of a table has the same number of cells.

## Table formats

Split each sub-list into tables by word type. Use these headers exactly (the app finds tables by
the first header cell). A section heading `## Wortschatz – <sub-list name>` goes above each table;
when a sub-list contains several word types, use one heading per type, e.g.
`## Wortschatz – Gesundheit & Krankheit` and `## Adjektive – Gesundheit & Krankheit`.

**Nouns** (Emilio's row has der/die/das):

```
| Nomen | Englisch | Spanisch | Plural | Typisches Adjektiv | Niveau |
|---|---|---|---|---|---|
| der Kopf | the head | la cabeza | die Köpfe | rund | A1 |
| die Eltern (Pl.) | the parents | los padres | (nur Plural) | streng | A1 |
| das Fieber | the fever, the temperature | la fiebre | – (nur Singular) | hoch | A2 |
```
- `Plural`: copy Emilio's. `Pl.` → write `(nur Plural)` and add ` (Pl.)` after the noun; `Sg.` → `– (nur Singular)`.
- `Typisches Adjektiv`: **one** simple adjective (A1/A2 word) that fits the noun naturally
  (der Arzt → nett, die Küche → modern). It is used for the sentence tasks that practise
  adjective endings, so pick a regular adjective (no `hoch`/`dunkel`-type spelling changes if a simple
  one fits; never `lila`, `rosa`, `super`). Leave it empty for people's names or when nothing fits.
- Weak nouns (n-Deklination: der Junge, der Mensch, der Kunde, der Neffe …) and adjectival nouns
  (der Erwachsene, der Jugendliche, der Vorgesetzte): add ` (n-Dekl.)` or ` (Adj.-Nomen)` after
  the noun in the `Nomen` cell, e.g. `der Mensch (n-Dekl.)`. The app ignores text in brackets
  when it checks answers.

**Verbs** (Emilio's second column is a Partizip II):

```
| Verb | Englisch | Spanisch | Perfekt | Kasus / Präposition | Niveau |
|---|---|---|---|---|---|
| husten | to cough | toser | hat gehustet | – | A2 |
| sich fühlen | to feel | sentirse | hat sich gefühlt | Akk (sich) + Adj | A2 |
| fahren | to drive, to go | conducir / ir | ist gefahren | mit + Dat | A1 |
```
- `Perfekt` = `hat`/`ist` + Emilio's Partizip. `ist` for movement/change of state (fahren, gehen,
  umziehen, einschlafen, passieren, werden, bleiben, sein). Swiss: stehen/liegen/sitzen take
  `hat (CH: ist)`. Emilio's Partizip is kept; log it in REVIEW.md if it is wrong.
- `Kasus / Präposition`: what the verb needs (`Akk`, `Dat`, `mit + Dat`, `auf + Akk`, `sich` …), `–` if nothing.
  Only write what you are sure of; otherwise `–`.

**Adjectives, adverbs, small words** (Emilio's second column is `—` and it is not a phrase):

```
| Wort | Englisch | Spanisch | Wortart | Niveau |
|---|---|---|---|---|
| schwanger | pregnant | embarazada | Adjektiv | Kurs |
| übrigens | by the way | por cierto / a propósito | Adverb | Kurs |
| während | during, while | durante | Präposition (+ Gen) / Konjunktion | Kurs |
```
- `Wortart`: `Adjektiv`, `Adverb`, `Präposition (+ Dat/Akk/Gen)`, `Konjunktion`, `Partikel`.

**Phrases and example sentences** (more than one word, e.g. `auf jeden Fall`, `Ich fühle mich wohl.`):

```
| Ausdruck | Englisch | Spanisch | Niveau |
|---|---|---|---|
| auf jeden Fall | definitely, in any case | en todo caso / sin duda | Kurs |
```

**Niveau column:** `A1`, `A2`, `B1` as Emilio wrote; `aus dem Kurs` → `Kurs`.

## File layout (copy this, fill in)

```
# Personen & Familie – Wortschatz

## Meta
- Thema: Wortschatz Personen und Familie
- Niveau: A1, A2, B1
- Stichwörter: Personen, Familie, Verwandte, family, relatives, people, familia, personas, vocabulary, flashcards
- Typ: Wortschatz
- Quelle: MASTERLIST Alemán v9 (Emilio)
- Status: Entwurf (Englisch, Typisches Adjektiv und Perfekt-Hilfsverb ergänzt, noch nicht geprüft)

## Regel
Referenzsprachen: Englisch (Spalte «Englisch») und Spanisch (Spalte «Spanisch»).
Karteikarten: Englisch → Deutsch (mit Artikel) oder Deutsch → Englisch.
Lerne jedes Nomen mit Artikel und Plural, jedes Verb mit Perfekt.
<one or two sentences about something typical for this topic, e.g. n-Deklination: der Junge → den Jungen>

## Wortschatz – Personen
| Nomen | Englisch | Spanisch | Plural | Typisches Adjektiv | Niveau |
|---|---|---|---|---|---|
…

## Beispielübungen
| # | Übung | Lösung | Typ |
|---|---|---|---|
…

## Nicht verwenden (off-limits)
- Konjunktiv II, Passiv, Relativsätze (bitte anpassen, falls schon gelernt)
```

- **Title (first line):** `<Section name in normal case> – Wortschatz`. The part before ` – ` is the
  short name on the topic chips, so keep it short (≤ 3 words): `Personen & Familie`, `Körper & Gesundheit`.
- **Niveau (meta):** every level that appears in the file; `Kurs` counts as `B1`. Always write them in
  the order `A1, A2, B1`.
- **Stichwörter:** 8–15 words students might type to ask for the topic: the German sub-list names,
  English and Spanish equivalents, plus `vocabulary, flashcards`. No very general words (`Sache`, `thing`).
- **Beispielübungen:** 8–12 exercises built **only** from words of this file, mixing:
  `Artikel/Plural` (`Kopf: Artikel und Plural?` → `der Kopf, die Köpfe`),
  adjective endings with the `Typisches Adjektiv` in Nominativ / Akkusativ / Dativ
  (`Ich habe einen ___ (neu) Arzt.` → `neuen`), `Perfekt` (`husten → Perfekt?` → `hat gehustet`),
  `Übersetzen` (`Sag auf Deutsch: *The doctor is nice.*` → `Der Arzt ist nett.`). Gap = `___`,
  the base form in brackets. Double-check every solution's ending:
  - after der/die/das (and dieser…): `-e` in Nom. sg. and Akk. sg. fem./neut., otherwise `-en`;
  - after ein/kein/mein: Nom. m `-er`, n `-es`, f `-e`; Akk. m `-en`, n `-es`, f `-e`; Dativ always `-en`;
  - Dativ plural noun gets `-n` (den Kindern).
  Keep the sentences A2-simple, present tense or Perfekt.

## Section 3 (Wohnen & Haushalt): merge, do not duplicate

`lektion-02-wohnen-im-haus.md` already has rooms, furniture and verbs. Do **not** change its
existing rows. For each word of section 3:
- already in the file (same noun, ignore article/Swiss variant differences) → skip it, but if
  Emilio's plural or level differs, log it in REVIEW.md;
- not there → add it to a new table at the end of the word part, before `## Verben`:
  `## Wortschatz – aus der Masterliste` (same noun format as above; the existing tables stay as they are).
  New verbs go into a new `## Verben – aus der Masterliste` table (new verb format) after the existing `## Verben` table.
- Add `Spanisch` only to your new tables. Update the `- Niveau:` line if section 3 adds A1 words
  (`A1, A2, B1`) and add Spanish words to `- Stichwörter:` (`vivienda, casa, muebles`).

## REVIEW.md (create it in `content-source/`)

```
# Review – things for Emilio to check
## Corrections made
| File | Was | Now | Why |
## Questions
- …
## Open questions (code)
- …
```
Write in plain English; Emilio is not a developer. Keep it short: only real issues, not every English word you added.

## How to work

1. Make sure you are on the branch `claude/eager-hypatia-y6ty37` (`git status`). Never work on `main`.
2. **One section at a time:** write the file → run the check → commit (`Add vocabulary: Personen & Familie`).
   Push after every 3–4 sections (`git push -u origin claude/eager-hypatia-y6ty37`).
3. Check, from the app folder (`02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring`):
   ```
   node content-source/check-content.mjs
   ```
   It lists every topic with its levels and how many nouns / verbs / words / phrases the app can read.
   It must say `No problems found.` The number of nouns + verbs + words + phrases of a file must
   equal the number of rows of that section in the `.txt` (count them; log any difference).
4. After the last section: `npm run build` must pass. Then a quick test with the demo tutor:
   `MOCK=1 npm run dev`, open http://localhost:3000, class code `Eruditus`, pick a new topic,
   answer 3 flashcards. (The demo tutor only makes flashcards from nouns; verbs, adjectives and
   phrases are used by the real tutor, which reads the whole file.)
5. Finish with a short summary for Emilio: files created, words per file, number of corrections and
   questions in REVIEW.md. Do **not** open a pull request.

## Do not

- change code, `package.json`, `README.md` or `template.md`;
- put anything other than lesson files into `/content` (every `.md` there becomes a topic);
- use "ß"; leave a row out; merge two of Emilio's rows into one; add words he did not write;
- print, copy or commit any API key or `.env` file.
