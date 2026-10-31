# wort. – Deutsch Sparring

A German practice app for the course *Schritte plus Neu – Ausgabe Schweiz*. The student practises
with an AI tutor in a chat, and an AI coach plans the practice towards their goals. The app is built
with Next.js and runs on Vercel. The AI is Google Gemini. The app itself is in English and German only.

**Two ways to run it.** Without a database, students type their name and the class code, and their
history stays in their own browser. With a database (Neon Postgres) and a `SESSION_SECRET`, students
log in with a username and password, and their history is stored on the server. Details: `docs/security-accounts.md`.

## What the student sees

- **Home.** After login (or name and class code) the student lands on Home. It shows the next
  milestone of their plan, their goals with progress, strengths and gaps, four tiles for the last
  30 days, and recent sessions. *Start Sparring* opens the setup screen.
- **Coach** (on Home, right column). A chat that makes and adjusts the student's goals and plan.
  It suggests the next session, and nothing changes until the student taps *Apply*. The numbers
  (progress, streak, gaps) are worked out by the app, not by the AI.
- **Setup screen.** Before each session the student chooses the session type, the topic, the level
  (A1, A2, B1), the difficulty, the number of questions (10–50), the word source, and Swiss or German
  spelling. The choices stay fixed until the session ends.
- **Session types:**
  - *Grammar*: gap fill, choose the form, build a sentence, translate, find the mistake.
  - *Vocabulary*: flashcards from the word list (English ↔ German, or mixed).
  - *Vocabulary + grammar*: flashcards, each followed by a grammar task with the same word.
  - *Mixed review*: a mix of what is due. The app picks the words and topics from the student's
    error log and scores (10 or 20 questions).
- **Session screen.** The app counts the questions and ends the session itself, or at once when the
  student says "stop" or taps *End session*. Then the summary shows the score, the words to repeat,
  the grammar rules to repeat, and progress towards the goals.
- **Word scores.** Each word has up to four scores from 1 to 10: *Meaning*, *Article* and *Plural*
  (nouns only), and *Sentence* (the word used in grammar). The app changes them, not the AI. A word
  comes back after 1, 3, 7 or 21 days, depending on its score. Rules and numbers: `lib/scores.js`.
- **Class exercises.** Exercise models are patterns for grammar topics. The AI writes a new exercise
  from a pattern each session, so students get fresh sentences but the same grammar.

## Run it on your computer

```bash
npm install
cp .env.example .env.local     # then open .env.local and fill it in
npm run dev                    # opens on http://localhost:3000
```

**Demo mode (no AI key, no cost):** set `MOCK=1` in `.env.local`. The demo tutor builds its questions
from the lesson files and the word list. Test words in the chat:

- `langsam`: a slow answer
- `kaputt`: broken answer format
- `rohtext`: plain text instead of the usual answer
- `absturz`: a simulated server error
- `keine Lust mehr`: stop, in your own words

**Before every push:**

- `npm test` runs all the checks in `scripts/` (plain Node, no extra packages).
- `npm run build` must pass, otherwise Vercel fails too.

## Put it live on Vercel (first time, about 15 minutes)

1. **GitHub:** create a private repository and push this project.
2. **Vercel:** Add New → Project → import the repository. If the app is not at the top of the
   repository, set **Root Directory** to the folder that contains `package.json`.
3. **Environment variables** (Vercel → Settings → Environment Variables). Set these before the first deploy:
   - `GEMINI_API_KEY`: your key from Google AI Studio. Never paste it into a chat or a file in GitHub.
   - `CLASS_CODE`: the code for your classmates. Use **at least 12 random characters** (letters and
     digits, made with a password generator). The app does not check the length, so choose a long one.
     A short word such as `schritte5` could be guessed by a script, and then strangers would use your AI key.
4. **Deploy.** After about a minute you get a link such as `deutsch-sparring.vercel.app`.
5. **Accounts (optional):** add a Neon database (Vercel → Storage → Neon) and a `SESSION_SECRET`
   (a long random text). When both are set, the login screen switches on. Step by step, with what
   is stored and how to reset a password: `docs/security-accounts.md`.
