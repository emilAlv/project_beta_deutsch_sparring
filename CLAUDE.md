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
3. Build only after he says "approved", one step at a time, on a feature branch – never on `main`.
   Commit and push each step and tell him where to see the Vercel preview.
   Open a pull request only after he OKs the preview.

## Rules
- Ask before adding any new package, database or login system.
- Never print, copy or commit an API key or password.
- Development stage only: no payments, marketing or go-to-market work unless he asks.
