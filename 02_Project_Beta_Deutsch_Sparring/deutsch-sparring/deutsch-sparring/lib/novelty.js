// Keeps model-generated exercises varied inside a session. This is deliberately
// conservative: exact repeats and strong template-level overlap are rejected, while
// ordinary topic vocabulary shared by two genuinely different situations is allowed.

export function normalizeExerciseLine(value) {
  return String(value || '')
    .toLocaleLowerCase('de')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeExerciseLine(value).split(' ').filter(Boolean));
}

export function exerciseSimilarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.min(left.size, right.size);
}

export function isNearDuplicateExercise(line, previous = []) {
  const candidate = normalizeExerciseLine(line);
  if (!candidate) return false;
  const candidateTokens = tokenSet(candidate);
  return previous.some((old) => {
    const prior = normalizeExerciseLine(old);
    if (!prior) return false;
    if (candidate === prior) return true;
    if (Math.min(candidate.length, prior.length) >= 20 && (candidate.includes(prior) || prior.includes(candidate))) return true;

    const priorTokens = tokenSet(prior);
    const shortest = Math.min(candidateTokens.size, priorTokens.size);
    if (shortest < 6) return false;
    let common = 0;
    for (const token of candidateTokens) if (priorTokens.has(token)) common += 1;
    return common >= 5 && common / shortest >= 0.62;
  });
}

export function hasMechanicalExerciseFormat(line) {
  const value = String(line || '');
  return value.includes('+') || /·\s*(?:nominativ|akkusativ|dativ|genitiv)\b/iu.test(value);
}

export const RETRY_MIN_MS_LEFT = 20_000; // a second AI call needs this much time before the route's deadline

export const NOVELTY_RETRY_NOTE = (rejected) => `

NOVELTY RETRY
The first draft below was rejected because it repeats an earlier exercise:
<rejected-draft>${rejected}</rejected-draft>
Keep the same target word, grammar point, level and question number, but create a genuinely different task. Change at least three of: setting, speaker, relationship, purpose, speech act, main verb and sentence structure. Do not reuse the rejected line. Return the complete JSON response again.`;

// Asks the AI once (`ask()` → text). Only a TRUE near-duplicate of an earlier exercise of this session
// earns ONE more call, and only when there is enough time left. A draft with a "mechanical" format
// (the prompt already forbids it) is accepted as it is. The retry never makes things worse: if it
// fails, or is again a duplicate, the usable first draft is kept – the student never sees a 'novelty' error.
//   ask(extraInstruction) → Promise<string>   parse(text) → draft object or null
//   openLine: the task the student is still working on (a repeat without feedback is fine: "same task, again")
export async function draftWithNoveltyRetry({ ask, parse, previous = [], openLine = '', deadline, minMsLeft = RETRY_MIN_MS_LEFT, now = Date.now, log = console.log }) {
  const text = await ask();
  const draft = parse(text);
  const line = draft?.exercise?.line;
  if (!line) return text;
  if (openLine && !draft.feedback && normalizeExerciseLine(line) === normalizeExerciseLine(openLine)) return text;
  if (!isNearDuplicateExercise(line, previous)) return text;
  const msLeft = deadline ? deadline - now() : Infinity;
  if (msLeft < minMsLeft) {
    log('tutor: near-duplicate exercise kept (not enough time left for a retry)');
    return text;
  }
  log('tutor: near-duplicate exercise, one retry'); // never the exercise text itself
  try {
    const retried = await ask(NOVELTY_RETRY_NOTE(String(line).slice(0, 300)));
    return parse(retried) ? retried : text;
  } catch {
    return text; // a failed retry must not lose the usable first draft
  }
}
