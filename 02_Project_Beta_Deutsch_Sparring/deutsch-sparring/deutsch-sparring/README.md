# wort. – Deutsch Sparring

A German practice chatbot built on our course book (*Schritte plus Neu – Ausgabe Schweiz*).
Next.js on Vercel + Google Gemini (free tier). Optional **accounts** (username + password,
stored in Vercel's Postgres / Neon) – see `docs/security-accounts.md` at the repository root.
Without a database the app works without login; the practice history is remembered in each
student's own browser either way.

**A setup screen, then the chat.** Before each session the student chooses everything once on
the setup screen: *Grammar* or *Vocabulary + grammar*, the topic (grammar lesson, or word
section + list with word counts), level (A1/A2/B1), difficulty (Easy/Medium/Hard), questions
(10–50), word source (Goethe list / From the course / Both), flashcard direction, grammar with
each word (article & plural, Akkusativ, Dativ, Genitiv, adjective endings, Perfekt, verb + case)
and *Swiss or German Hochdeutsch* (see below). The screen opens with
the last session's choices. **These settings stay fixed until the session ends**: asking for
«harder», «20 questions» or another topic in the chat gets a short «end the session to change
this». Hint, rule, skip and stop still work in the chat (and as chips above the input).

- **During a session** a slim ribbon above the chat shows the fixed settings, «Question X of N»
  with a mini progress bar and *End session*. The right panel has three tabs: *At a glance*,
  *Progress & gaps*, *Grammar focus*.
- **Sessions of 10–50 questions.** The app counts the questions itself and ends the session when
  they are done – or at once when the student says «Stopp», «genug», «I'm done» or taps
  *End session*. The app then switches to the **session summary screen** (stage `summary`, kept on
  reload): score, one segment per question, *Words you know* / *Words to repeat* (with a short reason such
  as "article" or "Genitiv"; grammar topics show *Questions you got right* / *To repeat*), grammar rules
  with right/total (red under 50 %), a *Towards your goals* line per goal (progress before → after, same
  numbers as Home, `/api/stats`) and the buttons *Back to home*, *Same settings again*, *New session*. The
  link *See the conversation* opens the chat, which keeps a short closing line and a *Back to summary* button.
- **Grammar topics:** gap fill, choose the form, build a sentence, translate, find the mistake.
- **Vocabulary topics = flashcards** from the word list (`vocab/words.json`, see `vocab/README.md`).
  The topics are the word list's sections and lists (e.g. *Home & living › Furniture & objects*);
  tap a section to practise all of it or pick one list. English is the reference language:
  English → German (answer with the article), German → English, or mixed. With grammar points
  chosen on the setup screen, a grammar task with the same word follows each card. The card always
  comes first and always checks the article (a German → English noun card shows the noun without
  article: you give article + meaning; *Article & plural* also asks for the plural). The grammar task
  depends on the word: **nouns** – a sentence in Akkusativ, Dativ or Genitiv with the word's adjective
  (e.g. *wegen des alten Schranks*); **verbs** – the Perfekt (*Ich bin abgebogen*) and a sentence with the
  case the verb needs; **adjectives** – fill in the ending; **phrases** and other words – card only.
  The tutor names the point the same way every time in `feedback.rule` (*Genitiv nach wegen*,
  *Dativ nach in (Wo?)*, *Perfekt mit sein* … list in `lib/grammar.js`), so the stats can group it.
  A wrong word or article is reported as *Artikel* / *Wortschatz* (costs the V score); a wrong case,
  ending or Perfekt as *Kasus* / *Adjektivendung* / *Verbform* / *Präposition* (costs the G score only).
  The browser sends the chosen points as `settings.grammar`; the server checks them (`lib/grammar.js`).
- **Word scores:** the app keeps two scores per word from 1 to 10 – *V* (the word itself) and *G*
  (the word in grammar) – in the browser (`wort_scores`). A session only gets the words it needs
  (1 per question; with sentences 1 per 2 questions; plus 3 spare), chosen from the chosen
  section/list and level: words that are due and weak first (lowest score first), about 30 % new
  words, 1–2 words with a 10 as a check. A word comes back after 1 / 3 / 7 / 21 days (score 1–3 /
  4–6 / 7–9 / 10). A 10 needs 4 right answers in a row; answers after a hint or on *Easy* give +1
  and do not count toward that. The app, never the AI, changes the scores. All rules and numbers
  are in `lib/scores.js`; `node scripts/check-scores.mjs` checks them.
- Without accounts the chat first asks for the name and the class code, then shows *Home*; with
  accounts *Home* comes right after logging in. *Start Sparring* on Home opens the setup screen.

**Home page.** After logging in (or after name and class code when accounts are off) the student
lands on *Home*; the header menu switches between *Home* and *Sparring*, and *Start Sparring →* opens
the setup screen. A running session is kept while the student looks at Home (*Continue session*) and
survives a reload. Home shows (`components/Home.js`):
- **Four tiles** for the last 30 days: sessions, questions answered (+ % right), words learnt (V score
  8–10 of all words) and the streak.
- **Goals** (type exam / vocabulary / grammar, level, start and end date, optionally the word section / list
  or the grammar rules it covers): create, edit, delete. Every new goal gets a default plan of four evenly
  spaced milestones (25 / 50 / 75 / 100 %) that can be changed in the form. The progress % of a goal is
  calculated by the app, never by the AI (`lib/home-stats.js`): *vocabulary* = how far the goal's words are
  on their way to a 10 (average V score), *grammar* = share of right answers on the goal's rules in the last
  30 days (counted fully from 20 answers), *exam* = the average of the two. "A little behind" = the progress is
  more than 10 points behind the share of the time that has passed.
- **Plan timeline** (plain HTML/CSS, no chart package): one line per goal, month ticks, milestone dots
  (reached = filled, next = thick ring, coming = grey ring, missed = amber), a *Today* line, and a switch
  *Whole plan / Still to do* (the latter starts today and folds past milestones into "✓ N reached" / "N missed").
- **Strengths & gaps** of the last 30 days, grouped by `feedback.rule` and by word list (with the average V and
  G score of the list), each with its % and the goal it belongs to; **recent sessions** with *Again*.
- **The coach** (right column, `components/Coach.js`): a chat that plans the student's practice towards their goals.
  Opening Home gives one automatic greeting with a recommendation (at most one automatic coach call a day;
  otherwise the coach only answers when the student writes). A coach message can carry a **Suggested session**
  box (*Set up this session* opens the setup screen prefilled with those settings) and **plan changes** (milestones
  to add / move / remove for one goal), shown as a short list with *Apply* / *Keep my plan*. Nothing is changed
  until the student taps *Apply*; the app then checks the goal id and that every date lies inside the goal's time
  frame (`applyPlan` in `lib/coach.js`) and saves through the normal goals storage. Quick-reply chips sit under the
  last message. The route `/api/coach` has the same guards as `/api/chat` (login when accounts are on, class code when
  off, the daily limit – every coach call counts –, validation, size limits, every error as JSON). The model gets a
  compact context only: goals with milestones, the numbers and strengths/gaps worked out by the app, today's date, the
  last few chat turns (`lib/coach-prompt.js`, `COACH_SCHEMA`). Everything it answers is cleaned again
  (`normalizeCoach` in `lib/coach.js`: unknown topic ids, goal ids or out-of-range dates are dropped). With `MOCK=1`
  `lib/coach-mock.js` answers from the student's real numbers (a suggestion from the biggest gap; "redo my plan" gives a
  plan change). The last 30 messages are saved per student: table `coach_messages` with an account
  (`lib/coach-store.js`, route `/api/coach/messages`; memory with `AUTH_MEMORY=1`), `wort_coach` in the browser without.
  `node scripts/check-coach.mjs` checks the cleaning and the plan maths.
