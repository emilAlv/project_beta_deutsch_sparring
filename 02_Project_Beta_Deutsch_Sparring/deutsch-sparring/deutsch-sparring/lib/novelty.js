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
