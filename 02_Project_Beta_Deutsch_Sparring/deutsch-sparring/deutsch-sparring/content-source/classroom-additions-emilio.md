# wort. – Classroom additions (Emilio)

**Status:** Open for incremental contributions (not merged)
**Started:** 2026-10-22
**Working branch:** `curriculum/emilio-classroom-additions`
**Base:** `main` at commit `591eb3234484dc482e98f976c16edeed41f5da84`
**Owner:** Emilio; editorial and pedagogical preparation by ChatGPT.

## Purpose

Collect Emilio's own experiences, useful explanations, corrections, expressions and learning observations from German classes. Keep them traceable here while the project is in progress. When Emilio confirms the collection is complete, transform the approved material into the appropriate live curriculum files, review it and propose a pull request for his approval. Do **not** merge automatically or commit directly to `main`.

Entries can be sent as informal messages, photos, copied notes or class observations. Emilio does **not** need to format them. Retain his exact intended meaning and label any uncertainty. Distinguish what he personally observed from a proposed exercise or editorial explanation.

## Current repository map (reviewed 2026-10-22)

- `lib/curriculum.js`: **34** structured grammar topics (12 A1, 11 A2, 11 B1), ordered with prerequisites; the coach, tutor and demo use this.
- `content/lektion-a1-*.md`, `content/lektion-a2-*.md`, `content/lektion-b1-*.md`: **48** communicative units (16 per level), in addition to legacy lessons. Each lesson has metadata, can-do goal, situation, rule, model dialogue, examples and communicative tasks.
- `docs/curriculum-a1-b1.md`: CEFR competency map and coverage gaps.
- `vocab/words.json`: enriched vocabulary data; **1,488** entries at the time of review. `vocab/lists.json` maps vocabulary sections and lists. `vocab/README.md` describes the import/enrichment workflow; do not modify `words.json` casually.
- `content-source/`: source material, original word lists, conversion notes and reviews.

The application currently discovers grammar topics through `lib/topics.js` by combining `curriculumTopics()`, `listLessons()` and `wordTopics()`. A note added only to this file **does not automatically become an exercise** until it is adapted to its corresponding content data source.

## Editorial principles

1. **Natural language use:** prefer expressions in a genuine context over isolated grammar drills. Move from meaning and short models to interaction, correction and transfer.
2. **CEFR level:** assign the most appropriate A1/A2/B1 level, noting when a structure may be introduced receptively before productive mastery.
3. **Swiss Standard German:** Swiss spelling (`ss`) and useful Swiss vocabulary by default, but accept equivalent German-standard words and spelling. Never confuse Swiss Standard German with dialect.
4. **Validation:** verify articles, plurals, separable prefixes, verb valency, prepositions, word order and naturalness. Record possible alternative correct answers.
5. **Teaching insight:** capture *why* the explanation helped or why the student found something difficult; offer a short contextual example.
6. **Avoid duplication:** map every entry to existing lessons/grammar or to a clearly justified new topic.
7. **Attribution / privacy:** distinguish the user's own examples from instructional material. Paraphrase copyrighted book/worksheet content into original examples rather than copying entire textbook pages. Omit personal details about teachers/classmates.

## Intake fields for each contribution

Each entry receives a stable ID, e.g. `EC-001`, and includes as much of this structure as the source permits:

- **Received:** YYYY-MM-DD
- **From Emilio (original observation):** preserve his wording or a faithful short transcription
- **Topic:** grammar, vocabulary, communication strategy, pronunciation, common mistake, exercise idea, or learning methodology
- **CEFR:** A1/A2/B1 or *to verify*
- **What it teaches (can-do):** one observable communicative ability
- **Linguistic content:** rule / collocation / expression / realistic context
- **Original practice proposal:** a short meaningful task and a follow-up, with answer examples and accepted alternatives
- **Destination:** link to an existing `g-...` grammar topic, `content/lektion-...`, vocabulary pipeline or a proposed new unit
- **Validation notes:** uncertainties, overlap, variants, problems to correct
- **Status:** `captured` → `edited` → `ready for integration` → `integrated in branch` → `approved`

## Contributions

### EC-001 – Temporal questions and prepositions: wann / seit wann / wie lange

