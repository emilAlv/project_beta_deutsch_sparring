// The browser's side of the saved progress (see lib/progress.js on the server): small helpers to
// send things to /api/progress/*. Saves go out one after the other (a queue), a failed save is
// tried again a couple of times, and a failure never breaks the app.

let chain = Promise.resolve();

// → the answer as JSON, or null (failed / refused)
async function attempt(path, body) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) return await res.json().catch(() => ({ ok: true }));
      if (res.status >= 400 && res.status < 500) return null; // a refusal will not get better by retrying
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

// Fire and forget, but in order.
export function queuePost(path, body) {
  chain = chain.then(() => attempt(path, body)).catch(() => {});
}

// Resolves when everything queued so far has been sent (the next tutor request waits for this,
// so the word picker sees the latest scores).
export const whenSaved = () => chain;

export async function getJson(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const postNow = (path, body) => attempt(path, body);
