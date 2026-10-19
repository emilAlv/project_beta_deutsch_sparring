'use client';

// The whole app is this one page, in stages:
//   stage 'name'     → the tutor asks for the name in the chat (no AI; only without accounts)
//   stage 'code'     → asks for the class code, checked by /api/code (no AI; only without accounts)
//   stage 'setup'    → the setup screen: type, topic, level, difficulty, questions, word source,
//                      direction, grammar per word, Swiss/German Hochdeutsch (components/SetupScreen.js)
//   stage 'practice' → the Sparring: questions with the AI tutor (/api/chat), a slim ribbon on top
//
// The settings chosen on the setup screen are FIXED for the whole session (session.settings).
// The APP owns the session: it counts the questions (10–50), decides when the session is over
// and stops when the student wants to stop. The tutor only writes the content.
// Short commands ("stop", "skip", "explain the rule" …) are understood by the app itself
// (lib/intents.js); asking to change a setting ("harder", "20 questions", another topic …) gets a
// short "end the session to change this". Everything else goes to the tutor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Chat from '../components/Chat';
import SessionPanel from '../components/SessionPanel';
import SetupScreen from '../components/SetupScreen';
import SessionRibbon from '../components/SessionRibbon';
import { t } from '../lib/ui-text';
import { detectIntent, detectTopicWish, extractName } from '../lib/intents';
import { DEFAULT_SETUP, sanitizeSetup, setupFrom, withSentences } from '../lib/session-settings';
import { score, summaryOf } from '../lib/stats';
import {
  loadProfile, saveProfile, loadPrefs, savePrefs, loadChat, saveChat, loadHistory,
  recordSession, recentMistakes, currentStreak, loadScores, recordWordAnswer, setStorageAccount,
  initProgress, progressSaved, startSessionRecord,
} from '../lib/storage';

const VIEWS = ['glance', 'progress', 'grammar'];
// prefs: the panel view + the last setup form (it prefills the setup screen)
const DEFAULT_PREFS = { view: 'glance', setup: DEFAULT_SETUP };
const CHAT_VERSION = 3; // saved conversations from older versions are not restored (v3: sessions carry their settings)
const RESUME_GREETING_MIN = 30; // …with a "welcome back" line if the break was longer than this

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const isVocab = (s) => s.topicType === 'Wortschatz';

// settings = the fixed settings from the setup screen (sessionSettings in lib/session-settings.js)
function newSession(topic = null, settings = null) {
  return {
    id: uid(),
    topicId: topic?.id || null,
    topicName: settings?.topicLabel || topic?.short || null,
    topicType: topic ? (topic.id === 'free' ? 'free' : topic.type) : null,
    settings, // { kind, topicId, topicLabel, level, difficulty, questions, source, direction, grammar, variant }
    total: settings?.questions || DEFAULT_SETUP.questions,
    answers: [], // { n, correct, skipped, studentAnswer, corrected, changedWords, explanation, rule, errorType, question (the task text), qType (exercise type, e.g. 'flashcard') }
    exercise: null, // the open question (its number is always answers.length + 1)
    lastType: null,
    grammarFocus: null,
    wordIds: [], // vocabulary: the words picked for this session (by the server, from the scores)
    words: [], // … with their type: [{ id, type }]
    started: false, // the first question has arrived
    finished: false,
    endedEarly: false,
  };
}

const EMPTY_CONVO = {
  stage: 'loading',
  messages: [],
  session: newSession(),
  modelOptions: [], // situational options from the tutor (e.g. answer choices on Easy)
  historyFrom: 0, // the AI only sees messages from this moment on
};

// Older versions kept level, difficulty, questions … at the top of the prefs: they prefill the first setup.
function sanitizePrefs(p) {
  return {
    view: VIEWS.includes(p.view) ? p.view : DEFAULT_PREFS.view,
    setup: sanitizeSetup(p.setup, p),
  };
}

class UiError extends Error {
  constructor(message, retry = true) {
    super(message);
    this.retry = retry;
  }
}