- **Received:** 2026-10-22
- **From Emilio (original observation):** "practica gramatical A1: wann/seit wann / wie lange - seit-vor-von .. bis - am -um- im. ZB; Hast du ANgie getroffen?"
- **Topic:** A1 grammar practice and communicative time questions; simple interaction about meetings, activities and duration
- **CEFR:** split into **A1 core** (asking simple time questions and giving predictable answers) and **A2 consolidation** (flexible choice of prepositions, dative forms and comparing ongoing vs completed past situations); occasional B1 extension `bevor` is deferred.
- **What it teaches (can-do):** I can ask **when** something happened, **since when** an ongoing situation has existed, **how long** something lasts or has lasted, and state a time, date, period or range.
- **Existing coverage / avoid duplication:**
  - `lib/curriculum.js` topic `g-a1-zeit-ort` already teaches `am/um/im`, but does **not explicitly contrast** `wann / seit wann / wie lange`, `seit / vor` and `von … bis`.
  - `content/lektion-a1-07-zeit-termine.md` includes `am/um/von … bis`, but not systematic `seit wann` and `wie lange` practice.
  - `g-a1-perfekt` and `content/lektion-a2-01-perfekt.md` support the supplied example `Hast du Angie getroffen?` (Perfekt). At A1, keep the Perfekt sentence as a high-frequency model rather than requiring learners to master a complete tense paradigm during this activity.
- **Recommended integration destination:** enrich `g-a1-zeit-ort` and `content/lektion-a1-07-zeit-termine.md` with this precise contrast; refer to existing Perfekt material, **do not add another duplicate time topic**.

#### Explicit A1/A2 split (updated after Emilio's feedback and classroom-photo review)

**A1 teaching focus:** `wann / seit wann / wie lange` as simple questions; `am / um / im`, `von … bis`; simple `seit Januar`, `vor zwei Tagen`, `ab Montag`, `bis Freitag` and `in zwei Wochen` as practical chunks. Keep predictable questions and short, meaningful replies. A1 can encounter `seit` with dative; do not ban it as an A2-only grammar item.

**A2 teaching focus:** productive contrast `seit` (ongoing) vs `vor` (ago) vs `nach` (after) vs `in` (time until), temporal dative endings (`seit einem Jahr / seit drei Monaten / vor einer Woche`), switching between Perfekt stories and continuing present activities, and multi-turn `ab wann / bis wann / wie lange` arrangements.

**Not in the core EC-001 unit:** `bevor` as a temporal subordinate conjunction or extended subordination; stage that for a later (typically B1) lesson. Exact CEFR boundaries are contextual and overlap across teaching programmes.

**Corroborating images:** photo indices 21–24 and 31–32 in EC-002's 45-photo inventory. The class book presents several expressions at an early stage; later exercises can recycle them at A2 without changing the student's recorded progress for the A1 lesson.

**Progression recommendation:** in `g-a1-zeit-ort` and `lektion-a1-07-zeit-termine.md` introduce high-frequency forms, then in an existing A2 conversational lesson practise choosing forms in free answers. Keep the A1 and A2 assessment targets separate.

#### Core usage, not just rules

| Question / structure | Meaning and when to use it | Natural example |
|---|---|---|
| **Wann?** | A particular moment, date or time | `Wann hast du Angie getroffen?` – `Am Freitag.` / `Vor zwei Tagen.` |
| **Seit wann?** | Starting point of a situation that is **still ongoing** | `Seit wann lernst du Deutsch?` – `Seit Januar.` |
| **Wie lange?** | Duration, either ongoing or completed | `Wie lange lernst du schon Deutsch?` – `Seit sechs Monaten.` / `Wie lange dauert der Kurs?` – `Zwei Stunden.` |
| **seit** | Since / for, continuing up to now (with dative in inflected phrases) | `Ich wohne seit 2024 in Zürich.` / `Ich lerne seit einem Jahr Deutsch.` |
| **vor** | Ago, a finished event at a distance in the past (with dative) | `Ich habe sie vor zwei Tagen getroffen.` |
| **von … bis …** | A beginning and end within a time span | `Der Kurs geht von neun bis elf Uhr.` |
| **am** | Day of the week / specific date | `Am Montag habe ich Deutschkurs.` |
| **um** | Clock time | `Wir treffen uns um 18 Uhr.` |
| **im** | Month or season | `Im Oktober beginnt der Kurs.` / `Im Sommer fahre ich Velo.` |

**Contrast to teach explicitly:** `Ich lerne seit zwei Monaten Deutsch.` (the learning continues now) ≠ `Ich habe vor zwei Monaten einen Kurs angefangen.` (the starting event happened two months ago). **Wann?** asks *at what time?*, while **wie lange?** asks *for how much time?*. `Wie lange?` can refer to an ongoing activity or a completed one, depending on the sentence.

#### Original dialogue (two turns plus meaningful follow-up)

> A: Hast du Angie getroffen?
>
> B: Ja, am Samstag.
>
> A: Wann genau?
>
> B: Um vier Uhr. Wir waren im Café.
>
> A: Wie lange wart ihr dort?
>
> B: Von vier bis sechs Uhr.

**Second contrast in the same everyday context:**

