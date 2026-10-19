# wort. 2.0 – implementation tasks

One task = one new Claude Code session = one branch = one pull request.
Do them **in order**: each task starts after the previous task's pull request is merged
into `main` (later tasks build on earlier ones).

## How Emilio uses this file
1. Open a new Claude Code session on this repository.
2. Pick the **model** shown for the task (model menu / `/model`).
3. Paste the task's prompt (the grey box). Nothing else is needed.
4. The session plans, asks its questions, waits for your "approved", builds, pushes and
   tells you where the Vercel preview is.
5. You check the preview. If OK, say "open the pull request", then merge it on GitHub.

### Why these models
| Model | Used for | Cost |
|---|---|---|
| **Haiku** | small, clearly described changes in 1–3 files | lowest |
| **Sonnet** | normal features: new screens, prompt rules, data work | medium (default) |
| **Opus** | changes where a mistake is expensive or hard to see: login and passwords, rewiring how a session runs | highest – used only twice |

If a Haiku or Sonnet session gets stuck twice on the same error, stop it and re-run the
task with the next model up – that is cheaper than many failed rounds.

---

## Background every task relies on

**Design (Figma):** file `5hwSXtLS7zUQKaHUmYlt5S`, page "wort. 2.0 – Revamp (draft)".
Frames: Log in `28:2` · Create account `28:29` · Home `29:10` · Plan "Still to do" `32:457` ·
Session setup `31:42` · Sparring `32:101` · Session summary `32:352`.
Colours/fonts: the tokens at the top of `app/globals.css` (same values as the Figma variables).
Known design fix: the session ribbon on the Sparring screen must be one slim line (~52 px), not as tall as in Figma.
Figma is on the Starter plan with a small request limit: **read only the frame you need, at most 2–3 Figma calls per task.**

**Decisions already made**
- Desktop first; phone layout not in scope.
- Vocabulary is practised **with its grammar**: flashcard (article, plural / Perfekt), then a sentence with the same word in Akkusativ, Dativ or Genitiv with adjective endings.
- Each session gets only the words it needs, picked by the app from the student's word scores (see "Word scores" below). Whole lesson files are never sent to Gemini for vocabulary.
- **English is the only reference language.** Nothing the app reads or shows is in Spanish (no Spanish meanings, no Spanish section names). Spanish exists only in Emilio's own Word file and in the temporary batches used to translate it once (Task 1).
- All settings (type, topic, level, difficulty, questions, direction, grammar per word, **Swiss or German Hochdeutsch**) are chosen on the setup screen and stay fixed during the session. (The Figma setup screen still shows "English + Español" – ignore that option.)
- Swiss Hochdeutsch ("ss", Velo, Spital …) is the default; the other variant is always accepted as an answer.
- Accounts: username + password; anyone with the class code can create one. No payments or marketing.
- Plan view: linear timeline with a "Whole plan / Still to do" switch.
- **Source is not a topic.** Every word has a **source**: Goethe A1, Goethe A2, Goethe B1, or **From the course** (words the teacher showed in class). A word can have more than one source. "Aus dem Kurs / From the course" is never shown as a topic. Every word also has a **level** (A1/A2/B1): for Goethe words their Goethe level, for course-only words a level estimated once during enrichment (marked as estimated). Setup and the word picker filter by topic, level **and** source.
- **Open:** database. Task 7 needs Emilio's OK for Vercel's free Postgres (Neon) and its one package.

## Word scores (used by Tasks 2, 3, 8, 9)
Every student has **two scores per word, from 1 to 10**:
- **V – vocabulary:** the word itself. Nouns: article + noun in the Nominativ (*der Schrank*). Verbs: the infinitive. Adjectives and phrases: the word or phrase.
- **G – word + grammar:** the word used in its grammar: nouns in Akkusativ / Dativ / Genitiv with adjective endings and the plural; verbs with Perfekt and their case; adjectives with endings. Phrases have no G score.

A word never practised is "new" and counts as score 1. So 4 right answers in a row take a new word 1 → 3 → 5 → 7 → **10**.

| What happens | V score | G score |
|---|---|---|
| Flashcard right | +2 | – |
| Flashcard wrong (wrong word or wrong article) | −3 | – |
| Grammar task right | +1 (the word was used correctly) | +2 |
| Grammar task wrong, mistake in the grammar (case, ending, Perfekt …) | unchanged | −3 |
| Grammar task wrong, mistake in the word or its article | −3 | −3 |
| Skipped | −1 | −1 (if it was a grammar task) |
| Right, but after a hint or on "Leicht" (multiple choice) | +1 | +1 |

