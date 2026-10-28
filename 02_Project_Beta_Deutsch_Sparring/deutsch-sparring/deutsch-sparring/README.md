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
each word (Akkusativ, Dativ, Genitiv, adjective endings, Perfekt, verb + case)
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
  English → German, German → English, or mixed. **What a noun card asks follows the difficulty:**
  *Easy* – only the German word (a missing or wrong article does not make it wrong; the feedback shows the
  right article and the plural as information); *Medium* – article + noun (`die Lampe`); *Hard* – article +
  noun + plural (`die Lampe, die Lampen`). A German → English noun card on Medium / Hard shows the noun without
  its article: you give article + meaning (`die – lamp`); on Easy only the meaning. Verbs, adjectives and
  phrases: just the word on every level. With grammar points chosen on the setup screen, a grammar task with
  the same word follows each card. The grammar task
  depends on the word: **nouns** – a sentence in Akkusativ, Dativ or Genitiv with the word's adjective
  (e.g. *wegen des alten Schranks*); **verbs** – the Perfekt (*Ich bin abgebogen*) and a sentence with the
  case the verb needs; **adjectives** – fill in the ending; **phrases** and other words – card only.
  The tutor names the point the same way every time in `feedback.rule` (*Genitiv nach wegen*,
  *Dativ nach in (Wo?)*, *Perfekt mit sein* … list in `lib/grammar.js`), so the stats can group it.
  A wrong word or article is reported as *Artikel* / *Wortschatz* (costs the Meaning / Article score); a wrong case,
  ending or Perfekt as *Kasus* / *Adjektivendung* / *Verbform* / *Präposition* (costs the Sentence score only).
  For a flashcard the tutor also says which PART was right in `feedback.parts` (`{ meaning, article, plural }`),
  so the app scores each part on its own and the feedback card can show *Meaning ✓ · Article ✗ (die)*.
  The browser sends the chosen points as `settings.grammar`; the server checks them (`lib/grammar.js`).
- **Word scores:** the app keeps up to four scores per word from 1 to 10 – *Meaning* (the word itself),
  *Article* and *Plural* (nouns only) and *Sentence* (the word in grammar) – in the browser (`wort_scores`) or,
  with an account, in the database. A flashcard only changes the scores its difficulty tests; a word counts as
  *learnt* with Meaning ≥ 8 and, for a noun, Article ≥ 8 (the plural is tracked, not required). Scores from
  before this change had one score "V" for article + word: it is copied into Article once (browser and database
  migration step 5). The picker looks at the scores that matter for the session's difficulty. Full rules:
  `docs/revamp-tasks.md` › Word scores. A session only gets the words it needs
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
- **Home with plans (R13, `components/HomePlan.js`, `lib/home-plan.js`).** Top to bottom: a hero line (on track and what is next, or how many
  milestones are late), **Next up** (the Coach's next milestone with its live count and due date; *Practise this* opens the setup
  screen filled in through `sessionForMilestone`, everything stays free to change; *Other milestone* lists the next three), goal cards with
  one row per part, **Your plan** (zoom: overview with every goal on one line and its parts as segments with a *Today* marker → one
  part with its milestones and dates → one milestone with the words still missing, the last 20 answers on the topic and *Practise this*;
  breadcrumb buttons, Escape zooms out, the level is kept in the browser and survives a reload), strengths and gaps (each row names its
  milestone or says "Not in your plan"), the tiles and recent sessions. Without a goal there is one card, *Tell the Coach your goal*;
  the plan and the tiles stay hidden until there is a goal or a first session. Exam milestones (mock exams, Schreiben/Sprechen) are
  ticked on the milestone view, with optional points (`PATCH /api/goals`; without accounts in the browser). `/api/stats` adds `nextUp`,
  `sessions`, `missing` and `recent`. Old-style goals keep their old bar and timeline until they are converted. Checks: `scripts/check-home-plan.mjs`.
- **Four tiles** for the last 30 days: sessions, questions answered (+ % right), words learnt (Meaning 8–10 and,
  for nouns, Article 8–10) and the streak.
