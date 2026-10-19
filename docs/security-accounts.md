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
| `settings` | empty for now; Task 8 keeps progress here |

**What is not stored:** the password itself, e-mail addresses, real names, IP addresses,
the chat. The chat, the last 5 sessions and the streak stay in the student's browser, as before
(now kept separately per username, so two students on one computer don't see each other's work).

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
- **Limits on tries** (like the class-code tries): 10 wrong passwords per username in
  15 minutes, 100 per network (a whole class) in 15 minutes; 10 sign-up tries per username and
  60 per network per hour. After that: "Too many tries, wait 15 minutes".
- Sign-up needs the class code, checked on the server.
- The daily chat limit (`DAILY_LIMIT`) counts per account, on every device.
- Passwords, fingerprints and secrets are never written to the logs.

**Known limits (fine for a class, worth knowing):** the try counters live in the server's
memory, like the class-code counters. Vercel sometimes runs several copies of the server or
restarts it, so the limits are approximate. A classmate who types someone else's username wrong
10 times can block that username for 15 minutes. There is no "forgot password" e-mail and no
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