- **10 needs 4 right answers in a row.** Each score has its own streak (right answers in a row). Without a streak of 4 the score stops at 9; the 4th right answer in a row sets it to 10. A mistake or skip resets that streak to 0. Answers after a hint or on "Leicht" do not count toward the streak.
- Scores never go below 1 or above 10.
- In "Vocabulary + grammar" sessions the article is checked every time (flashcard first), so V is always tested; grammar comes on top.
- Which mistake is which: the tutor already returns `feedback.errorType` (`Artikel`, `Wortschatz` = the word; `Kasus`, `Adjektivendung`, `Verbform`, `Präposition`, … = the grammar).
- **When a word comes back** (spaced repetition): the better the score, the longer the gap. Score 1–3 → due the next day, 4–6 → after 3 days, 7–9 → after 7 days, 10 → after 21 days. A 10 that is due and answered right stays 10. Answered wrong, it drops to 7 and has to earn the 10 again.
- **How a session's words are chosen:** words in the chosen level and section / list. First words that are due, lowest score first. Then new words. Then 1–2 words with 10 as a check. Roughly 60 % due or weak, 30 % new, 10 % checks. Fewer words exist → use what there is.
- **How many words:** only as many as the session needs. Vocabulary only: 1 word per question. Vocabulary + grammar: 1 word per 2 questions (flashcard + grammar task). Plus 3 spare words for skips. A 20-question session with grammar = 13 words.
- One place in the code (`lib/scores.js`) does all of this, so the rules can be changed later in one file. Until accounts exist (Task 7) the scores are kept in the browser; Task 8 moves them to the database.

## Common rules (every task prompt points here)
- Read `CLAUDE.md` (repo root) first and follow it: plain-English explanations for Emilio, ask before any new package, database or login, never print or commit keys or passwords.
- The app folder is `02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring`. Read its `README.md` and `AGENTS.md` (this Next.js version differs from training data – check `node_modules/next/dist/docs/` before using Next.js APIs).
- Work only on the branch this session was given; if none, create `revamp/NN-short-name` from the latest `main`. Never push to `main`.
- Keep: chat-first Sparring; Gemini safety nets in `lib/gemini.js` (timeouts, retries, fallback model, JSON schema answers via `lib/reply.js`); `MOCK=1` demo mode must keep working for every feature; class code; daily limit; `translate="no"` on `<html>`; all UI texts in `lib/ui-text.js`.
- Read the code before planning. Ask your questions all at once, short, with a recommendation. Give a short plan and **wait for Emilio's "approved"** before writing code.
- Before every push: `npm run build` passes and the changed screens work with `MOCK=1` (`npm run dev`, click through; Playwright screenshots are welcome).
- Update `README.md` where behaviour changes. Commit with a clear message, push, and tell Emilio where the Vercel preview is (Vercel → Deployments → row with the branch → Visit). Open the pull request only after he OKs the preview.

---

## Task 0 – Put this task list on `main`
**Model: none** – just ask the current session: "open the pull request for this branch", then merge it.
It only adds `CLAUDE.md` and this file, so there is no preview to check.

## Task 1 – Vocabulary data ready
**Model: Sonnet** · effort: long but mechanical (19 batches of 80 words) · you see: a list of corrections for your Word file

```
Task 1 of docs/revamp-tasks.md: get the vocabulary knowledge base ready.
Follow "Common rules" in docs/revamp-tasks.md.
1. Bring the vocabulary work from branch origin/claude/eager-hypatia-y6ty37 into your branch
   (merge it; it has scripts/vocab.mjs, vocab/, content-source/ and the wortschatz-*.md files).
2. Follow vocab/README.md ("Filling a batch") to fill every batch in vocab/todo/, one batch at a time:
   fill, run `node scripts/vocab.mjs merge`, fix what it reports, next batch. Then run `review` and `status`
   until "0 still need enrichment". Swiss spelling: never "ß".
3. English only: change scripts/vocab.mjs so vocab/words.json contains no Spanish. The Spanish meaning
   is only used inside the temporary batches (vocab/todo/) to write the English; words.json keeps only
   its fingerprint (fp) so a changed Spanish meaning still triggers re-enrichment. Add English names for
   every section and list (new file vocab/lists.json: Spanish name from the Word file → English name,
   e.g. "CASA Y VIVIENDA" → "Home & living"); words.json "topics" use the English names. Batches are
   deleted after a successful merge. Update vocab/README.md accordingly.
4. Do not change the app code in this task.
5. Report to Emilio in plain English: words enriched, the corrections from vocab/REVIEW.md and the
   "written differently in two places" list, so he can fix his Word file.
```