- **Goals** (type exam / vocabulary / grammar, level, start and end date, optionally the word section / list
  or the grammar rules it covers): create, edit, delete. Every new goal gets a default plan of four evenly
  spaced milestones (25 / 50 / 75 / 100 %) that can be changed in the form. The progress % of a goal is
  calculated by the app, never by the AI (`lib/home-stats.js`): *vocabulary* = how far the goal's words are
  on their way to a 10 (average Meaning score), *grammar* = share of right answers on the goal's rules in the last
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
  last message. The routes `/api/coach` and `/api/chat` share one guard (`lib/route-guard.js`: same-origin check, body size limit –
  150 KB for chat, 30 KB / 400 KB for the coach –, JSON parsing, every error as JSON `{ code, detail? }`), plus login when
  accounts are on, class code when off and the daily limit (every coach call counts). The browser only gets a fixed
  error code and a short reason (`db`, `ai-403`, `timeout`, `crash`); the full message stays in the server log, and
  logs never contain the AI's reply (only its length). Earlier coach turns that carried a plan are sent with a short
  summary of that plan; the tutor prompt puts everything from the browser in a fenced «student data» block. The model gets a
  compact context only: goals with milestones, the numbers and strengths/gaps worked out by the app, today's date, the
  last few chat turns (`lib/coach-prompt.js`, `COACH_SCHEMA`). Everything it answers is cleaned again
  (`normalizeCoach` in `lib/coach.js`: unknown topic ids, goal ids or out-of-range dates are dropped). With `MOCK=1`
  `lib/coach-mock.js` answers from the student's real numbers (a suggestion from the biggest gap; "redo my plan" gives a
  plan change). The last 30 messages are saved per student: table `coach_messages` with an account
  (`lib/coach-store.js`, route `/api/coach/messages`; memory with `AUTH_MEMORY=1`), `wort_coach` in the browser without.
  `node scripts/check-coach.mjs` checks the cleaning and the plan maths.
  Review R15: with a plan, every suggested session is tied to a milestone. The model only names a milestone id from
  "NEXT UP" in its context; `milestoneSuggestion` (`lib/coach-goal.js`) lets only the Home "Next up" milestone (or one of its
  "other" milestones) through, otherwise it uses "Next up", and the settings come from `sessionForMilestone`. "Set up this
  session" only prefills the setup screen. Plan changes are `planChanges` (name, end date, minutes, focus part, cut): the server
  turns them into checked changes with `replan`, the card shows before → after and the finish date, and Apply checks again
  (an exam end date and reached milestones never move; old-format cards show as "replaced"). A goal saved or a session
  that ended adds a short local line (no AI call). The Coach is an old-school boxing coach, kept light (at most one boxing
  phrase per message, not in every message). Not done yet: the review mode for due words in the word picker.
- Where it lives: with an account the goals are in the database (tables `goals` + `milestones`,
  `lib/goals-store.js`, route `/api/goals`) and the numbers come from `GET /api/stats` (summed up in SQL over the
  last 30 days – the browser never gets all answers). Without accounts the goals, the word scores and a small
  log of the last answers are in the browser (`wort_goals`, `wort_answerlog`) and `POST /api/stats` only
  calculates from what the browser sends (nothing is stored there). `node scripts/check-goals.mjs` checks the maths.
- A topic on every answer (review R9): each saved answer has a `topic_id` – the session's own topic in a grammar
  session (curriculum topic or situation lesson), otherwise the lowest-level curriculum topic that lists the answer's
  rule (`topicForRule` in `lib/rules.js`). The migration adds the column and an index and fills in old answers
  (safe to run again, nothing is deleted). `progress().grammarStats(userId)` gives the last 40 counted answers per
  topic (skip = wrong, hint = 0.5, "Leicht" left out; `lib/grammar-stats.js`); `/api/stats` returns it as
  `grammarStats`. Without an account the browser keeps `wort_rulelog` and sends it as `rulelog` with the POST.
  `node scripts/check-plan.mjs` checks all of this.
