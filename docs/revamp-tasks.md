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
- Each session gets ~40 words picked by the app (level, section/list, not practised recently). Whole lesson files are never sent to Gemini for vocabulary.
- All settings (type, topic, level, difficulty, questions, direction, reference language EN or EN+ES, grammar per word, **Swiss or German Hochdeutsch**) are chosen on the setup screen and stay fixed during the session.
- Swiss Hochdeutsch ("ss", Velo, Spital …) is the default; the other variant is always accepted as an answer.
- Accounts: username + password; anyone with the class code can create one. No payments or marketing.
- Plan view: linear timeline with a "Whole plan / Still to do" switch.
- **Open:** database. Task 7 needs Emilio's OK for Vercel's free Postgres (Neon) and its one package.

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
3. Do not change the app code in this task.
4. Report to Emilio in plain English: words enriched, the corrections from vocab/REVIEW.md and the
   "written differently in two places" list, so he can fix his Word file.
```

## Task 2 – The app picks ~40 words per session
**Model: Sonnet** · effort: medium · you see: vocabulary topics now come from your word list, answers arrive faster

```
Task 2 of docs/revamp-tasks.md: word picker. Follow "Common rules" in docs/revamp-tasks.md.
Goal: vocabulary sessions use vocab/words.json instead of the wortschatz-*.md lesson files, and only
~40 words are sent to Gemini per session.
- New lib/words.js: load words.json once (skip removed/unenriched words), list sections and lists
  (from "topics": "SECTION › list"), and pick N words by level (A1/A2/B1, option to include "Kurs"),
  section/list, and "not practised recently" (the browser sends the ids practised recently and how
  often they were wrong; prefer new and weak words, mix in a few known ones). Deterministic per session.
- Section names in Emilio's file are Spanish: add a small map to German + English display names.
- /api/topics returns the word sections/lists; /api/chat puts only the picked words (compact lines:
  de, article, plural or Perfekt, en, es, adjective, case) in the prompt instead of the lesson file.
  Grammar topics keep their lesson files.
- The browser remembers per word: last practised, right/wrong count (localStorage for now – a later
  task moves this to the database; keep it in one place in lib/storage.js).
- Mock tutor (lib/mock.js) uses the same picker.
- Add a small check script (node) that proves: ≤ 40 words in the prompt, level and list respected,
  recently practised words come last.
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
- Reference language: English, or English + Spanish (show the Spanish too).
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
  + grammar), topic (grammar topic, or word section + list from lib/words.js), level (+ "Kurs" words),
  difficulty, questions (10–50), flashcard direction, reference language, grammar points per word,
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
  answer, corrected, rule, error type, correct/skipped, word id), word_progress (user, word id, last practised,
  right, wrong).
- Save each answer as it happens (small API route); the session summary and lib/storage.js history/streak
  read from the server. Keep the current chat in localStorage for quick reload only.
- First login on a browser with old localStorage history: import it once.
- The word picker (lib/words.js) reads word_progress from the server for "not practised recently".
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
  the user's answers and word_progress (never from the model).
- Stats tiles (sessions, questions, % right, words practised of total, streak), recent sessions with "Again".
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
