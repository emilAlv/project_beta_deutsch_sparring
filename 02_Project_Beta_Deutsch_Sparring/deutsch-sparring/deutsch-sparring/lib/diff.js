// Word-by-word comparison of the student's answer and the corrected sentence.
// The app does this itself (instead of trusting the model) to strike through the wrong
// words in "Your answer" and underline the fixed words in "Corrected".

const norm = (w) => w.toLowerCase().replace(/ß/g, 'ss').replace(/[.,!?;:„“”"«»()…]/g, '');

// Longest common subsequence of two word lists → which positions are shared.
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keepA = new Set();
  const keepB = new Set();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) {
      keepA.add(i++);
      keepB.add(j++);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return [keepA, keepB];
}

// Splits a sentence into segments [{ text, marked }]; neighbouring marked words merge into one
// segment (so "an die" is underlined as one piece). Punctuation never gets marked.
function segments(text, marked) {
  const tokens = String(text || '').split(/(\s+)/).filter((x) => x !== '');
  const out = [];
  let w = -1;
  tokens.forEach((tok, idx) => {
    const isSpace = /^\s+$/.test(tok);
    if (!isSpace) w += 1;
    let on = !isSpace && marked.has(w);
    if (isSpace) {
      // a space is marked only between two marked words
      const nextWordMarked = marked.has(w + 1) && idx + 1 < tokens.length;
      on = marked.has(w) && nextWordMarked;
    }
    if (on && !isSpace) {
      // keep trailing punctuation outside the mark: "Wand." → "Wand" + "."
      const m = tok.match(/^(.*?)([.,!?;:“”"»«…]*)$/);
      push(out, m[1], true);
      if (m[2]) push(out, m[2], false);
    } else push(out, tok, on);
  });
  return out;
}

function push(out, text, marked) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.marked === marked) last.text += text;
  else out.push({ text, marked });
}

const words = (s) => String(s || '').split(/\s+/).filter(Boolean);

// → { answer: segments (marked = wrong), corrected: segments (marked = fixed), removed: "der" }
export function compareAnswer(studentAnswer, corrected, changedWords = []) {
  const a = words(studentAnswer);
  const b = words(corrected);
  const [keepA, keepB] = lcs(a, b);
  const wrong = new Set(a.map((_, i) => i).filter((i) => !keepA.has(i) && norm(a[i])));
  let fixed = new Set(b.map((_, i) => i).filter((i) => !keepB.has(i) && norm(b[i])));

  // Same words (e.g. only capitals changed)? Fall back to the words the tutor named.
  if (!fixed.size && changedWords.length) {
    const wanted = changedWords.flatMap(words).map(norm);
    fixed = new Set(b.map((w, i) => (wanted.includes(norm(w)) ? i : -1)).filter((i) => i >= 0));
  }
  return {
    answer: segments(studentAnswer, wrong),
    corrected: segments(corrected, fixed),
    removed: a.filter((_, i) => wrong.has(i)).map((w) => w.replace(/[.,!?;:„“”"«»()…]/g, '')).join(' '),
    changes: Math.max(wrong.size, fixed.size),
  };
}