## Task 1b – Source and level for every word
**Model: Sonnet** · effort: small–medium · you see: "From the course" is a source filter, not a topic; course words sit in their real topics

```
Task 1b of docs/revamp-tasks.md: word sources. Follow "Common rules" and the decision "Source is not a
topic" in docs/revamp-tasks.md. Only vocab/ and scripts/vocab.mjs change; no app code.
In Emilio's Word file the level column mixes level and source ("Kurs" = shown by the teacher), and the
section "AUS DEM KURS — Palabras adicionales" is a source, not a topic.
- scripts/vocab.mjs: give every word "sources" (array of "goethe-a1" | "goethe-a2" | "goethe-b1" | "kurs")
  and "level" (A1 | A2 | B1). Level column A1/A2/B1 → that Goethe source + level; "Kurs" → source "kurs";
  a word listed in the AUS DEM KURS section also gets "kurs" (it keeps its Goethe source if it has one).
- Remove the AUS DEM KURS section from "topics" and from vocab/lists.json.
- Course-only words: estimate their CEFR level once (enrichment field "level", plus "levelEstimated": true)
  and, for the words that are in no other topic (about 58), add the best fitting existing topic and list
  (enrichment field "topics"); if nothing fits, list "Other words". Use the batch + merge flow of
  vocab/README.md for this so the work is done once and kept across weekly imports.
- vocab/README.md: document sources and level; the weekly import keeps working.
- Report to Emilio: how many words per source, the estimated levels per course word count, and the
  topics given to the 58 words, so he can correct them in his Word file if he wants.
```

## Task 2 – Word scores and word picker
**Model: Sonnet** · effort: medium · you see: vocabulary from your word list, chosen by how well you know each word; answers arrive faster

```
Task 2 of docs/revamp-tasks.md: word scores + word picker. Follow "Common rules" and implement exactly
the section "Word scores" in docs/revamp-tasks.md.
Goal: vocabulary sessions use vocab/words.json (English only, from Task 1) instead of the wortschatz-*.md
lesson files, and only the words the session needs are sent to Gemini.
- New lib/scores.js (no React, no browser APIs, so it can run on the server later): the V and G scores,
  streaks, the score table, the "10 needs 4 in a row" rule, due dates, and pickWords(). Pure functions
  with all numbers as named constants at the top.
- New lib/words.js: load words.json once; leave out words marked "removed" (no longer in Emilio's list)
  and words without enrichment (no English or article yet – they cannot be checked); list sections and
  lists with their English names; filter by level and by source (Goethe list / From the course / both,
  using "sources" from Task 1b). "From the course" is never a topic.
- Each answer must say which word it was about: add wordId and a "task" field ("flashcard" | "grammar")
  to the tutor's exercise/feedback in lib/reply.js (backwards compatible); the app, not the model,
  updates the scores from feedback.correct, feedback.errorType, hint/Leicht and skip.
- /api/topics returns the word sections/lists; /api/chat puts only the picked words (compact lines:
  id, de, article, plural or Perfekt, en, adjective, case) in the prompt instead of the lesson file.
  Grammar topics keep their lesson files.
- Scores live in the browser for now, in one place in lib/storage.js (Task 8 moves them to the database).
- Mock tutor (lib/mock.js) uses the same picker and returns wordId/task so scores work with MOCK=1.
- A node check script that proves: the score table and the 4-in-a-row rule (e.g. 1→3→5→7→10; a mistake
  at 10 → 7 and streak 0; a hint answer never makes 10), due dates, the word count per session
  (20 questions with grammar → 13 words), level/list respected, due and weak words first.
```

## Task 3 – Each word practised with its grammar
**Model: Sonnet** · effort: medium · you see: after each flashcard a sentence task with the same word (Akk / Dat / Gen, adjective endings, Perfekt)

```
Task 3 of docs/revamp-tasks.md: word + grammar tasks. Follow "Common rules" in docs/revamp-tasks.md.
Today "Add sentences" (lib/prompt.js, lib/mock.js) only does nouns in Nom/Akk/Dat. Extend it:
- Settings get a list of grammar points chosen by the student: article & plural, Akkusativ, Dativ,
  Genitiv, adjective endings, Perfekt (verbs), verb + case.
- Per word type: nouns → flashcard (article + plural) then a sentence with the chosen case and the word's
  adjective (e.g. "wegen des alten Schranks"); verbs → Perfekt form (hat/ist + Partizip) and a sentence
  using the case the verb needs; adjectives → ending tasks; phrases → EN→DE, close answers accepted.
- Reference language: English only (no Spanish anywhere).
- Every task keeps the wordId and task type from Task 2 so the V and G scores (section "Word scores")
  update correctly; the flashcard always comes first and always checks the article.
- feedback.rule must name the grammar point consistently (e.g. "Genitiv nach wegen") so stats can group it.
- Keep the JSON schema in lib/reply.js backwards compatible; update the mock tutor so MOCK=1 shows each
  new task type. Check the German in your examples carefully (Swiss spelling, no "ß").
```