> A: Seit wann kennst du Angie?
>
> B: Seit zwei Jahren.
>
> A: Wann hast du sie zuletzt getroffen?
>
> B: Vor einer Woche.

**Pedagogical note:** Meeting someone on a past occasion (`treffen`) is a completed event; knowing a person (`kennen`) is an ongoing state. Do not ask `Seit wann hast du Angie getroffen?` as the default question about a single completed meeting.

#### Guided practice: original exercise bank (one focus at a time)

| # | Task | Model answer | Primary target |
|---|---|---|---|
| 1 | ___ hast du Angie getroffen? – Am Montag. | Wann | moment |
| 2 | ___ lernst du Deutsch? – Seit Januar. | Seit wann | ongoing starting point |
| 3 | ___ dauert der Kurs? – Zwei Stunden. | Wie lange | duration |
| 4 | Ich lerne ___ einem Jahr Deutsch. | seit | ongoing period; dative |
| 5 | Ich habe sie ___ zwei Tagen getroffen. | vor | elapsed time; dative |
| 6 | Der Unterricht dauert ___ 9 ___ 11 Uhr. | von … bis | time range |
| 7 | Wir treffen uns ___ Freitag. | am | weekday |
| 8 | Der Zug fährt ___ 17 Uhr. | um | clock time |
| 9 | ___ August habe ich Ferien. | Im | month |
| 10 | A: ___ kennst du sie schon? B: Seit drei Jahren. | Wie lange | duration still ongoing |
| 11 | A: Seit wann wohnst du hier? B: ___ 2022. | Seit | starting date |
| 12 | Ich gehe ___ Montag ___ 18 Uhr zum Deutschkurs. | am … um | date and time |
| 13 | Correct: `Ich habe vor zwei Jahre angefangen.` | Ich habe vor zwei Jahren angefangen. | dative plural after vor |
| 14 | Correct: `Ich lerne vor zwei Jahren Deutsch.` (still learning) | Ich lerne seit zwei Jahren Deutsch. | seit vs vor |
| 15 | Rephrase naturally: `Ich habe Angie am Samstag getroffen.` → ask a time question. | Wann hast du Angie getroffen? | creating a question |
| 16 | Translate: `I've been learning German for six months.` | Ich lerne seit sechs Monaten Deutsch. | since/for with present |

The bank is a **content draft**, not yet a live app exercise. In actual tutor integration accept idiomatic alternatives and inflections where they preserve the communicative goal.

#### Communicative practice: realistic, not monotonous

1. **Personal exchange:** Ask a fellow learner when their next class is, how long it lasts and since when they have been learning German. Answer with realistic or imaginary details. Do not disclose actual personal details.
2. **Timetable:** Read a fictional sign: `Deutschkurs: Dienstag, 18.30–20.00 Uhr; Beginn im November.` Ask three different questions (`wann`, `um wie viel Uhr`, `wie lange`) and answer them.
3. **Unexpected follow-up:** Your conversation partner says they cannot meet on Friday. Suggest a time on Saturday and ask how long they have free.
4. **Reactivation:** Tell a short story about a meeting in the past using `am/um/vor` and contrast it with an ongoing activity using `seit`.

#### Pedagogical sequencing and validation

- **Recognition:** match questions to answers (since when, moment, duration).
- **Controlled choice:** choose `seit` vs `vor`; `am` vs `um` vs `im`; `von` vs `bis`.
- **Guided response:** complete a realistic sentence, including dative formulae such as `seit zwei Monaten` / `vor einem Jahr`.
- **Natural interaction:** exchange questions, respond to an unexpected detail, then reuse the expression in another situation.
- **Scope guard:** Do not require complex subordinate clauses, Präteritum narratives or extended idiomatic forms at A1. The Perfekt example is learner-supplied and already present in the A1 grammar catalogue; treat it as a familiar sentence frame.
- **Corrections:** distinguish time meaning mistakes from minor orthography; accept `Um 18 Uhr`, `um sechs Uhr abends`, and contextually equivalent phrasings when appropriate.
- **Validation:** The example `Hast du Angie getroffen?` is grammatically correct. `Seit wann` must apply to a continuing state/action in this introductory contrast. The dative after `seit` and temporal `vor` deserves repeated contextual exposure.

- **Status:** `edited` – ready for later integration into the application curriculum, awaiting Emilio's continuing classroom contributions.



### EC-001 · Extension from the photographed class exercises

The follow-up class photograph inspired a separate and more extensive **original A1 exercise bank**:
[classroom-a1-zeitangaben-wann-seit-vor.md](classroom-a1-zeitangaben-wann-seit-vor.md).