- Where it lives: with an account the goals are in the database (tables `goals` + `milestones`,
  `lib/goals-store.js`, route `/api/goals`) and the numbers come from `GET /api/stats` (summed up in SQL over the
  last 30 days – the browser never gets all answers). Without accounts the goals, the word scores and a small
  log of the last answers are in the browser (`wort_goals`, `wort_answerlog`) and `POST /api/stats` only
  calculates from what the browser sends (nothing is stored there). `node scripts/check-goals.mjs` checks the maths.

## Deploy (first time, ~15 minutes)

1. **GitHub** → New repository → name `deutsch-sparring` → **Private** → Create.
2. Push this folder (or upload everything inside it, including `app`, `components`, `lib`, `content`).
3. **Vercel** → Add New… → Project → Import the repository. If the app is not at the top of the
   repository, set **Root Directory** to the folder that contains `package.json`.
4. Before clicking Deploy, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key from Google AI Studio |
   | `CLASS_CODE` | a code for your classmates, e.g. `schritte5` (optional, case-sensitive) |
5. Click **Deploy**. After ~1 minute you get a link like `deutsch-sparring.vercel.app`.

Optional variables: `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_FALLBACK_MODEL`
(default `gemini-3.5-flash-lite`), `DAILY_LIMIT` (messages per student per day, default 150 – counted
per browser, so a whole class on one school network is not locked out; only wrong class codes count as tries),
`MOCK=1` (demo tutor without AI, see below).

