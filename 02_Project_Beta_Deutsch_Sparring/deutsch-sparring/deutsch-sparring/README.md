# Deutsch Sparring

A B1 German practice chatbot built on our course book (*Schritte plus Neu – Ausgabe Schweiz*).
Next.js on Vercel + Google Gemini (free tier). No database.

## Deploy (first time, ~15 minutes)

1. **GitHub** → New repository → name `deutsch-sparring` → **Private** → Create.
2. On the empty repo page click **uploading an existing file**. Unzip `deutsch-sparring.zip`,
   open the folder, select **everything inside it** (including the `app`, `lib`, `content` folders)
   and drag it into the browser. Click **Commit changes**.
   (Hidden files like `.gitignore` may not get selected – that's fine.)
3. **Vercel** → Add New… → Project → Import `deutsch-sparring` from GitHub.
4. Before clicking Deploy, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key from Google AI Studio |
   | `CLASS_CODE` | a code for your classmates, e.g. `schritte5` (optional) |
5. Click **Deploy**. After ~1 minute you get a link like `deutsch-sparring.vercel.app`.

Optional variables: `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_FALLBACK_MODEL`
(default `gemini-3.5-flash-lite`), `DAILY_LIMIT` (messages per person per day, default 150).
After changing a variable: Vercel → Deployments → ⋯ → Redeploy.

## Add a lesson (10 minutes)

1. In GitHub open the `content` folder → open `template.md` → copy its text.
2. **Add file → Create new file** → name it `lektion-03-thema.md` → paste → fill it in.
3. **Commit changes.** Vercel redeploys automatically; the new topic button appears in ~1 minute.

Rules: one file per topic, `- Typ:` must be `Grammatik`, `Wortschatz` or `Gemischt`
(that decides the group on the start page), write "ss" not "ß", own words, no scanned pages.

## Change how the tutor behaves

The tutor's rules are in `lib/prompt.js` (English on purpose; the tutor still speaks German).

## Run locally (optional, for developers)

```bash
npm install
cp .env.example .env.local   # add your key, or set MOCK=1 to test without AI
npm run dev                  # http://localhost:3000
```
