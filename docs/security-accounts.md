# Accounts in wort. – what is stored and how to switch them on

Short version: students log in with a **username and password**. Anyone who knows the
**class code** can create an account. Passwords are never stored, only a scrambled
fingerprint of them. Accounts switch on by themselves as soon as a database **and** a
`SESSION_SECRET` are set in Vercel. Until then the app works exactly as before
(name + class code in the chat, no login).

## What is stored (in the database)

One row per student in the table `users`:

| Column | What it is |
|---|---|
| `id` | a random number that identifies the account |
| `username` | what the student chose, e.g. `Anna` (3–24 letters or numbers). `Anna` and `anna` are the same account. |
| `password_hash` + `salt` | a scrambled fingerprint of the password (see below), not the password |
| `created_at` | when the account was made |
| `settings` | one small note, only after an import: that the old browser data was handed over once (and the old streak) |

**Progress (three more tables, plus two for goals and one for the coach chat).** For a logged-in student the app saves its learning progress
in the database, so it follows the student to any device:

| Table | One row per | What is in it |
|---|---|---|
| `sessions` | practice session | the settings chosen (level, difficulty, topic …), start and end time, number of questions, the result card (done / correct / skipped, topic name, the last 5 mistakes) |
| `answers` | answered or skipped question | question number, task type, the word, the question text, **what the student typed**, the corrected sentence, the rule, the kind of error, right / wrong / skipped, the time |
| `word_scores` | student and word | the two scores 1–10 (word itself / grammar), the right-answers-in-a-row counters, when the word comes back, when it was last practised |
| `goals` | goal | the student's goal: name, type (exam / vocabulary / grammar), level, start and end date, and what it covers (word section / list, grammar rules) |
| `milestones` | milestone of a goal | date, title, target in percent, reached or not; deleted with its goal |
| `coach_messages` | message in the Home page coach chat | what the student wrote to the coach and what the coach answered (text only), the session suggestion / plan changes the coach proposed and whether the student applied or kept them, the time. Only the last 30 messages are kept; older ones are deleted. |

All rows are tied to the account (`user_id`) and deleted with it. Every request checks that you
are logged in and only ever reads or writes **your own** rows; the id of the student is taken from
the signed login cookie, never from the request. Word scores are calculated **on the server**
(`lib/scores.js`), so a browser cannot give itself a 10. The word picker of the tutor also reads
them from the database, not from the browser. The streak is counted from the days with answers.
Everything sent by the browser is checked and limited in size (a request over 20 KB is refused;
the one-time import 500 KB).

**The coach.** The coach on the Home page is a second chat, separate from the tutor. To answer, the server sends
Google's AI a short summary: the student's goals and milestones, the numbers and strengths/gaps worked out by
the app, today's date and the last few chat turns (never the full answer history, never the password or other
accounts' data). The coach only *proposes*: a plan change is saved only after the student taps *Apply*, and the
app checks again that the goal belongs to the student and that every date is inside the goal's time frame. Every
coach message counts toward the daily limit. The coach chat is saved (last 30 messages, own account only, same
checks as the other tables); without accounts it stays in the browser.

**What is not stored:** the password itself, e-mail addresses, real names, IP addresses,
the chat text of the *tutor* conversation (it is not saved on the server; only the typed
answers and corrections of each question are, see above; the coach chat above is the exception, kept as described). Only the current conversation stays in the
student's browser (to survive a reload), kept separately per username. Without accounts
(no database yet) everything stays in the browser, exactly as before.

**First login on an old browser.** If a browser still holds history and word scores from before
accounts existed, they are copied into the account **once** (and ignored if the account already has
progress). After that the browser's copy is no longer used.

**Password fingerprint.** We use *scrypt*, which is built into Node (no extra package). It turns
the password plus a random "salt" into a long number. The same password always gives the same
number, so we can check a login, but you cannot turn the number back into the password. scrypt
is slow on purpose (about 0.2 seconds and 64 MB of memory per try), so someone who stole the
database would need years to guess good passwords. The salt makes two equal passwords look
different.

## How a login works

- After log-in the browser gets a **login cookie** (a small note it sends with every request).
  It holds the account id, an end date (30 days) and a short fingerprint of the password hash.
  It is **signed** with `SESSION_SECRET`: nobody can change it or make a fake one without that
  secret. Page scripts cannot read it (`HttpOnly`), it only travels over HTTPS (`Secure`) and it
  is not sent along when another website tries to use our app (`SameSite=Lax`).
