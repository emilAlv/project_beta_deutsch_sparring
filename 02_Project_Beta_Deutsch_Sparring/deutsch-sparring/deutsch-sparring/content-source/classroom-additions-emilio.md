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

_No new classroom observations received yet. Future contributions will be appended below without overwriting older entries._

## Integration queue

| ID | Topic | Proposed destination | Status |
|---|---|---|---|
| — | Awaiting first classroom observation | — | — |

## Change log

- **2026-10-22** – New working branch created from the latest `main` and intake document initialized. Repository structure and curriculum entry points confirmed. No classroom material or production code changed yet.