- The plan generator (review R10, nothing on screen yet): a goal becomes **parts** (A1/A2/B1 vocabulary, A1/A2/B1
  grammar & situations, exam practice) with **milestones** of real content – word chunks of a list, curriculum topics,
  situation lessons (two per milestone), mock exams and Schreiben/Sprechen tasks. `lib/plan.js` is the shape and its
  cleaning (a milestone stores only its criterion, never a title), `lib/plan-templates.js` the fixed rules: chunk rule,
  topic order (`needs`, `TEACHING_ORDER`), pace (minutes a day → new words and topics a week, keeping learnt words costs
  time), the 2-week exam buffer, "already solid", and the honest "doesn't fit" answer (`tight`: until when it would need,
  what would be reached by the end, which fixes help). **Every goal, part and milestone name is made there** – the
  Coach (R12) only calls `previewPlan({ template, endDate, minutesPerDay, startLevel, options })` and `replan(goal, …,
  { minutesPerDay, endDate (never for an exam), focus, cut })`. Exam goals include the course-only words as a core
  target (D2). `POST /api/plan` returns the preview and stores nothing. New plans are saved in `goals.plan` (jsonb, one
  UPSERT that also checks the 12-goal limit); old goals are converted by the student on Home (R12): a dialog offers the new plan, the old "% ready" milestones are deleted, nothing is saved before "Use the new plan".
  Goals are made only through the Coach (R12): the model sends `proposeGoal` (a template and numbers), the app builds the plan (`lib/coach-goal.js`, `lib/plan-templates.js`) and the chat shows a preview with Accept / Change; a plan that does not fit shows the generator's fixes as buttons. Renaming, a new end date and a new daily time also go through the Coach (`planChanges`, before → after, then Apply); a name is accepted only if the student typed it. The student can only delete a goal and tick exam milestones. `POST /api/plan` also takes `{fix}` and `{goal, levers, label}`.
  `node scripts/check-plan.mjs` proves it on the B1 example (Goethe B1, 20 Oct 2026 → 24 Apr 2027, 20 min a day).
- Measuring and latching (review R11, nothing on screen yet): `lib/plan-progress.js` is the ONE place that decides
  whether a milestone is reached (the generator asks the same functions). Word chunk: 90 % of its words learnt (V >= 8).
  Grammar topic "solid": 20 counted answers on 2 or more days and the last 20 at 80 % (productive) / 70 % (receptive);
  "introduced": 10 answers at 60 %. Situation lesson: 10 answers at 60 %. Exam items: only you tick them. A reached
  milestone **stays reached** (`reachedAt`); if its words are due or its last answers drop it shows "needs a refresh"
  instead. `computePlans` also gives each part's reached/total/behind/ahead days and each goal's status. `/api/stats`
  returns `plans` and `newlyReached`; with an account `goalsStore().markReached` saves new ticks (one UPDATE, only where
  `reachedAt` is empty); without an account `home-client.js` saves them in the browser (`markReachedLocal`).

## Deploy (first time, ~15 minutes)

1. **GitHub** → New repository → name `deutsch-sparring` → **Private** → Create.
2. Push this folder (or upload everything inside it, including `app`, `components`, `lib`, `content`).
3. **Vercel** → Add New… → Project → Import the repository. If the app is not at the top of the
   repository, set **Root Directory** to the folder that contains `package.json`.
4. Before clicking Deploy, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key from Google AI Studio |
   | `CLASS_CODE` | a code for your classmates: **long and random, at least 12 characters** (letters and digits, a made-up example looks like `k7Qp2Lx9Vr4m` – make your own with a password generator, never copy an example; case-sensitive; optional) |

   Why long and random: a short word-like code (`schritte5`) can be guessed by a script, and then strangers use your
   AI key. Each network may only make 30 wrong guesses a day, so a 12-character random code cannot be guessed.
5. Click **Deploy**. After ~1 minute you get a link like `deutsch-sparring.vercel.app`.

The coach has three optional settings of its own, so it can think harder than the tutor without
changing the tutor: `COACH_MODEL` lets the coach use a stronger model, e.g. a Pro model on a paid plan
(default: the same as `GEMINI_MODEL`); `COACH_FALLBACK_MODEL` is the model it switches to when the first
one is busy (default `gemini-3.5-flash` if `COACH_MODEL` is another model, never a "lite" model);
the one exception: if you do not set `COACH_FALLBACK_MODEL` and the coach's model answers "quota used up" (429),
that one call uses `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`) – a simpler answer is better than none;
`COACH_THINKING` is how long it thinks before answering: `low`, `medium` (default) or `high`. More thinking
means better plans but slower answers. If a model does not accept the setting, the app retries without it.
`GEMINI_TEMPERATURE` (optional) overrides the randomness setting; by default Gemini 3.x models use Google's
own default, because lower values can make them loop.