async function postJson(url, body, timeoutMs, signal) {
  // own timeout + the caller's cancel signal (AbortSignal.any is not in every browser yet)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onCancel = () => controller.abort(new DOMException('Cancelled', 'AbortError'));
  signal?.addEventListener('abort', onCancel);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw controller.signal.reason?.name === 'TimeoutError' ? controller.signal.reason : e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
  // Vercel can answer with an HTML error page (e.g. on a timeout): never assume JSON
  const raw = await res.text();
  try {
    return { res, data: JSON.parse(raw) };
  } catch {
    throw new UiError(t('errorUnexpected', { status: res.status }));
  }
}

export default function Home() {
  const [convo, setConvo] = useState(EMPTY_CONVO);
  const convoRef = useRef(EMPTY_CONVO);
  const update = useCallback((fn) => {
    convoRef.current = fn(convoRef.current);
    setConvo(convoRef.current);
  }, []);
  const updateSession = useCallback((fn) => update((c) => ({ ...c, session: fn(c.session) })), [update]);

  const [prefs, setPrefsState] = useState(DEFAULT_PREFS);
  const prefsRef = useRef(DEFAULT_PREFS);
  const prefsLoaded = useRef(false);
  const setPrefs = useCallback((patch) => {
    prefsRef.current = { ...prefsRef.current, ...patch };
    setPrefsState(prefsRef.current);
  }, []);

  const [profile, setProfileState] = useState({});
  const profileRef = useRef({});
  const setProfile = (p) => {
    profileRef.current = p;
    setProfileState(p);
    saveProfile(p);
  };

  const [history, setHistory] = useState({ sessions: [], streak: {} });
  const historyRef = useRef(history);
  historyRef.current = history;

  const [topics, setTopics] = useState([]);
  const topicsRef = useRef([]);
  const needsCodeRef = useRef(false);
  // with accounts: { username } of the logged-in student (their name in the app), else null
  const [account, setAccount] = useState(null);
  const topicById = (id) => topicsRef.current.find((x) => x.id === id)
    || (id === 'free' ? { id: 'free', short: 'Freies Üben', type: 'Gemischt' } : null);

  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (b) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null); // { text, retry }
  const [setupError, setSetupError] = useState(null);
  const requestRef = useRef(null); // the AI request in flight: { controller, cancelled }
  const [waiting, setWaiting] = useState(false); // an AI request is in flight (it can be cancelled)
  const inputRef = useRef(null);

  // ---------- small helpers to add things to the chat ----------
  const add = useCallback((msg) => {
    const m = { id: uid(), at: Date.now(), ...msg };
    update((c) => ({ ...c, messages: [...c.messages, m] }));
    return m;
  }, [update]);

  // a short line like "View: Progress & gaps"; several changes in a row only keep the last one
  const addSystem = useCallback((kind, text) => {
    update((c) => {
      const last = c.messages[c.messages.length - 1];
      if (last?.role === 'system' && last.kind === kind) {
        return { ...c, messages: [...c.messages.slice(0, -1), { ...last, text, at: Date.now() }] };
      }
      return { ...c, messages: [...c.messages, { id: uid(), at: Date.now(), role: 'system', kind, text }] };
    });
  }, [update]);

  // local tutor lines appear after a tiny pause, like a real reply
  const tutorSay = useCallback((lines, extra = {}) => new Promise((resolve) => {
    setBusy(true);
    setTimeout(() => {
      [].concat(lines).filter(Boolean).forEach((text, i, all) => add({ role: 'tutor', text, ...(i === all.length - 1 ? extra : {}) }));
      setBusy(false);
      resolve();
    }, 450);
  }), [add]);

  // ---------- start: read what the browser remembers ----------
  useEffect(() => {
    let cancelled = false;
    let p = loadProfile();
    if (!p.clientId) {
      // a random id for this browser: the daily limit counts per student, not per school network
      p = { ...p, clientId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` };
      saveProfile(p);
    }
    profileRef.current = p;
    setProfileState(p);
    if (!prefsLoaded.current) setPrefs(sanitizePrefs(loadPrefs()));
    prefsLoaded.current = true;

    let progressReady = null; // logged in: history + scores come from the server
    fetch('/api/topics')
      .then((r) => {
        if (r.status === 401) {
          toLogin();
          return null;
        }
        return r.json();
      })
      .catch(() => ({}))
      .then((d) => {
        if (cancelled || !d) return;
        topicsRef.current = Array.isArray(d.topics) ? d.topics : [];
        needsCodeRef.current = Boolean(d.needsCode);
        setTopics(topicsRef.current);
        const username = typeof d.account?.username === 'string' ? d.account.username : '';
        if (username) {
          // logged in: the username is the name, no name / class-code questions in the chat
          setStorageAccount(username);
          progressReady = initProgress();
          setAccount({ username });
          p = { ...p, name: username };
          profileRef.current = p;
          setProfileState(p);
        }
        setHistory(loadHistory());
        begin(p);
        progressReady?.then(() => { if (!cancelled) setHistory(loadHistory()); });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // not (or no longer) logged in: to the login page
  function toLogin() {
    window.location.replace('/login');
  }

  async function logOut() {
    closeSession(false);
    dropRequest();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    toLogin();
  }

  function begin(p) {
    const saved = loadChat();
    const codeOk = !needsCodeRef.current || p.classCode;
    const age = Date.now() - (saved?.savedAt || 0);
    const sameDay = saved && new Date(saved.savedAt).toDateString() === new Date().toDateString();
    const longBreak = age > RESUME_GREETING_MIN * 60_000;
    if (
      p.name && codeOk && saved?.version === CHAT_VERSION && saved.messages?.length && sameDay
      && !(saved.session?.finished && longBreak) // a finished session is not brought back after a break
      && (saved.stage === 'setup' || saved.session?.settings) // a running session always has its settings
    ) {
      const restored = { ...EMPTY_CONVO, ...saved, session: { ...newSession(), ...saved.session } };
      if (restored.stage !== 'practice') restored.stage = 'setup';
      convoRef.current = restored;
      setConvo(restored);
      const last = restored.messages[restored.messages.length - 1];
      if (restored.stage !== 'practice') return;
      if (last?.role === 'user' && last.ai) {
        // the page was closed while the tutor was answering: offer to send it again
        setError({ text: t('errorInterrupted'), retry: () => { setError(null); askTutor(last.text); } });
      } else if (longBreak && restored.session.started && !restored.session.finished) {
        tutorSay(t('tutorResume', { name: p.name }));
      }
      return;
    }
    const start = { ...EMPTY_CONVO, session: newSession(), historyFrom: Date.now() };
    if (!p.name) {
      update(() => ({ ...start, stage: 'name' }));
      tutorSay(t('tutorAskName'));
    } else if (!codeOk) {
      update(() => ({ ...start, stage: 'code' }));
      tutorSay(t('tutorAskCode', { name: p.name }));
    } else {
      update(() => ({ ...start, stage: 'setup' })); // name known (or logged in): straight to the setup screen
    }
  }

  // ---------- remember things ----------
  useEffect(() => {
    if (convo.stage === 'setup' || convo.stage === 'practice') {
      saveChat({ ...convo, version: CHAT_VERSION, messages: convo.messages.slice(-80), savedAt: Date.now() });
    }
  }, [convo]);

  useEffect(() => {
    if (prefs === DEFAULT_PREFS) return; // first render: nothing loaded yet
    savePrefs(prefs);
  }, [prefs]);

  // the "still thinking" line for slow answers
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(timer);
  }, [busy]);

  // ---------- the session record (last 5 sessions + streak) ----------
  function remember(s) {
    if (!s.answers.length) return;
    const sc = score(s.answers);
    setHistory(recordSession({
      id: s.id,
      topicId: s.topicId,
      topicName: s.topicName || '',
      level: s.settings?.level,
      difficulty: s.settings?.difficulty,
      settings: s.settings, // so the session can be repeated with the same settings later
      ...sc,
      total: s.total,
      endedEarly: s.endedEarly,
      finished: Boolean(s.finished),
      updatedAt: Date.now(),
      mistakes: s.answers.filter((a) => !a.correct && !a.skipped).slice(-5)
        .map(({ studentAnswer, corrected, rule }) => ({ studentAnswer, corrected, rule })),
    }));
  }

  // closing a running session because the student starts another one (or logs out)
  function closeSession() {
    const s = convoRef.current.session;
    if (!s.started || s.finished) return;
    remember({ ...s, finished: true, endedEarly: true, exercise: null });
  }

  // ---------- the panel view (the only thing the chat may still change) ----------
  function changeView(view) {
    if (!VIEWS.includes(view)) return;
    if (view !== prefsRef.current.view) addSystem('view', t('sysView', { value: t(`view_${view}`) }));
    setPrefs({ view });
  }

  // settings are fixed during a session: a short answer instead of a change
  function settingsFixed() {
    if (convoRef.current.session.finished) tutorSay(t('tutorSettingsAfter', { again: t('summaryAgain'), new: t('summaryNew') }));
    else tutorSay(t('tutorSettingsFixed', { end: t('ribbonEnd') }));
  }

  // ---------- ending a session (no AI): summary card in the chat ----------
  function finishSession({ early = true, line, total } = {}) {
    const s = convoRef.current.session;
    if (!s.started) {
      tutorSay(t('tutorStopIdle'));
      return;
    }
    if (s.finished) {
      tutorSay(t('tutorAlreadyFinished', { again: t('summaryAgain') }));
      return;
    }
    const done = { ...s, total: total || s.total, finished: true, endedEarly: early && s.answers.length < s.total, exercise: null };
    update((c) => ({ ...c, session: done, modelOptions: [] }));
    remember(done);
    tutorSay(line || t('tutorStopped', { name: profileRef.current.name }), { summary: summaryOf(done) });
  }

  // ---------- onboarding (no AI; only without accounts) ----------
  function onName(text) {
    add({ role: 'user', text });
    const name = extractName(text);
    if (!name) {
      tutorSay(t('tutorNameAgain'));
      return;
    }
    setProfile({ ...profileRef.current, name });
    if (needsCodeRef.current && !profileRef.current.classCode) {
      update((c) => ({ ...c, stage: 'code' }));
      tutorSay(t('tutorAskCode', { name }));
    } else {
      update((c) => ({ ...c, stage: 'setup', historyFrom: Date.now() }));
    }
  }

  async function onCode(text) {
    add({ role: 'user', text, masked: true });
    setBusy(true);
    let reply = null;
    try {
      const { data } = await postJson('/api/code', { classCode: text, clientId: profileRef.current.clientId }, 15000);
      if (data.ok) {
        setProfile({ ...profileRef.current, classCode: text });
        // a session was running (the code changed meanwhile): back to it; otherwise to the setup screen
        const resume = Boolean(convoRef.current.session.topicId);
        update((c) => ({ ...c, stage: resume ? 'practice' : 'setup', historyFrom: resume ? c.historyFrom : Date.now() }));
        if (resume) reply = t('tutorCodeThanks');
      } else {
        reply = data.error || t('tutorBadCode');
      }
    } catch {
      reply = t('tutorCodeError');
    }
    setBusy(false);
    if (reply) tutorSay(reply);
  }

  // ---------- setup screen and starting a session ----------
  // The setup screen opens prefilled: the last setup, or the given session's settings. A running
  // session stays as it is until a new one starts, so "Cancel" goes back to it.
  function openSetup(fromSettings = null) {
    dropRequest();
    setError(null);
    setSetupError(null);
    if (fromSettings) setPrefs({ setup: setupFrom(fromSettings, topicsRef.current, prefsRef.current.setup) });
    update((c) => ({ ...c, stage: 'setup' }));
  }

  // back from the setup screen to the session (only offered when there is one)
  function cancelSetup() {
    setSetupError(null);
    update((c) => ({ ...c, stage: 'practice' }));
  }

  // "Start session": a new session with these fixed settings, a fresh conversation, question 1 from the tutor
  function startSession(settings, form = null) {
    const topic = topicById(settings?.topicId);
    if (!topic) {
      setSetupError(t('setupTopicMissing'));
      update((c) => ({ ...c, stage: 'setup' }));
      return;
    }
    if (form) setPrefs({ setup: form });
    closeSession();
    dropRequest();
    setError(null);
    setSetupError(null);
    const s = newSession(topic, settings);
    startSessionRecord(s);
    const start = { id: uid(), at: Date.now(), role: 'user', text: t('tutorStartTopic', { topic: s.topicName || topic.short }), hidden: true, ai: true };
    const fresh = { ...EMPTY_CONVO, stage: 'practice', session: s, messages: [start], historyFrom: start.at };
    convoRef.current = fresh;
    setConvo(fresh);
    askTutor(start.text, { msg: start });
  }

  // "Same settings again"
  function again() {
    const settings = convoRef.current.session.settings || historyRef.current.sessions[0]?.settings;
    if (settings) startSession(settings);
    else openSetup();
  }

  // "End session" (ribbon or chat): the summary – or, with nothing answered yet, back to the setup screen
  function endSession() {
    if (requestRef.current) dropRequest();
    const s = convoRef.current.session;
    if (s.finished) return;
    if (!s.answers.length) {
      openSetup(s.settings);
      return;
    }
    finishSession({ early: true });
  }

  function changeName() {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmChangeName'))) return;
    closeSession();
    dropRequest();
    setProfile({ ...profileRef.current, name: '' });
    saveChat(null);
    const fresh = { ...EMPTY_CONVO, stage: 'name', session: newSession(), historyFrom: Date.now() };
    convoRef.current = fresh;
    setConvo(fresh);
    setError(null);
    tutorSay(t('tutorAskName'));
  }

  // the open question is skipped: counted at once, the tutor gives the solution + the next one
  function skipOpen() {
    const open = convoRef.current.session;
    scoreAnswer(open, open.exercise, { skipped: true }, { n: open.answers.length + 1, question: open.exercise?.line || '' });
    updateSession((s) => ({
      ...s,
      answers: [...s.answers, { n: s.answers.length + 1, skipped: true, correct: false, studentAnswer: '', corrected: '', changedWords: [], explanation: '', rule: '', skippedLine: s.exercise?.line || '', question: s.exercise?.line || '', qType: s.exercise?.type || null, wordId: s.exercise?.wordId || '', task: s.exercise?.task || null }],
      exercise: null,
    }));
  }

  // Word scores: the APP updates them (lib/scores.js), never the model. Called once per answer.
  // record = the answer's details, saved with it in the account (lib/storage.js)
  function scoreAnswer(session, exercise, { correct = false, errorType = null, skipped = false } = {}, record = null) {
    const type = session.words?.find((w) => w.id === exercise?.wordId)?.type;
    recordWordAnswer(exercise?.wordId || '', {
      task: exercise?.task || 'flashcard',
      correct, errorType, skipped,
      hinted: Boolean(exercise?.hinted) || session.settings?.difficulty === 'easy', // a hint, or "Leicht" (multiple choice)
      hasG: type !== 'phrase',
    }, record && { ...record, sessionId: session.id });
  }

  // stop waiting for the tutor (button in the input, or "Stopp" while it is writing)
  function cancelRequest() {
    const r = requestRef.current;
    if (!r) return;
    r.cancelled = true;
    r.controller.abort();
  }

  // a pending answer that no longer matters (new session, session ended …)
  function dropRequest() {
    if (!requestRef.current) return;
    cancelRequest();
    setBusy(false);
  }

  function stopWaiting() {
    if (!requestRef.current) return;
    dropRequest();
    setBusy(false);
    addSystem('cancel', t('sysCancelled'));
  }

  // ---------- the router: every message (typed or tapped) comes through here ----------
  function handleSend(raw) {
    const text = String(raw || '').trim();
    if (!text) return false;
    if (busyRef.current) {
      // while the tutor is writing, only "stop" gets through: it cancels the request and ends the session
      if (!(requestRef.current && detectIntent(text, { open: true })?.type === 'stop')) return false;
      cancelRequest();
      setBusy(false);
    }
    setError(null);
    const c = convoRef.current;
    if (c.stage === 'loading' || c.stage === 'setup') return false;
    if (c.stage === 'name') return onName(text);
    if (c.stage === 'code') return onCode(text);

    const msg = add({ role: 'user', text });
    const s = c.session;
    const running = s.started && !s.finished;
    const open = running && Boolean(s.exercise);
    const intent = detectIntent(text, { open });

    // a hint on a word question: the answer then counts less (+1, no streak)
    if (open && s.exercise?.wordId && /^(tipp|hint|give me a hint|gib mir einen tipp|einen tipp)\b/i.test(text)) {
      updateSession((x) => ({ ...x, exercise: x.exercise ? { ...x.exercise, hinted: true } : x.exercise }));
    }

    switch (intent?.type) {
      case 'stop':
        if (!s.finished && !s.answers.length) {
          endSession(); // nothing answered yet: no score to show, back to the setup screen
          return true;
        }
        finishSession({ early: true });
        return true;
      case 'again':
        if (running) break; // "nochmal" during a question = "say it again": the tutor answers
        again();
        return true;
      case 'restart':
        openSetup(s.settings);
        return true;
      case 'view':
        changeView(intent.view);
        return true;
      case 'fixed':
        settingsFixed();
        return true;
      case 'rule':
        changeView('grammar');
        askTutor(text, { msg });
        return true;
      case 'skip':
        if (open) skipOpen();
        askTutor(text, { msg });
        return true;
      default:
    }

    // another topic in the student's own words ("Können wir Wohnen üben?"): the topic is fixed
    if (detectTopicWish(text, topicsRef.current, { running: true })) {
      settingsFixed();
      return true;
    }
    askTutor(text, { msg });
    return true;
  }

  // ---------- talking to the AI tutor ----------
  function aiHistory(c) {
    return c.messages
      .filter((m) => m.at >= c.historyFrom && ((m.role === 'user' && m.ai) || (m.role === 'tutor' && m.modelText)))
      .map((m) => (m.role === 'user' ? { role: 'user', text: m.text } : { role: 'assistant', text: m.modelText }))
      .slice(-40);
  }

  async function askTutor(text, { msg } = {}) {
    // mark the student's message as part of the AI conversation
    if (msg && !msg.ai) update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === msg.id ? { ...m, ai: true } : m)) }));

    const c = convoRef.current;
    const s = c.session;
    const st = s.settings || {};
    const sent = { topicId: s.topicId, sessionId: s.id, text };
    const lastSkipped = s.answers[s.answers.length - 1]?.skipped ? s.answers[s.answers.length - 1] : null;
    const body = {
      name: profileRef.current.name,
      classCode: profileRef.current.classCode,
      // the session's fixed settings (setup screen). grammar = the grammar points per word;
      // variant = 'ch' | 'de' (Swiss / German Hochdeutsch)
      settings: {
        level: st.level,
        difficulty: st.difficulty,
        direction: st.direction,
        sentences: withSentences(st),
        grammar: st.grammar || [],
        variant: st.variant || 'ch',
      },
      session: {
        topicId: s.topicId,
        total: s.total,
        openNumber: s.exercise && !s.finished ? s.answers.length + 1 : 0,
        openLine: s.exercise?.line || '',
        openDirection: s.exercise?.direction || null,
        openWordId: s.exercise?.wordId || '',
        openTask: s.exercise?.task || null,
        finished: s.finished,
        skippedNumber: lastSkipped && !s.exercise ? lastSkipped.n : 0,
        skippedLine: lastSkipped && !s.exercise ? lastSkipped.skippedLine : '',
        skippedWordId: lastSkipped && !s.exercise ? lastSkipped.wordId || '' : '',
        skippedTask: lastSkipped && !s.exercise ? lastSkipped.task || null : null,
      },
      // vocabulary: the words picked at the start stay the same; without them the server picks, using our scores
      wordIds: s.wordIds,
      ...(isVocab(s) && !s.wordIds?.length ? { scores: loadScores(), source: st.source || 'both' } : {}),
      progress: score(s.answers),
      // what was already asked in this session, so 20–50 questions don't repeat
      asked: s.answers.map((a) => a.line || a.skippedLine).filter(Boolean).slice(-50),
      mistakes: recentMistakes(s.answers, historyRef.current.sessions),
      clientId: profileRef.current.clientId,
      notes: [], // (nothing changes during a session any more)
      messages: aiHistory(c),
    };

    await progressSaved(); // logged in: the word picker reads the scores saved so far
    setBusy(true);
    setWaiting(true);
    const request = { controller: new AbortController(), cancelled: false };
    requestRef.current = request;
    let then = null;
    try {
      const { res, data } = await postJson('/api/chat', body, 70000, request.controller.signal);
      if (request.cancelled) return;
      // the student started something else meanwhile (new session): drop this answer
      if (convoRef.current.session.id !== sent.sessionId) return;
      if (!res.ok || data.error) {
        if (res.status === 401 && data.code === 'auth') {
          toLogin();
          return;
        }
        if (data.code === 'bad_code') {
          setProfile({ ...profileRef.current, classCode: '' });
          update((x) => ({ ...x, stage: 'code' }));
          setBusy(false);
          tutorSay(t('tutorCodeChanged'));
          return;
        }
        throw new UiError(data.error || t('errorUnexpected', { status: res.status }), data.code !== 'limit');
      }
      if (!data.reply) {
        // not valid JSON: show the text, keep the session and the panel as they are
        add({ role: 'tutor', text: data.text || '…', modelText: data.text || '' });
        if (Array.isArray(data.words) && data.words.length) updateSession((x) => (x.wordIds?.length ? x : { ...x, wordIds: data.words.map((w) => w.id), words: data.words }));
      } else {
        then = applyReply(data.reply, data.modelText, sent, data.words);
      }
    } catch (e) {
      if (request.cancelled) return;
      // the student started something else meanwhile (new session): no error message
      if (convoRef.current.session.id !== sent.sessionId) return;
      const text2 = e instanceof UiError ? e.message : e?.name === 'TimeoutError' ? t('errorTimeout') : t('errorNetwork');
      const canRetry = !(e instanceof UiError) || e.retry;
      setError({ text: text2, retry: canRetry ? () => { setError(null); askTutor(text); } : null });
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setWaiting(false);
        if (!request.cancelled) setBusy(false);
      }
    }
    if (then) then();
  }

  // The tutor's answer → chat message + session. Returns a follow-up action (or null).
  // The settings are fixed: a topic, level or difficulty the tutor sends back is ignored.
  function applyReply(reply, modelText, sent, pickedWords) {
    const rs = reply.session;
    const before = convoRef.current.session;
    const s = { ...before };

    // the words the server picked for this vocabulary session: kept for the whole session
    if (Array.isArray(pickedWords) && pickedWords.length && !s.wordIds?.length && s.topicId && !s.finished) {
      s.wordIds = pickedWords.map((w) => w.id);
      s.words = pickedWords;
    }

    // 1) feedback for the open question. (Also counted if the tutor asked its question only in
    //    the text, without a question card – but never twice for a question that was skipped.)
    let feedback = null;
    const lastAnswer = s.answers[s.answers.length - 1];
    const forSkipped = lastAnswer?.skipped && !s.exercise && reply.feedback?.forNumber === lastAnswer.n;
    if (reply.feedback && s.topicId && !s.finished && !forSkipped) {
      feedback = { ...reply.feedback, kind: s.exercise?.type || null }; // kind: the type of question it answers
      // word scores: updated by the app from the tutor's verdict (correct, errorType), a hint and "Leicht"
      scoreAnswer(s, s.exercise, { correct: feedback.correct, errorType: feedback.errorType }, {
        n: s.answers.length + 1, question: s.exercise?.line || '', studentAnswer: feedback.studentAnswer, corrected: feedback.corrected, rule: feedback.rule,
      });
      s.answers = [...s.answers, { ...feedback, n: s.answers.length + 1, skipped: false, line: s.exercise?.line || '', question: s.exercise?.line || '', qType: s.exercise?.type || null, wordId: s.exercise?.wordId || '', task: s.exercise?.task || null }];
      s.exercise = null;
      s.started = true;
    }
    // 2) the app ends the session: all questions done, or the student said they want to stop
    const wasFinished = s.finished;
    if (s.started && s.answers.length >= s.total) {
      s.finished = true;
      s.exercise = null;
    } else if (rs.finished && s.started && !s.finished) {
      s.finished = true;
      s.endedEarly = true;
      s.exercise = null;
    }
    // 3) the next (or repeated) question – its number is counted by the app
    let exercise = null;
    if (reply.exercise && !s.finished) {
      const sameQuestion = before.exercise?.wordId && before.exercise.wordId === reply.exercise.wordId && before.exercise.task === reply.exercise.task;
      exercise = { ...reply.exercise, number: s.answers.length + 1, total: s.total, ...(sameQuestion && before.exercise.hinted ? { hinted: true } : {}) };
      s.exercise = exercise;
      s.started = true;
      s.lastType = exercise.type;
    }
    if (reply.grammarFocus) s.grammarFocus = reply.grammarFocus;

    const justFinished = s.finished && !wasFinished;
    const shown = { ...reply, feedback, exercise };
    const message = { id: uid(), at: Date.now(), role: 'tutor', reply: shown, modelText, summary: justFinished ? summaryOf(s) : null };
    update((c) => ({
      ...c,
      session: s,
      modelOptions: s.finished ? [] : reply.options,
      messages: [...c.messages, message],
    }));

    if (reply.panelView) changeView(reply.panelView);
    if (feedback || justFinished) remember(s);
    return null;
  }

  // ---------- what the screen shows ----------
  const { stage, session, messages, modelOptions } = convo;

  // chips above the chat input: the tutor's answer choices, then hint / rule / skip / mistakes
  const quick = useMemo(() => {
    if (stage !== 'practice' || !session.started || session.finished) return [];
    const taken = new Set();
    const list = [
      ...modelOptions.map((text) => ({ text, style: 'outline' })),
      { text: t('chipHint') },
      isVocab(session) ? null : { text: t('chipRule') },
      { text: t('chipSkip') },
      { text: t('chipRepeat') },
    ];
    return list.filter((x) => x && x.text && !taken.has(x.text.toLowerCase()) && taken.add(x.text.toLowerCase()));
  }, [stage, session, modelOptions]);

  const summaryActions = session.finished
    ? [
      { text: t('summaryAgain'), onClick: again, primary: true },
      { text: t('summaryNew'), onClick: () => openSetup(session.settings) },
    ]
    : null;

  const status = stage === 'practice'
    ? (session.finished ? t('statusFinished') : !session.started ? t('statusStarting') : isVocab(session) ? t('statusFlashcards') : t('statusLesson'))
    : t('statusStarting');

  const topic = topicById(session.topicId);
  const recent = history.sessions.filter((x) => x.id !== session.id && x.answered > 0).slice(0, 4);

  // put the cursor back into the input after each answer
  useEffect(() => {
    if (!busy && stage !== 'setup') inputRef.current?.focus({ preventScroll: true });
  }, [busy, stage]);

  return (
    <div className="app">
      <Header
        name={profile.name}
        streak={currentStreak(history.streak)}
        onNewSession={() => openSetup(session.settings)}
        onChangeName={account ? null : changeName}
        onLogOut={account ? logOut : null}
      />
      {stage === 'setup' ? (
        <SetupScreen
          key={JSON.stringify(prefs.setup)}
          topics={topics}
          initial={prefs.setup}
          error={setupError}
          onStart={(form, settings) => startSession(settings, form)}
          onCancel={session.topicId ? cancelSetup : null}
        />
      ) : (
        <main className={`workspace${stage === 'practice' && session.settings ? ' with-ribbon' : ''}`}>
          {stage === 'practice' && session.settings && (
            <SessionRibbon session={session} onEnd={endSession} />
          )}
          <Chat
            status={status}
            messages={messages}
            busy={busy}
            waiting={waiting}
            onCancel={stopWaiting}
            slow={slow}
            error={error?.text}
            onRetry={error?.retry}
            stage={stage}
            onSend={handleSend}
            inputRef={inputRef}
            quick={quick}
            summaryActions={summaryActions}
          />
          <SessionPanel
            view={prefs.view}
            onView={changeView}
            session={session}
            topic={topic}
            recent={recent}
          />
        </main>
      )}
    </div>
  );
}