## Task 4 – Setup screen, fixed settings, slim ribbon
**Model: Opus** · effort: medium–large · you see: a setup screen before each session; during the session a one-line ribbon instead of the settings block

```
Task 4 of docs/revamp-tasks.md: session setup screen. Follow "Common rules" in docs/revamp-tasks.md.
Design: Figma frames 31:42 (setup) and 32:101 (Sparring) – read only these two.
- New setup screen before a session (route of your choice, e.g. /sparring/new): type (Grammar / Vocabulary
  + grammar), topic (grammar topic, or word section + list from lib/words.js), level, word source (Goethe list /
  From the course / both – replaces the "Include «Kurs» words" checkbox in Figma),
  difficulty, questions (10–50), flashcard direction, grammar points per word (no reference-language
  choice: English only, although the Figma frame still shows one),
  German variant (Swiss / German Hochdeutsch – store it; Task 5 makes the tutor use it).
  A "Start session" bar with a one-line summary. Prefill from the last session.
- The Sparring screen (app/page.js, components/*) drops the settings card in SessionPanel.js and the
  options column; a slim ribbon (~52 px, one line) shows the fixed settings, "Question X of N" and
  "End session". Keep the 3 panel tabs (At a glance / Progress & gaps / Grammar focus) as tabs.
- Settings are fixed during a session: lib/intents.js and the prompt no longer change level, difficulty,
  direction or topic from the chat; the tutor answers briefly "end the session to change this".
  Hint, rule, skip and stop still work.
- app/page.js is large and owns the session state: change it carefully, keep reload/restore working.
```

## Task 5 – Swiss or German Hochdeutsch
**Model: Sonnet** · effort: small–medium · you see: the tutor writes "Strasse, Velo" or "Straße, Fahrrad" as chosen

```
Task 5 of docs/revamp-tasks.md: German variant. Follow "Common rules" in docs/revamp-tasks.md.
The setup screen (Task 4) already stores variant = "ch" | "de".
- Send it with every /api/chat request (validated server-side like the other settings).
- lib/prompt.js: replace the fixed Swiss rule with one rule per variant (spelling ss/ß; word choice
  Velo/Fahrrad, Spital/Krankenhaus, Trottoir/Bürgersteig, parkieren/parken, Estrich/Dachboden, Kasten/Schrank,
  Stube/Wohnzimmer …). The other variant is always accepted as correct.
- One small shared map of Swiss ↔ German words (lib/variants.js) used by the prompt, the mock tutor and
  any answer comparison (lib/diff.js should treat ss/ß as equal).
- Flashcards show the variant's form; words.json entries with note "CH" give the Swiss word.
```

## Task 6 – Progress & gaps shows the question
**Model: Haiku** · effort: small · you see: every row in "Progress & gaps" shows the question, your answer and the correction

```
Task 6 of docs/revamp-tasks.md: show the question in Progress & gaps. Follow "Common rules" in docs/revamp-tasks.md.
- In app/page.js, store the question line (the open exercise's text, number and type) with each answer
  object, including skipped ones.
- In components/SessionPanel.js, the "Progress & gaps" view lists the answers newest first, each row:
  "N · type", the question, "You: …" (struck through if wrong), "Right: …" when wrong, and a ✓ / ✗ tag.
  Design: Figma frame 32:101, right column only (one Figma call at most).
- Old saved sessions without a question must still display (show the row without it).
```

## Task 7 – Accounts: log in with username and password
**Model: Opus** · effort: large · you see: log in / create account pages; the app is closed without an account
**Needs Emilio's OK first:** database (Vercel's free Postgres / Neon) and its package.