- Without a valid cookie every page goes to the login page and every API route answers
  "not logged in". Each API route checks the account again itself.
- *Log out* (avatar menu, top right) deletes the cookie.
- A password reset (below) makes old cookies useless at once: the student is logged out on all devices.

## Protection against guessing

- Wrong username and wrong password get **exactly the same message** and take the same time,
  so nobody can find out which usernames exist.
- **Limits on tries**: 10 wrong passwords per username **and network** in 15 minutes, 100 per
  network (a whole class) in 15 minutes; 10 sign-up tries per username and network and 10 per
  network per hour (`SIGNUP_PER_HOUR`). After that: "Too many tries, wait 15 minutes".
- Sign-up needs the class code, checked on the server. Wrong class codes count per network:
  30 a day, shared with the chat, the coach and the code check.
- **The class code must be long and random: at least 12 characters** (letters and digits, from a
  password generator; it looks like `k7Qp2Lx9Vr4m`, but make your own, never copy an example). A word-like code such as `schritte5` can
  be guessed; a 12-character random code cannot be guessed with 30 tries a day.
- Saves per account per day are capped (1500 answers, 100 new sessions, 200 goal saves), so a
  script cannot fill the free database.
- The daily chat limit (`DAILY_LIMIT`) counts per account, on every device.
- Passwords, fingerprints and secrets are never written to the logs.

**Where the counts live:** all these counters (tries, daily limit, saves) are kept in one small
table, `usage`, in the database: one row per day and counter, with a scrambled key (no password,
no username or network address in plain text). Every server copy on Vercel sees the same
numbers, and a deploy does not reset them. Rows older than two days are deleted. Without a
database (demo mode, local tests) they live in the server's memory as before.

**Known limits (fine for a class, worth knowing):** someone on the SAME network (e.g. the school
network) who types a classmate's username wrong 10 times can block that username on that network
for 15 minutes; from home it still works. There is no "forgot password" e-mail and no
"change password" screen yet – you reset passwords with the script below.

## Switch accounts on in Vercel (about 10 minutes)

1. **Vercel** → your project → **Storage** → **Create Database** → choose **Neon** (Serverless
   Postgres) → **Continue**. Keep the free plan, pick a region close to you (e.g. Frankfurt),
   accept → **Create**.
2. In the next step, **Connect** the database to the project (all environments: Development,
   Preview, Production). Vercel now adds `DATABASE_URL` and `POSTGRES_URL` for you – you don't
   copy anything.
3. Make the secret: a long random text, at least 40 characters. Easiest: let your password manager
   generate a 40+ character password, or run this in a terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   Don't reuse a password you use anywhere else.
4. Vercel → project → **Settings** → **Environment Variables** → **Add**: name `SESSION_SECRET`,
   value = the text from step 3, environments Production and Preview → **Save**.
5. **Deployments** → newest deployment → **⋯** → **Redeploy**.
6. Open the app: you see the login page. Choose *Create account*, enter a username, password
   and the class code. The table is created by itself on the first sign-up.

Keep `CLASS_CODE` set: it is what stops strangers from making accounts.
If you ever change `SESSION_SECRET`, everyone is logged out once (nothing else is lost).
To switch accounts off again: delete `SESSION_SECRET` and redeploy.

Good to know: previews and production use the same database, so test accounts you create on
a preview link also exist on the live app.

## Reset a student's password

You need the database address on your computer once:

1. Vercel → **Storage** → your database → **.env.local** tab → **Show secret** → copy the line
   `DATABASE_URL=…`.
2. Paste it into the file `.env.local` in the app folder
   (`02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring`). This file is never
   uploaded to GitHub. Treat the address like a password.
3. In a terminal in that folder: `node scripts/reset-password.mjs anna`
4. It prints a new random password once. Give it to the student. Their old password stops
   working and they are logged out everywhere.

`node scripts/db-migrate.mjs` creates the table on purpose (normally not needed; the app does it
by itself) and shows how many accounts exist.

## Testing on your computer without a database

In `.env.local`: `MOCK=1`, `AUTH_MEMORY=1`, `SESSION_SECRET=test`, `CLASS_CODE=…`, then
`npm run dev`. Accounts are kept in memory and are gone when you stop the server.
`AUTH_MEMORY` is ignored on Vercel, so it can never be used for the live app by mistake.
