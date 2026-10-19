// The browser's side of the coach: the saved messages and asking /api/coach.
//   logged in    messages live in the database (/api/coach/messages); the server works out the numbers itself
//   accounts off messages live in localStorage (lib/storage.js); the browser also sends a compact copy of its
//                goals, word scores and answer log (like the Home page) because nothing is stored on the server
import { usesServer, loadCoachLocal, saveCoachLocal, progressSaved } from './storage';
import { localNumbers } from './home-client';
import { cleanStoredMessages, turnsForModel } from './coach';

// → the saved messages (oldest first)
export async function loadCoachMessages() {
  if (!usesServer()) return cleanStoredMessages(loadCoachLocal());
  try {
    const res = await fetch('/api/coach/messages', { cache: 'no-store' });
    return res.ok ? cleanStoredMessages((await res.json()).messages) : [];
  } catch {
    return [];
  }
}

export async function saveCoachMessages(messages) {
  const clean = cleanStoredMessages(messages);
  if (!usesServer()) {
    saveCoachLocal(clean);
    return;
  }
  try {
    await fetch('/api/coach/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: clean }),
    });
  } catch {}
}

// kind: 'chat' (the last message is the student's) | 'greeting' (the coach starts)
// → { coach } or { code } (see coachErr_* in lib/ui-text.js)
export async function askCoach({ messages, kind, name, classCode, clientId, today }) {
  try {
    if (usesServer()) await progressSaved(); // the answers just given are on the server first
    const body = {
      kind, today, clientId, name, classCode,
      messages: turnsForModel(messages).map((m) => ({ role: m.role === 'model' ? 'coach' : 'student', text: m.text })),
      ...(usesServer() ? {} : localNumbers()),
    };
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.coach) return { coach: data.coach };
    return { code: data.code || (res.status === 401 ? 'auth' : 'server'), detail: data.detail || (data.code ? '' : `HTTP ${res.status}`) };
  } catch {
    return { code: 'network' };
  }
}