6. After changing a variable: Vercel → Deployments → ⋯ → Redeploy.

**Optional settings:**

- `DAILY_LIMIT`: AI messages per student per day (default 150).
- `SIGNUP_PER_HOUR`: new accounts per network per hour (default 10). Raise it, for example to 30,
  when the whole class signs up from the school network.
- `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`: the tutor's models.
- `COACH_MODEL`, `COACH_FALLBACK_MODEL`, `COACH_THINKING` (`low`, `medium` or `high`): the coach's
  own settings. The coach can think harder than the tutor without changing it.

**Preview links:** every branch you push gets its own Vercel preview. Find it in Vercel → your project →
**Deployments** → the row with the branch name → *Visit*.

**Important for previews:** today the preview and the live app use the **same database**, so an account
you create on a preview also exists on the live app. Until a separate preview database is set up, test
with `MOCK=1` or with accounts off. The fix is a second database for previews, with its own `SESSION_SECRET`;
it is planned in `docs/review-2026-10-20.md` at the repository root.

## Update the vocabulary every week

The vocabulary comes from the Word file that Emilio updates about every week. Full steps are in
`vocab/README.md`, section *Weekly update*. In short:

1. Save the new Word file in `vocab/sources/`, keeping its version in the name (for example `…_v11.docx`).
2. Run `node scripts/vocab.mjs import vocab/sources/<file>.docx`. It shows how many words are new,
   changed or removed, and writes the batches to fill.
3. Fill the batches, then run `node scripts/vocab.mjs merge` until it reports `0 still need enrichment`.
4. Run `node scripts/vocab.mjs review` and `node scripts/vocab.mjs status`.
5. Commit, push, and open a pull request titled `Vocabulary vNN`.

## Add a lesson

1. Open `content/template.md`, copy it, and create `content/lektion-NN-thema.md`.
2. Fill in the header lines: `- Niveau:` (A1, A2 and/or B1), `- Stichwörter:` (words students might
   type to ask for the topic), and `- Typ:` (`Grammatik`, `Wortschatz` or `Gemischt`).
3. Write "ss", never "ß". Commit, and the topic appears after about a minute.

Lesson files named `lektion-a1-…`, `lektion-a2-…` and `lektion-b1-…` form the A1–B1 curriculum.
Grammar topics for Setup and the Coach live in `lib/curriculum.js`.

## Add an exercise model

Exercise models are in `content/exercise-models/`, one JSON file per grammar topic. Each item has an
`id` (unique across all files), a `type` (Lückentext, Auswahl, Fehler finden, Satzbau or Übersetzung),
and a `model` sentence with a gap (`___`) or a question. Add the `answer` and any `alternatives`.
Use Swiss spelling (ss). Then run `npm test`, which checks the files.

## Add a database column or table

The database changes are numbered steps in `lib/schema.mjs`, in the list `MIGRATIONS`.

1. Add a new step at the end of the list, with the next number, for example
   `{ version: 6, name: 'answers: seconds', statements: ['ALTER TABLE answers ADD COLUMN IF NOT EXISTS seconds int'] }`.
   Use `CREATE TABLE IF NOT EXISTS` for a table and `CREATE INDEX IF NOT EXISTS` for an index.
2. Never edit or delete an old step. A database that has run it will not run it again.
3. Use the new column in the code, with parameterised SQL only.
4. Run `npm test`, then `node scripts/db-migrate.mjs` (it needs `DATABASE_URL`). The app also runs
   new steps on first use.

## Project notes

- Design: colours, fonts and spacing are set at the top of `app/globals.css`.
- All interface texts are in `lib/ui-text.js`.
- How the tutor behaves: the rules are in `lib/prompt.js`, the answer format in `lib/reply.js`.
- How the AI calls recover from errors (retries, backup model, timeouts): `lib/gemini.js`.
- Usage limits: `lib/guard.js`.