Optional variables: `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_FALLBACK_MODEL`
(default `gemini-3.5-flash-lite`), `DAILY_LIMIT` (AI messages per student per day, default 150; see *Limits* below),
`SIGNUP_PER_HOUR` (new accounts per network per hour, default 10 – raise it to e.g. 30 for the lesson where the
whole class signs up from the school network), `MOCK=1` (demo tutor without AI, see below).

**Limits** (`lib/guard.js`; counted in the database table `usage` when one is connected, so every server copy on
Vercel sees the same numbers; without a database in the server's memory). A "day" is a UTC day.
- AI messages (tutor + coach): with accounts **150 per account** (`DAILY_LIMIT`) and **3000 per network**
  (`DAILY_LIMIT` × 20). Without accounts **750 per network** (`DAILY_LIMIT` × 5) – the whole class on one school
  network shares it, because a browser could otherwise pretend to be a new student with every message.
- Class code: **30 wrong codes per network per day** (/api/code, /api/chat, /api/coach and sign-up share it); after
  that even the right code waits until tomorrow on that network.
- Log-in: **10 wrong passwords per username + network** in 15 minutes, **100 per network** in 15 minutes. Someone on
  another network can never lock a classmate out.
- Sign-up: **10 tries per username + network** and **10 per network** (`SIGNUP_PER_HOUR`) per hour.
- Saves per account per day: **1500 answers, 100 new sessions, 1500 session updates, 200 goal saves**. Over a limit
  the app answers 429 `{ code: 'limit' }` and shows "You reached today's save limit".
- Old counters (more than two days old) are deleted now and then by the app and by `node scripts/db-migrate.mjs`.

**Accounts** switch on when a database (`DATABASE_URL` or `POSTGRES_URL`, set by Vercel → Storage →
Neon) **and** `SESSION_SECRET` are set. Then the app opens with *Log in* / *Create account*
(the class code is asked once at sign-up), the student's name is their username, *Log out* is in
the avatar menu (it also clears this browser's copy of the student's data and the class code) and the daily limit counts per account. Step-by-step setup, what is stored and
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

## A1–B1 communicative curriculum

The app loads every ordered curriculum unit from `content/lektion-a1-*.md`, `lektion-a2-*.md` and
`lektion-b1-*.md` (currently 48 units: 16 per CEFR level). The setup screen shows only units for the selected
level. `lib/content.js` also exposes each lesson's learning objective, situation, rule and
communicative transfer task to the tutor and coach; the complete Markdown lesson stays the source
of truth.

The tutor uses lesson examples as reference patterns, then varies the people, place, purpose and
exercise form. Sessions move from a meaningful situation through guided practice to short
independent production and a natural follow-up. Feedback judges communicative meaning first,
accepts natural alternatives and keeps the existing error categories and score contract.

Run `npm run check:curriculum` to verify every unit, level filtering, A1/A2/B1 mock sessions,
curriculum context, deterministic variation, final-question completion, and both Standard German
variants.

## Swiss or German Hochdeutsch
These are two Standard German options, not dialect. The default is Swiss Standard German
(Schweizer Hochdeutsch: Spital, Velo, parkieren and `ss`); German Standard German is optional.

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
- `/api/topics` – the grammar curriculum (`lib/curriculum.js`, one level each) and the extra grammar lessons (`content/*.md`) plus the vocabulary sections/lists (`lib/words.js`),
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

### The database: numbered steps, and how to add a column

`lib/schema.mjs` holds `MIGRATIONS`, a numbered list of steps (step 1 = first tables, 2 = extra columns on
`answers`, 3 = `goals.plan`, 4 = the `usage` table for the limits, 5 = the Article and Plural scores on `word_scores` …). The table `schema_version` remembers the last step that was done. When the app
starts it asks ONE question ("which step is the database at?") and only if it is behind does it run the missing
steps – each step in one transaction together with the note "step N done", so a step is either completely done
or not at all. A brand-new database runs all steps; the existing live database (no `schema_version` yet) runs
them once too (they are all safe to repeat) and then is at the latest step. Run it by hand with
`node scripts/db-migrate.mjs` (needs `DATABASE_URL`); it prints the steps it did.

**How to add a column (or a table, or an index):**
1. In `lib/schema.mjs`, add a new object at the END of `MIGRATIONS` with the next number, for example
   `{ version: 4, name: 'answers: seconds', statements: ['ALTER TABLE answers ADD COLUMN IF NOT EXISTS seconds int'] }`.
   A new table: `CREATE TABLE IF NOT EXISTS …`; an index: `CREATE INDEX IF NOT EXISTS …`. (The R1 "usage" table is
   step 4 in the same way.)
2. Never edit or delete an old step – a database that already passed it will not run it again.
3. Use the column in the code that reads/writes it (parameterised SQL only).
4. Run `npm test`, then `node scripts/db-migrate.mjs` once against the preview database (or just deploy: the app
   runs the new step on first use).

**Emptying old answer texts (by hand only, never automatic):** `node scripts/db-migrate.mjs --trim-old-texts`
sets the question / student answer / corrected texts of answers older than 90 days to empty (`--days=N` for
another age, at least 30). All numbers, the rule, topic, right/wrong flags and `created_at` stay, so the
statistics do not change. It prints only how many answers it changed, and it cannot be undone (make a Neon
backup/branch first if unsure). Running it again changes 0 rows.

**All-or-nothing saves:** saving a goal with its milestones, replacing the coach chat, the first import of the
browser's history, and "answer + word score" each run as ONE transaction (`sql.transaction`), so a failure in
the middle changes nothing. The answer + score save is a single SQL statement guarded by "the score row is still
as I read it", plus a lock per student and word, so two tabs answering the same word cannot overwrite each other
(it reads again and retries). `scripts/check-saves.mjs` tests this with a fake database that fails on purpose.

### Grammar topics (the A1–B1 curriculum)

The grammar topics students choose in Setup, the topics the coach recommends and the lessons the tutor teaches from are
all one list: `lib/curriculum.js`. To add or change a topic, edit that file (on GitHub: open it, pencil icon, commit).
Each entry has: `id` (`g-a2-weil` style; never change an id students may have saved), `level` (A1 / A2 / B1),
`title` (German; the part before ":" is the chip name), `titleEn`, `rule` (2–5 simple German sentences), `examples`
(3–5 correct sentences; mark the key word with stars, optional hint after a bar: `Ich kaufe *einen|ein* Tisch.`),
`exerciseIdeas` (2–3 lines), `ruleNames` (names for the stats, reuse `lib/grammar.js` RULES where they fit), `needs`
(topics that must come first in a plan), `role` (`productive` = solid at 80 %, `receptive` = 70 %; optional
`threshold`) and optionally `appNote`. A new topic also goes into `TEACHING_ORDER` (the plan order) in the same file. Swiss spelling, never ß. Then run `node scripts/check-curriculum.mjs`.
- Setup shows only the topics of the chosen level (Level is chosen first). The old lesson files in `content/` stay as
  "More lessons" at their level (`lektion-01-dativ-akkusativ` is A2).
- Coach: its CURRICULUM text and TOPIC CATALOG are built from this list. Tutor: `/api/chat` puts a generated lesson
  (title, level, rule, examples, exercise ideas, rule names) into the prompt. Demo tutor (MOCK=1): gap fills made by
  blanking the starred word of each example.

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

Before pushing: run `npm test` (it runs every `scripts/check-*.mjs`, plain node, no extra packages) and
`npm run build`; both must pass, otherwise Vercel fails too.
`scripts/check-gemini.mjs` tests the AI safety nets with a fake Gemini (empty or cut-off answer, a rejected
setting, busy model, timeout, wrong key) and the answer cleaning in `lib/reply.js`, so no real key is needed.

How the AI calls recover (`lib/gemini.js`): an empty, blocked or cut-off answer is retried once without
thinking, then the backup model answers; a busy or slow model goes straight to the backup. A wrong key or
model name shows "The AI key or model name on the server is wrong" instead of "not available". The small grey
detail under a coach error is short and generic (e.g. "AI: cut off", "AI 503"), never raw AI or database text.