**Accounts** switch on when a database (`DATABASE_URL` or `POSTGRES_URL`, set by Vercel → Storage →
Neon) **and** `SESSION_SECRET` are set. Then the app opens with *Log in* / *Create account*
(the class code is asked once at sign-up), the student's name is their username, *Log out* is in
the avatar menu and the daily limit counts per account. Step-by-step setup, what is stored and
how to reset a password: `docs/security-accounts.md`.
After changing a variable: Vercel → Deployments → ⋯ → Redeploy.

**Preview links:** every branch you push gets its own Vercel preview. Find it in Vercel →
your project → **Deployments** (the row with the branch name → *Visit*), or on GitHub next to
the latest commit of the branch (the green ✓ → *Details*).

## Add a lesson (10 minutes)

1. In GitHub open the `content` folder → open `template.md` → copy its text.
2. **Add file → Create new file** → name it `lektion-03-thema.md` → paste → fill it in.
3. **Commit changes.** Vercel redeploys automatically; the new topic appears in ~1 minute.

Rules: one file per topic.
- `- Niveau:` = `A1`, `A2` and/or `B1` (e.g. `A2, B1`) – the topic is offered at these levels.
- `- Stichwörter:` words students might type to ask for the topic, German and English
  (e.g. `Möbel, furniture, home`) – so «30 questions about furniture» finds the right lesson.
- `- Typ:` = `Grammatik`, `Wortschatz` or `Gemischt` – shown as Grammar / Vocabulary / Mixed.
  `Wortschatz` topics are practised as flashcards.
- Word tables: `| Nomen | Englisch | Plural | Genitiv | Typisches Adjektiv | … |` – the
  `Englisch` column is the reference language of the flashcards, the adjective is used for the
  sentence tasks. Swiss words: `das Wohnzimmer / (CH) die Stube` (both are accepted).
- The first line (`# Title`) is the topic name; the part before ` – ` is the short name on the chips.
- Write "ss" not "ß" (the word list and lessons stay Swiss; the German variant is made when something is shown), own words, no scanned pages.

## Swiss or German Hochdeutsch
The setup screen's choice (`variant` = `ch` | `de`) is sent with every `/api/chat` request and checked on the
server (anything else = `ch`). Everything that differs lives in `lib/variants.js`:
- **Spelling**: `toVariant(text, variant)`. Swiss = `ss`, never `ß`. German = `ß` only in a list of words
  that really have it (Strasse→Straße, gross→groß, heissen→heißen, Fuss→Fuß, schliessen→schließen …);
  words with a short vowel (Klasse, Wasser, muss, dass) are never touched. A missing word? Add its stem to
  `SS_STEMS`.
- **Word choice**: one map of Swiss ↔ German words (`PAIRS`: Velo/Fahrrad, Spital/Krankenhaus, Trottoir/Bürgersteig,
  parkieren/parken, Estrich/Dachboden, Kasten/Schrank, Stube/Wohnzimmer …). Only certain pairs.
- **Accepting both**: `sameAnswer(a, b)` treats ss/ß and Swiss/German pairs as equal; the answer check of the demo
  tutor (`lib/mock.js`, `lib/word-tasks.js`) and the corrections diff (`lib/diff.js`) use it. A wrong article still
  counts as wrong. The student's own answer is never rewritten.
- **Showing**: the real tutor gets one rule per variant in `lib/prompt.js` (the other variant is always accepted);
  the route also converts the tutor's text to the chosen spelling (`replyToVariant`). The demo tutor shows
  flashcards in the variant's form (`localizeWord`). `vocab/words.json` stays Swiss.
- `node scripts/check-variants.mjs` checks all of this.

## Change how the tutor behaves

- The tutor's rules are in `lib/prompt.js` (English on purpose; the tutor still speaks German).
- The answer format (the JSON the tutor must return) is in `lib/reply.js`.
- **All interface texts** are in `lib/ui-text.js`. English is active; a German set is already
  there – change `UI_LANG = 'en'` to `'de'` to switch. The tutor's onboarding lines are there too.

## How it works (for developers)

- `app/page.js` – the screen and its state, in stages: name / class code (chat, no AI, only
  without accounts) → `home` (`components/Home.js`) → `setup` (`components/SetupScreen.js`) → `practice` → `summary` (`components/SessionSummary.js`; numbers from `summaryDetails()` in `lib/stats.js`; the goal progress at session start is stored in `session.goalsBefore` via `goalSnapshot()` in `lib/home-client.js`) (practice = chat + ribbon
  `components/SessionRibbon.js` + right panel `components/SessionPanel.js`). **The app owns the
  session**: it numbers the questions, counts the score and ends the session; the AI only writes
  exercises and feedback. Each session carries its fixed settings (`session.settings`, helpers in
  `lib/session-settings.js`); the last setup is remembered in `wort_prefs` to prefill the next one.
  Short commands ("stop", "skip", "explain the rule" …) are understood by `lib/intents.js`; asking
  to change a setting is answered by the app («end the session to change this»); everything else
  goes to `/api/chat`. A running session survives a reload (`wort_chat`).
