# wort. – Deutsch Sparring

A German practice chatbot built on our course book (*Schritte plus Neu – Ausgabe Schweiz*).
Next.js on Vercel + Google Gemini (free tier). No database: everything a student does is
remembered in their own browser.

**One screen, the chat is the control panel.** Students type (or tap an option) to give their
name and the class code, pick a topic, change level or difficulty, ask for a hint or a rule,
or switch the right panel. Role-plays (e.g. *Umzug*: your friend Marco helps you move) are the
main exercise style; classic exercises use the same cards.

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
(default `gemini-3.5-flash-lite`), `DAILY_LIMIT` (messages per person per day, default 150),
`MOCK=1` (demo tutor without AI, see below).
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
- `- Typ:` = `Grammatik`, `Wortschatz` or `Gemischt` – shown as Grammar / Vocabulary / Mixed.
- The first line (`# Title`) is the topic name; the part before ` – ` is the short name on the chips.
- Write "ss" not "ß", own words, no scanned pages.

## Change how the tutor behaves

- The tutor's rules are in `lib/prompt.js` (English on purpose; the tutor still speaks German).
- The answer format (the JSON the tutor must return) is in `lib/reply.js`.
- **All interface texts** are in `lib/ui-text.js`. English is active; a German set is already
  there – change `UI_LANG = 'en'` to `'de'` to switch. The tutor's onboarding lines are there too.

## How it works (for developers)

- `app/page.js` – the screen and its state: onboarding (name, class code via `/api/code`) runs
  without AI; short commands ("harder", "show me progress", "change topic", "neu starten" …)
  are understood by `lib/intents.js`; everything else goes to `/api/chat`.
- `/api/chat` – builds the prompt, calls Gemini with `responseMimeType: application/json` +
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

With `MOCK=1` the demo tutor plays the 8-task *Umzug* role-play and understands hint, rule,
skip, easier/harder, level, "show me progress" and "Nochmal". Test words: `langsam` (slow
answer), `kaputt` (broken JSON), `rohtext` (plain text), `absturz` (server error).
To start over as a new student: browser DevTools → Application → Local Storage → delete the
`wort_*` entries (or use the avatar menu → *Change name*).

Before pushing: `npm run build` must pass, otherwise Vercel fails too.