```
Task 7 of docs/revamp-tasks.md: accounts. Follow "Common rules" in docs/revamp-tasks.md.
Before any code, confirm with Emilio (plain English): the database (recommended: Vercel Postgres / Neon free
tier, package @neondatabase/serverless) and that passwords are stored hashed with Node's built-in crypto.scrypt
(no extra package). Explain what he must click in Vercel to connect the database.
- Tables: users (id, username unique, password hash + salt, created_at, settings json). Add a tiny
  migration script; no ORM.
- Pages: Log in and Create account (Figma 28:2 and 28:29). Sign-up needs the class code (lib/guard.js,
  checked server-side). Username rules: 3–24 letters/numbers. Password ≥ 8 characters.
- Sessions: a signed, httpOnly, secure, SameSite=Lax cookie (secret in an env var, e.g. SESSION_SECRET).
  All API routes and pages require a logged-in user; log out in the avatar menu.
- Protection: same error for wrong username or password; limit login tries per user and per network
  (like the code tries in lib/guard.js); daily chat limit counted per user.
- MOCK=1 / local dev without a database: an in-memory user store so the app still runs.
- Write a short security note for Emilio: what is stored, what is not, how to reset a password.
```

## Task 8 – Progress saved in the account
**Model: Sonnet** · effort: medium · you see: your history, streak and word progress follow you to any device

```
Task 8 of docs/revamp-tasks.md: store progress in the database. Follow "Common rules" in docs/revamp-tasks.md.
Accounts and the database exist (Task 7).
- Tables: sessions (user, settings, started/ended, score), answers (session, number, type, question, student
  answer, corrected, rule, error type, correct/skipped, word id, task), word_scores (user, word id, V score,
  V streak, V due, G score, G streak, G due, last practised) – rules in section "Word scores"; lib/scores.js
  stays the only place that calculates them.
- Save each answer as it happens (small API route); the session summary and lib/storage.js history/streak
  read from the server. Keep the current chat in localStorage for quick reload only.
- First login on a browser with old localStorage history: import it once.
- The word picker (lib/scores.js pickWords) reads word_scores from the server; the browser's scores are
  imported once on first login.
- MOCK=1 / no database: in-memory fallback.
```

## Task 9 – Home page: goals, plan, stats, strengths & gaps
**Model: Sonnet** · effort: large · you see: the new home page after log in

```
Task 9 of docs/revamp-tasks.md: Home page. Follow "Common rules" in docs/revamp-tasks.md.
Design: Figma frames 29:10 (Home) and 32:457 (plan "Still to do") – read only these.
- After log in the user lands on Home; "Start Sparring" opens the setup screen.
- Goals: create / edit / delete; each goal has a type (exam, vocabulary, grammar), level, start and end
  date, and milestones (date, title, target, status). Table goals + milestones. Progress % is computed from
  the user's answers and word_scores (never from the model).
- Stats tiles (sessions, questions, % right, words learnt = V score 8–10 of total, streak), recent sessions
  with "Again". Per section/list: average V and G score.
- Strengths & gaps vs goals: group answers by feedback.rule (and word lists), last 30 days, show the
  strongest and weakest with the goal they belong to.
- Plan timeline: one line per goal from start to end date, month ticks, milestone dots (reached / next /
  coming / missed), "Today" line; switch "Whole plan" / "Still to do" (Still to do starts today and folds
  reached milestones into a "✓ N reached" tag). Plain SVG/CSS, no chart package.
- Leave a placeholder column on the right for the coach (Task 10). A simple default milestone plan is
  created with each new goal so the timeline is never empty.
```

## Task 10 – Coach chat
**Model: Sonnet** · effort: medium · you see: the coach on the Home page gives recommendations and can re-plan your milestones

```
Task 10 of docs/revamp-tasks.md: coach. Follow "Common rules" in docs/revamp-tasks.md.
Design: Figma frame 29:10, right column only.
- New /api/coach route using generate() from lib/gemini.js (same timeouts, fallback, JSON schema).
  Own prompt file lib/coach-prompt.js and schema: message, suggestedSession (settings for the setup
  screen or null), planChanges (milestones to add/move/remove, or null), quickReplies.
- Context sent to the model: goals + milestones, the computed stats and strengths/gaps, today's date –
  compact, no full history.
- "Set up this session" opens the setup screen prefilled. Plan changes are shown to the user and applied
  only when they confirm; the app validates dates (inside the goal's timeframe) before saving.
- Coach messages are saved per user (last 30). Mock coach for MOCK=1. Counts toward the daily limit.
```

## Task 11 – Clean-up and documentation
**Model: Haiku** · effort: small · you see: an up-to-date README

```
Task 11 of docs/revamp-tasks.md: clean-up. Follow "Common rules" in docs/revamp-tasks.md.
- Remove code and files no longer used (e.g. wortschatz-*.md if lib/words.js replaced them – check with
  grep that nothing imports or reads them; keep grammar lessons and content/template.md).
- README.md: new screens, deploy steps including the database and SESSION_SECRET, weekly vocabulary update,
  MOCK=1 test words. Plain English for Emilio.
- No behaviour changes. npm run build must pass.
```