- **Accounts** (only when switched on): `proxy.js` sends visitors without a valid login cookie to
  `/login` (API routes answer 401); `lib/session.js` = on/off switch + signed cookie,
  `lib/auth.js` = checks in each API route, `lib/password.mjs` = scrypt, `lib/users.js` = the
  `users` table (or memory with `AUTH_MEMORY=1`), `lib/schema.mjs` = the table (created on first
  use or with `node scripts/db-migrate.mjs`), `app/api/auth/*` = log in / sign up / log out,
  `components/AuthCard.js` = the login card. Tries are limited in `lib/guard.js`.
- `/api/goals`, `/api/stats` – the Home page (see above); `lib/goals.js` (validation, default plan, timeline maths, no React),
  `lib/home-stats.js` (numbers, server only), `lib/home-client.js` (browser side).
- `/api/coach`, `/api/coach/messages` – the coach on Home (see above); `lib/coach.js` (cleaning, plan maths, no React),
  `lib/coach-prompt.js` (instructions + answer schema), `lib/coach-mock.js`, `lib/coach-store.js`, `lib/coach-client.js`,
  `lib/home-data.js` (the numbers, shared by `/api/stats` and `/api/coach`).
- `/api/topics` – grammar lessons (`content/*.md`) plus the vocabulary sections/lists (`lib/words.js`),
  each list with its word counts per level and word source (for the setup screen).
  The old `wortschatz-*.md` lesson files are no longer used as topics.
- `/api/chat` – for a vocabulary topic the server picks the session's words once (`pickWords` in
  `lib/scores.js`; the scores come from the database for a logged-in student, from the browser's
  request without accounts), puts only those
  words into the prompt as compact lines and sends their ids back; the browser returns them with
  every later request. Builds the prompt, calls Gemini with `responseMimeType: application/json` +
  `responseSchema`, cleans the answer (`normalizeReply`) and returns it. Safety nets in
  `lib/gemini.js`: low thinking (retried without it on HTTP 400), 25 s timeout per call,
  fallback model, `maxDuration = 60`, every error as JSON. Broken JSON → shown as a normal message.
- The browser keeps the running session: answers, score (counted by the app, not the model), the
  gap card. `lib/storage.js` is the one interface for history, streak and word scores:
  - **without accounts / MOCK=1 / no database**: localStorage only (last 5 sessions + streak + scores).
  - **logged in**: they live in the database (`lib/progress.js`, tables `sessions`, `answers`,
    `word_scores` in `lib/schema.mjs`; memory with `AUTH_MEMORY=1`). `lib/progress-client.js` sends
    each answer (queued, retried) to `/api/progress/answer`, session start / end to
    `/api/progress/session`, loads `/api/progress/history` (last 5 + streak) after login,
    `/api/progress/scores?ids=` and imports the old localStorage data once via
    `/api/progress/import`. The server calculates the word scores (`applyAnswer`); `lib/progress-api.js`
    = login check, same-origin check, size limit for all of these routes. localStorage only keeps
    the current conversation (`wort_chat@user`) and a flag that the import happened.
- Design: colours, fonts (Lora + Inter) and spacing from the Figma file "wort.", tokens at the
  top of `app/globals.css`. Desktop layout = ribbon on top, chat + right panel below; the phone
  layout is not done yet.

## Run locally

```bash
npm install
cp .env.example .env.local   # MOCK=1 tests without AI; or add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

With `MOCK=1` the demo tutor builds its questions from the lesson files (the example exercises
for grammar) and from the same word picker as the real tutor (flashcards) and understands hint, rule and skip
(asking to change a setting gets «end the session to change this»). It shows every grammar task type
(noun cases incl. Genitiv, verb Perfekt and verb + case, adjective endings); its German forms live in
`lib/declension.js` and `lib/word-tasks.js` and `node scripts/check-word-tasks.mjs` checks them on every
word of the list (`node scripts/check-variants.mjs` checks the Swiss/German variants). Test words: `langsam` (slow answer), `kaputt` (broken JSON),
`rohtext` (plain text), `absturz` (server error), `keine Lust mehr` (stop in own words).
To start over as a new student: browser DevTools → Application → Local Storage → delete the
`wort_*` entries (or use the avatar menu → *Change name*). The avatar menu → *Start a new session*
opens the setup screen (*Cancel* goes back to the running session).

Accounts locally without a database: add `AUTH_MEMORY=1` and `SESSION_SECRET=test` to
`.env.local` (users live in memory until the server stops).

Before pushing: `npm run build` must pass, otherwise Vercel fails too.
