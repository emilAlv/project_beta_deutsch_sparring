# wort. – Deutsch Sparring

A German practice chatbot built on our course book (*Schritte plus Neu – Ausgabe Schweiz*).
Next.js on Vercel + Google Gemini (free tier). Optional **accounts** (username + password,
stored in Vercel's Postgres / Neon) – see `docs/security-accounts.md` at the repository root.
Without a database the app works without login; the practice history is remembered in each
student's own browser either way.

**One screen, the chat is the control panel.** Students type (or tap an option) to give their
name and the class code, pick a topic, change level or difficulty, ask for a hint or a rule,
or switch the right panel.

- **Sessions of 10–50 questions** (buttons in the right panel, or say «20 Fragen»). The app counts
  the questions itself and ends the session when they are done – or at once when the student
  says «Stopp», «genug», «I'm done» or taps *End session*. A summary card shows the score;
  *Same topic again* starts a new round.
- **Grammar topics:** gap fill, choose the form, build a sentence, translate, find the mistake.
- **Vocabulary topics = flashcards** from the word list (`vocab/words.json`, see `vocab/README.md`).
  The topics are the word list's sections and lists (e.g. *Home & living › Furniture & objects*);
  tap a section to practise all of it or pick one list. English is the reference language:
  English → German (answer with the article), German → English, or mixed. Optionally
  *Add sentences*: after each card, build a sentence with the word – practises article +
  adjective ending in Nominativ, Akkusativ and Dativ.
- **Word scores:** the app keeps two scores per word from 1 to 10 – *V* (the word itself) and *G*
  (the word in grammar) – in the browser (`wort_scores`). A session only gets the words it needs
  (1 per question; with sentences 1 per 2 questions; plus 3 spare), chosen from the chosen
  section/list and level: words that are due and weak first (lowest score first), about 30 % new
  words, 1–2 words with a 10 as a check. A word comes back after 1 / 3 / 7 / 21 days (score 1–3 /
  4–6 / 7–9 / 10). A 10 needs 4 right answers in a row; answers after a hint or on *Easy* give +1
  and do not count toward that. The app, never the AI, changes the scores. All rules and numbers
  are in `lib/scores.js`; `node scripts/check-scores.mjs` checks them.
- Change topic any time: tap *Change topic*, *Grammar* / *Vocabulary*, a topic name, or just
  write «Ich möchte jetzt Wohnen üben».

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
- Write "ss" not "ß", own words, no scanned pages.

## Change how the tutor behaves

- The tutor's rules are in `lib/prompt.js` (English on purpose; the tutor still speaks German).
- The answer format (the JSON the tutor must return) is in `lib/reply.js`.
- **All interface texts** are in `lib/ui-text.js`. English is active; a German set is already
  there – change `UI_LANG = 'en'` to `'de'` to switch. The tutor's onboarding lines are there too.

## How it works (for developers)

- `app/page.js` – the screen and its state. **The app owns the session**: it numbers the
  questions, counts the score, ends the session (all questions done, or the student stops) and
  switches topics; the AI only writes exercises and feedback. Onboarding (name, class code via
  `/api/code`) runs without AI; short commands ("stop", "20 questions", "English to German",
  "harder", "change topic" …) are understood by `lib/intents.js`; everything else goes to `/api/chat`.
- **Accounts** (only when switched on): `proxy.js` sends visitors without a valid login cookie to
  `/login` (API routes answer 401); `lib/session.js` = on/off switch + signed cookie,
  `lib/auth.js` = checks in each API route, `lib/password.mjs` = scrypt, `lib/users.js` = the
  `users` table (or memory with `AUTH_MEMORY=1`), `lib/schema.mjs` = the table (created on first
  use or with `node scripts/db-migrate.mjs`), `app/api/auth/*` = log in / sign up / log out,
  `components/AuthCard.js` = the login card. Tries are limited in `lib/guard.js`.
- `/api/topics` – grammar lessons (`content/*.md`) plus the vocabulary sections/lists (`lib/words.js`).
  The old `wortschatz-*.md` lesson files are no longer used as topics.
- `/api/chat` – for a vocabulary topic the server picks the session's words once (`pickWords` in
  `lib/scores.js`, using the scores the browser sends with the first request), puts only those
  words into the prompt as compact lines and sends their ids back; the browser returns them with
  every later request. Builds the prompt, calls Gemini with `responseMimeType: application/json` +
  `responseSchema`, cleans the answer (`normalizeReply`) and returns it. Safety nets in
  `lib/gemini.js`: low thinking (retried without it on HTTP 400), 25 s timeout per call,
  fallback model, `maxDuration = 60`, every error as JSON. Broken JSON → shown as a normal message.
- The browser keeps the session: answers, score (counted by the app, not the model), the gap
  card, last 5 sessions and the streak (`lib/storage.js`, localStorage only).
- Design: colours, fonts (Lora + Inter) and spacing from the Figma file "wort.", tokens at the
  top of `app/globals.css`. Desktop layout = 3 columns; the phone layout is not done yet.

## Run locally

```bash
npm install
cp .env.example .env.local   # MOCK=1 tests without AI; or add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

With `MOCK=1` the demo tutor builds its questions from the lesson files (the example exercises
for grammar) and from the same word picker as the real tutor (flashcards) and understands hint, rule, skip, easier/harder,
level and direction changes. Test words: `langsam` (slow answer), `kaputt` (broken JSON),
`rohtext` (plain text), `absturz` (server error), `keine Lust mehr` (stop in own words).
To start over as a new student: browser DevTools → Application → Local Storage → delete the
`wort_*` entries (or use the avatar menu → *Change name*).

Accounts locally without a database: add `AUTH_MEMORY=1` and `SESSION_SECRET=test` to
`.env.local` (users live in memory until the server stops).

Before pushing: `npm run build` must pass, otherwise Vercel fails too.
