# Working with Emilio

Emilio owns this project (wort., a German practice app; the app lives in
`02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring`, see its README.md).
He is not a developer, but he is quick and wants to understand what happens.

## How to explain things
- Plain English, no unexplained jargon. When a technical word is needed, say what it is
  in one sentence and why it matters to *him* (cost, speed, safety, what he will see).
- Use everyday comparisons, not simplifications that are wrong.
  Example: "A *package* is ready-made code written by someone else that we download
  instead of writing it ourselves – like buying a lock instead of building one. Each one
  saves work but is one more thing to trust and keep up to date, so I ask first."
- Lead with the answer or decision, then the reason. Short sentences, short lists.
- For every decision he must make: the options, what each means for him, and your
  recommendation.

## How we work
1. Read the code first, then ask all questions at once (short, with a recommendation).
2. Plan in numbered steps: what changes, why, what he will see, rough effort; mark his decisions.
3. Build only after he says "approved" (or answers the decisions), on a feature branch – never directly on `main`.
4. Emilio has authorised pushing and merging to `main` once the checks below pass; he then tests on the live app
   (deutsch-sparring.vercel.app, live about 2 minutes after a merge). Tell him what to try there.
5. Write down every decision he makes in `docs/review-2026-10-20.md` (or `docs/revamp-tasks.md` for word scores),
   so later sessions and agents follow it without asking again.

## The main session is the orchestrator
The main session plans, delegates, checks and merges. Builders are subagents (`Agent` tool, `isolation: "worktree"`,
run in the background). One builder at a time, unless two tasks touch completely different files
(`lib/schema.mjs`, `lib/prompt.js`, `lib/reply.js`, `lib/ui-text.js` and `app/globals.css` are shared by most tasks).
Small, contained fixes (a few files, clear cause) the main session does itself – that is cheaper than an agent.

**Pick the cheapest model that does the job well** (Emilio wants credits used carefully):
- `sonnet` – the default for building features and fixes.
- `opus` – only for security, accounts, limits, money (Gemini cost) or tricky data migrations.
- `haiku` – mechanical work: docs, settings walkthroughs, simple renames.

**Every builder prompt contains:**
- the branch: `git fetch origin main && git checkout -B <review/short-name> origin/main`;
- where the spec is (task number in `docs/review-2026-10-20.md`, section names) and the decisions already made
  ("decided by the owner, do not ask");
- the rules below (no new package, no secrets, parameterised SQL only) and "follow Common rules in docs/revamp-tasks.md";
- the checks: `npm test` and `npm run build` in the app folder; a `scripts/check-*.mjs` for new logic
  (picked up by `scripts/run-checks.mjs`); a MOCK=1 click-through with Playwright screenshots saved as `<prefix>-*.png`
  at the repo root (not committed); SQL run twice on the local PostgreSQL (see "Tools" below);
- "commit with the session's attribution lines, push the branch, do NOT open a PR, report briefly: files, what Emilio
  sees, what was tested and what was not, screenshots, anything skipped".

**Before merging, the main session itself:**
1. reads the risky parts of the diff (login, limits, SQL, data migrations, anything the AI is told to do with
   student data) and looks at the screenshots;
2. merges `origin/main` into the branch, runs `npm test` and `npm run build` again;
3. moves the screenshots to the scratchpad, opens the PR (title + what changed + checks) and merges it;
4. reports to Emilio: what is live, what he will see, what was tested and NOT tested (e.g. no real Gemini call),
   the PR link, and anything still open on his side.

**Trello board** "L Lab Active Projects" (https://trello.com/b/duySWPU7/l-lab-active-projects): the German Tutor cards
sit below the orange "GERMAN TUTOR" separator card in every list (never above it, never touch the other projects' cards).
Keep it current: a task moves Prioritized → In Progress when a builder starts → Under Review when it is live (with what
Emilio should try and the PR number) → Done after he has tested it. New requests from Emilio become cards; things only he
can do go to Challenges & Roadblocks, open decisions to Questions. Card colours are covers, which the connection cannot
set – Emilio sets them by hand.

**Requests that arrive while an agent works:** say in one line that it is noted, finish the current check, then
handle it – several small requests may go into one PR.

## Tools in this environment
- App folder: `02_Project_Beta_Deutsch_Sparring/deutsch-sparring/deutsch-sparring` (Next.js 16 – read
  `node_modules/next/dist/docs/` before unfamiliar APIs). Demo mode without a Gemini key: `MOCK=1 npx next dev -p <port>`.
- Playwright: `/opt/node22/lib/node_modules/playwright`, Chromium is preinstalled (never run `playwright install`).
- Stop a dev server with `pkill -f "next dev -p <port>"` as its own command (combined with others it ends the shell).
- Local PostgreSQL 16 for testing SQL: binaries in `/usr/lib/postgresql/16/bin`, a cluster under `/var/tmp`, run as user
  `nobody` (`su nobody -s /bin/bash -c "pg_ctl ..."`). The Neon driver cannot talk to it: test SQL with `psql`.
- Database changes are numbered steps in `lib/schema.mjs` (see the app README, "how to add a column").

## Rules
- Ask before adding any new package, database or login system.
- Never print, copy or commit an API key or password.
- Development stage only: no payments, marketing or go-to-market work unless he asks.
- Answer in the language he writes in (English or Spanish). The app itself is English + German only – never Spanish.
- Settings in Vercel/Neon (environment variables, database branches) are his to change: give him click-by-click
  steps and never ask him to paste a secret into the chat.