This complementary draft has **48 exercises with model answers** (8 question-word choices, 12 temporal prepositions, 10 `seit/vor` dative forms, 8 sentence corrections, 5 dialogue comprehension questions and 5 biography comprehension questions), plus 5 open speaking prompts. It contains specific assessment notes for `Seit wann?` versus `Wie lange?`, Swiss orthography, the present-tense vs completed-event contrast and acceptance of multiple natural answers. Both drafts remain in `content-source/` and do not affect the running application.

During integration, **deduplicate** overlapping examples in this intake log and the new file, then extend the already existing `g-a1-zeit-ort` / `lektion-a1-07-zeit-termine.md` rather than introducing an unnecessary topic.

### EC-002 – Review of 45 class photographs, split by CEFR level

- **Received:** 2026-10-22
- **From Emilio:** Uploaded `Photos-1-001.zip` and noted that parts of the material belong at A1 and others at A2.
- **Inventory:** [classroom-photo-inventory-2026-10-22.md](classroom-photo-inventory-2026-10-22.md) records all 45 filenames, original teaching themes, A1/A2 bridge cases, suggested curriculum destinations, editorial corrections and a new example bank.
- **Editorial decision:** do not make every photographed topic A1 or every case-related form A2. Introduce simple expressions at A1 and test flexible form/case contrasts at A2. A note about `bevor` is deferred for later study.
- **Status:** `classified`, waiting for further class contributions, no live lesson files edited.

### EC-003 – Original exercises from the classroom photographs

- **Created:** 2026-10-28
- **Request:** Turn the photographed A1/A2 practice patterns into exercises that feel like the classroom material without copying a textbook.
- **Exercise bank:** [classroom-original-exercise-bank-2026-10-28.md](classroom-original-exercise-bank-2026-10-28.md) – **16 themed packs, 128 original prompt–answer pairs**, plus one communicative follow-up situation per pack.
- **Coverage:** A1 imperatives, possessives, simple body/health vocabulary, `sollen`, directions, calendars and basic time; A1–A2 temporal contrasts; A2 dative verbs, `welcher/dieser`, `wo/wohin`, fixed-case prepositions, pronouns, two-object verbs, reflexive verbs, Perfekt and `hin/her`.
- **Copyright safeguards:** Preserve pedagogical skills and generic exercise formats; replace photographed tasks, wording, settings, people and sequences with independently written examples. Do not commit the photos or textbook illustrations.
- **Validation:** 16 packs and 128 correctly delimited source-table rows checked; corrected a faulty auxiliary-verb example, an overly prescriptive `hin/herein` exercise, an ambiguous time prompt and a pronoun prompt missing address register.
- **Level progression:** Each pack declares its level and the proposed existing curriculum destination; no duplicate published lessons were created.
- **Relation to EC-001:** The earlier 48-task time-expression draft and the new general pack overlap by design. **Deduplicate and select the best tasks before integration; do not simply concatenate both files.**
- **Status:** `edited / staged`. This is a reusable source exercise bank; the running app's `content/`, `lib/curriculum.js` and `vocab/words.json` are unchanged. No merge to `main`.

## Integration queue

| ID | Topic | Proposed destination | Status |
|---|---|---|---|
| EC-001 | A1 time expressions and Dativ; 16 initial prompts + 48-task photo-inspired expansion | `g-a1-zeit-ort`, `lektion-a1-07-zeit-termine.md`; cross-reference `g-a1-perfekt` | edited, staged; deduplicate on integration |
| EC-002 | Review of the 45 uploaded classroom photos, A1/A2 distribution | [Photo inventory](classroom-photo-inventory-2026-10-22.md) | classified |
| EC-003 | 16 themed A1/A2 exercise packs, 128 original exercises | [Exercise bank](classroom-original-exercise-bank-2026-10-28.md) → existing curricular topics | edited, staged; awaiting integration |

## Change log

- **2026-10-28** – Converted photo themes into EC-003: 16 original A1/A2 themed exercise packs (128 questions, solutions and transfer situations), checked structure and corrected editorial issues. Committed only to working branch; integration and merge are pending.
- **2026-10-22** – Revised EC-001 into explicit A1 foundation and A2 consolidation after Emilio's clarification. Logged EC-002 and linked 45-photo inventory. No merge or live curriculum modifications.
- **2026-10-22** – EC-001 photo-inspired expansion (48 tasks with solutions and 5 open prompts) added as a separate editable draft; original intake entry preserved. No app content changed.

- **2026-10-22** – EC-001 prepared from Emilio's class observation: temporal questions and expressions, meaning contrasts, original dialogue, 16 original practice prompts and communicative follow-up activities. Catalogued for future integration; existing app lesson files unchanged.
- **2026-10-22** – New working branch created from the latest `main` and intake document initialized. Repository structure and curriculum entry points confirmed. No classroom material or production code changed yet.
