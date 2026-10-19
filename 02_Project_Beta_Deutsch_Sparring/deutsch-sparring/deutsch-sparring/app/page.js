'use client';

// The whole app is this one screen. The chat is the control panel:
//   stage 'name'     → the tutor asks for the name (no AI)
//   stage 'code'     → asks for the class code, checked by /api/code (no AI)
//   stage 'topic'    → no topic yet: the student picks one by tapping or typing
//   stage 'practice' → a topic is chosen: questions with the AI tutor (/api/chat)
//
// The APP owns the session: it counts the questions (10–50), decides when the session is over,
// stops when the student wants to stop and switches topics. The tutor only writes the content.
// Short commands ("stop", "20 questions", "harder", "change topic" …) are understood by the app
// itself (lib/intents.js); everything else goes to the tutor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import OptionsPanel from '../components/OptionsPanel';
import Chat from '../components/Chat';
import SessionPanel from '../components/SessionPanel';
import { t, dirKey } from '../lib/ui-text';
import { detectIntent, detectTopicWish, topicGroupIn, extractName, QUESTION_MIN, QUESTION_MAX } from '../lib/intents';
import { score, summaryOf } from '../lib/stats';
import {
  loadProfile, saveProfile, loadPrefs, savePrefs, loadChat, saveChat, loadHistory,
  recordSession, recentMistakes, currentStreak, loadScores, recordWordAnswer, setStorageAccount,
} from '../lib/storage';

const LEVELS = ['A1', 'A2', 'B1'];
const DIFFS = ['easy', 'medium', 'hard'];
const VIEWS = ['glance', 'progress', 'grammar'];
const DIRECTIONS = ['en-de', 'de-en', 'mixed'];
const DIFF_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const DIR_DE = { 'en-de': 'Englisch → Deutsch', 'de-en': 'Deutsch → Englisch', mixed: 'gemischt' };
const DEFAULT_PREFS = {
  level: 'B1', difficulty: 'medium', view: 'glance', optionsHidden: false,
  questions: QUESTION_MIN, direction: 'en-de', sentences: false,
};
const SETTING_WORDS = /schwer|leicht|einfach|schwierig|hard|easy|difficult|simple|level|niveau|stufe|\b[ab][12]\b/i;
const CHAT_VERSION = 2; // saved conversations from older versions are not restored
const RESUME_GREETING_MIN = 30; // …with a "welcome back" line if the break was longer than this

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const plain = (x) => String(x || '').toLowerCase().replace(/[.!?,;:«»„“”"'’()]/g, ' ').replace(/\s+/g, ' ').trim();
const same = (a, b) => plain(a) === plain(b);
const isVocab = (s) => s.topicType === 'Wortschatz';

function newSession(topic = null, total = QUESTION_MIN) {
  return {
    id: uid(),
    topicId: topic?.id || null,
    topicName: topic?.short || null,
    topicType: topic ? (topic.id === 'free' ? 'free' : topic.type) : null,
    total,
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
  localOptions: null, // { label, chips } e.g. the grammar topics after tapping "Grammar"
  historyFrom: 0, // the AI only sees messages from this moment on
};

function sanitizePrefs(p) {
  const q = Math.round(Number(p.questions));
  return {
    level: LEVELS.includes(p.level) ? p.level : DEFAULT_PREFS.level,
    difficulty: DIFFS.includes(p.difficulty) ? p.difficulty : DEFAULT_PREFS.difficulty,
    view: VIEWS.includes(p.view) ? p.view : DEFAULT_PREFS.view,
    optionsHidden: Boolean(p.optionsHidden),
    questions: q >= QUESTION_MIN && q <= QUESTION_MAX ? q : DEFAULT_PREFS.questions,
    direction: DIRECTIONS.includes(p.direction) ? p.direction : DEFAULT_PREFS.direction,
    sentences: p.sentences === true,
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
  const notesRef = useRef({}); // settings changed by buttons, told to the tutor with the next message
  const requestRef = useRef(null); // the AI request in flight: { controller, cancelled }
  const [waiting, setWaiting] = useState(false); // an AI request is in flight (it can be cancelled)
  const inputRef = useRef(null);

  // ---------- small helpers to add things to the chat ----------
  const add = useCallback((msg) => {
    const m = { id: uid(), at: Date.now(), ...msg };
    update((c) => ({ ...c, messages: [...c.messages, m] }));
    return m;
  }, [update]);

  // a short line like "Difficulty: Hard"; several changes in a row only keep the last one
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
          setAccount({ username });
          p = { ...p, name: username };
          profileRef.current = p;
          setProfileState(p);
        }
        setHistory(loadHistory());
        begin(p);
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
    ) {
      const restored = { ...EMPTY_CONVO, ...saved, session: { ...newSession(), ...saved.session } };
      convoRef.current = restored;
      setConvo(restored);
      const last = restored.messages[restored.messages.length - 1];
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
      update(() => ({ ...start, stage: 'topic' }));
      const last = loadHistory().sessions[0];
      tutorSay([
        t(last ? 'tutorWelcomeBack' : 'tutorHelloTopic', { name: p.name }),
        last && last.answered ? t('tutorLastTime', { topic: last.topicName, score: `${last.correct}/${last.answered}` }) : null,
      ]);
    }
  }

  // ---------- remember things ----------
  useEffect(() => {
    if (convo.stage === 'topic' || convo.stage === 'practice') {
      saveChat({ ...convo, version: CHAT_VERSION, messages: convo.messages.slice(-80), savedAt: Date.now() });
    }
  }, [convo]);

  useEffect(() => {
    if (prefs === DEFAULT_PREFS) return; // first render: nothing loaded yet
    savePrefs(prefs);
    document.documentElement.dataset.options = prefs.optionsHidden ? 'hidden' : 'shown';
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
      level: prefsRef.current.level,
      difficulty: prefsRef.current.difficulty,
      ...sc,
      total: s.total,
      endedEarly: s.endedEarly,
      updatedAt: Date.now(),
      mistakes: s.answers.filter((a) => !a.correct && !a.skipped).slice(-5)
        .map(({ studentAnswer, corrected, rule }) => ({ studentAnswer, corrected, rule })),
    }));
  }

  // closing a running session because the student goes elsewhere (topic change, restart)
  function closeSession(withLine = true) {
    const s = convoRef.current.session;
    if (!s.started || s.finished) return;
    const ended = { ...s, finished: true, endedEarly: true, exercise: null };
    remember(ended);
    const sc = score(s.answers);
    if (withLine && sc.answered) addSystem('prev', t('sysPrevSession', sc));
  }

  // ---------- settings (buttons and chat do the same) ----------
  function changeLevel(level, { tellTutor = true, fromChat = false } = {}) {
    if (!LEVELS.includes(level)) return;
    if (level === prefsRef.current.level) {
      if (fromChat) addSystem('level', t('sysLevel', { value: level })); // asked in the chat: confirm anyway
      return;
    }
    setPrefs({ level });
    addSystem('level', t('sysLevel', { value: level }));
    const c = convoRef.current;
    if (c.stage === 'topic' && topicsRef.current.length && !topicsRef.current.some((x) => x.levels.includes(level))) {
      tutorSay(t('tutorNoTopicsForLevel', { level }));
    }
    if (tellTutor) notesRef.current = { ...notesRef.current, level: `Niveau → ${level}` };
  }

  function changeDifficulty(difficulty, { tellTutor = true, fromChat = false } = {}) {
    if (!DIFFS.includes(difficulty)) return;
    if (difficulty === prefsRef.current.difficulty) {
      if (fromChat) addSystem('difficulty', t('sysDifficulty', { value: t(`diff_${difficulty}`) }));
      return;
    }
    setPrefs({ difficulty });
    addSystem('difficulty', t('sysDifficulty', { value: t(`diff_${difficulty}`) }));
    if (tellTutor) notesRef.current = { ...notesRef.current, difficulty: `Schwierigkeit → ${DIFF_DE[difficulty]}` };
  }

  function changeView(view) {
    if (!VIEWS.includes(view)) return;
    if (view !== prefsRef.current.view) addSystem('view', t('sysView', { value: t(`view_${view}`) }));
    setPrefs({ view });
  }

  function changeDirection(direction) {
    if (!DIRECTIONS.includes(direction) || direction === prefsRef.current.direction) return;
    setPrefs({ direction });
    addSystem('direction', t('sysDirection', { value: t(`dir_${dirKey(direction)}`) }));
    notesRef.current = { ...notesRef.current, direction: `Karteikarten → ${DIR_DE[direction]}` };
  }

  function changeSentences(sentences) {
    if (sentences === prefsRef.current.sentences) return;
    setPrefs({ sentences });
    addSystem('sentences', t(sentences ? 'sysSentencesOn' : 'sysSentencesOff'));
    notesRef.current = { ...notesRef.current, sentences: `Sätze mit dem Wort → ${sentences ? 'an' : 'aus'}` };
  }

  // questions per session: also changes the running session; if it is already reached, it ends
  function changeQuestions(value) {
    const n = Math.max(QUESTION_MIN, Math.min(QUESTION_MAX, Math.round(Number(value) || QUESTION_MIN)));
    if (n !== prefsRef.current.questions) {
      setPrefs({ questions: n });
      addSystem('questions', t('sysQuestions', { value: n }));
    }
    const s = convoRef.current.session;
    if (!s.topicId || s.finished || s.total === n) return;
    if (s.started && s.answers.length >= n) {
      finishSession({ early: false, line: t('tutorFinishedByCount', { n }), total: s.answers.length });
      return;
    }
    updateSession((x) => ({ ...x, total: n }));
    notesRef.current = { ...notesRef.current, questions: `Fragen pro Sitzung → ${n}` };
  }

  // ---------- ending a session (no AI): summary card in the chat ----------
  function finishSession({ early = true, line, total } = {}) {
    const s = convoRef.current.session;
    if (!s.started) {
      tutorSay(t('tutorStopIdle'));
      return;
    }
    if (s.finished) {
      tutorSay(t('tutorAlreadyFinished', { again: t('chipAgain') }));
      return;
    }
    const done = { ...s, total: total || s.total, finished: true, endedEarly: early && s.answers.length < s.total, exercise: null };
    update((c) => ({ ...c, session: done, modelOptions: [], localOptions: null }));
    remember(done);
    tutorSay(line || t('tutorStopped', { name: profileRef.current.name }), { summary: summaryOf(done) });
  }

  // ---------- onboarding (no AI) ----------
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
      update((c) => ({ ...c, stage: 'topic', historyFrom: Date.now() }));
      tutorSay(t('tutorHelloTopic', { name }));
    }
  }

  async function onCode(text) {
    add({ role: 'user', text, masked: true });
    setBusy(true);
    let reply;
    try {
      const { data } = await postJson('/api/code', { classCode: text, clientId: profileRef.current.clientId }, 15000);
      if (data.ok) {
        setProfile({ ...profileRef.current, classCode: text });
        const resume = Boolean(convoRef.current.session.topicId);
        update((c) => ({ ...c, stage: resume ? 'practice' : 'topic', historyFrom: resume ? c.historyFrom : Date.now() }));
        reply = resume ? t('tutorCodeThanks') : t('tutorCodeOk');
      } else {
        reply = data.error || t('tutorBadCode');
      }
    } catch {
      reply = t('tutorCodeError');
    }
    setBusy(false);
    tutorSay(reply);
  }

  // ---------- topics (no AI until the topic starts) ----------
  function goToTopics(lineKey) {
    closeSession();
    dropRequest();
    update((c) => ({ ...c, stage: 'topic', session: newSession(), modelOptions: [], localOptions: null, historyFrom: Date.now() }));
    const forLevel = topicsRef.current.filter((x) => x.levels.includes(prefsRef.current.level));
    tutorSay([
      t(lineKey, { name: profileRef.current.name }),
      topicsRef.current.length && !forLevel.length ? t('tutorNoTopicsForLevel', { level: prefsRef.current.level }) : null,
    ]);
  }

  // start a topic: new session, fresh conversation for the tutor, first question from the tutor
  function startTopic(topic, msg) {
    closeSession();
    const s = newSession(topic, prefsRef.current.questions);
    let start = msg;
    if (!start) {
      // started by the app (the tutor switched topic): a hidden message opens the conversation
      start = { id: uid(), at: Date.now(), role: 'user', text: t('tutorStartTopic', { topic: topic.short }), hidden: true, ai: true };
      update((c) => ({ ...c, messages: [...c.messages, start] }));
    }
    update((c) => ({ ...c, stage: 'practice', session: s, modelOptions: [], localOptions: null, historyFrom: start.at }));
    addSystem('topic', t('sysTopic', { value: topic.short }));
    askTutor(start.text, { msg: start });
  }

  function restart() {
    const before = convoRef.current.session;
    const recap = before.started && !before.finished ? score(before.answers) : null;
    closeSession(false);
    dropRequest();
    const fresh = { ...EMPTY_CONVO, stage: 'topic', session: newSession(), historyFrom: Date.now() };
    convoRef.current = fresh;
    setConvo(fresh);
    if (recap?.answered) addSystem('prev', t('sysPrevSession', recap));
    setError(null);
    notesRef.current = {};
    tutorSay(t('tutorRestart', { name: profileRef.current.name }));
  }

  function changeName() {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmChangeName'))) return;
    closeSession(false);
    dropRequest();
    setProfile({ ...profileRef.current, name: '' });
    saveChat(null);
    const fresh = { ...EMPTY_CONVO, stage: 'name', session: newSession(), historyFrom: Date.now() };
    convoRef.current = fresh;
    setConvo(fresh);
    setError(null);
    tutorSay(t('tutorAskName'));
  }

  function listTopicGroup(group, msg) {
    const list = topicsRef.current.filter((x) => x.type === group && !x.parent); // vocabulary: sections (their lists come after a tap)
    const s = convoRef.current.session;
    if (!list.length) {
      tutorSay(t('tutorNoTopicsOfType'));
      return;
    }
    if (list.length === 1) {
      const only = list[0];
      if (only.id === s.topicId && s.started && !s.finished) tutorSay(t('tutorAlreadyOnTopic', { topic: only.short }));
      else startTopic(only, msg);
      return;
    }
    update((c) => ({ ...c, localOptions: { label: t(`type_${group}`), chips: list.map((x) => x.short) } }));
    tutorSay(t(group === 'Grammatik' ? 'tutorChooseGrammar' : 'tutorChooseVocab'));
  }

  function again(msg) {
    const s = convoRef.current.session;
    const id = s.topicId || historyRef.current.sessions[0]?.topicId;
    const topic = id && topicById(id);
    if (topic) startTopic(topic, msg);
    else goToTopics('tutorAskTopicAgain');
  }

  // the open question is skipped: counted at once, the tutor gives the solution + the next one
  function skipOpen() {
    scoreAnswer(convoRef.current.session, convoRef.current.session.exercise, { skipped: true });
    updateSession((s) => ({
      ...s,
      answers: [...s.answers, { n: s.answers.length + 1, skipped: true, correct: false, studentAnswer: '', corrected: '', changedWords: [], explanation: '', rule: '', skippedLine: s.exercise?.line || '', question: s.exercise?.line || '', qType: s.exercise?.type || null, wordId: s.exercise?.wordId || '', task: s.exercise?.task || null }],
      exercise: null,
    }));
  }

  // Word scores: the APP updates them (lib/scores.js), never the model. Called once per answer.
  function scoreAnswer(session, exercise, { correct = false, errorType = null, skipped = false } = {}) {
    if (!exercise?.wordId) return;
    const type = session.words?.find((w) => w.id === exercise.wordId)?.type;
    recordWordAnswer(exercise.wordId, {
      task: exercise.task || 'flashcard',
      correct, errorType, skipped,
      hinted: Boolean(exercise.hinted) || prefsRef.current.difficulty === 'easy', // a hint, or "Leicht" (multiple choice)
      hasG: type !== 'phrase',
    });
  }

  // stop waiting for the tutor (button in the input, or "Stopp" while it is writing)
  function cancelRequest() {
    const r = requestRef.current;
    if (!r) return;
    r.cancelled = true;
    r.controller.abort();
  }

  // a pending answer that no longer matters (new session from the menu, other topic …)
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
    if (c.stage === 'loading') return false;
    if (c.stage === 'name') return onName(text);
    if (c.stage === 'code') return onCode(text);

    const msg = add({ role: 'user', text });
    update((x) => ({ ...x, localOptions: null }));
    const s = c.session;
    const running = s.started && !s.finished;
    const open = running && Boolean(s.exercise);
    const intent = detectIntent(text, { open });

    // before a topic runs, a settings command can also name what to practise:
    // "Flashcards English to German please", "30 questions about furniture"
    const thenTopic = () => {
      if (running || s.topicId) return;
      const group = topicGroupIn(text);
      if (group) listTopicGroup(group, msg);
    };

    // a hint on a word question: the answer then counts less (+1, no streak)
    if (open && s.exercise?.wordId && /^(tipp|hint|give me a hint|gib mir einen tipp|einen tipp)\b/i.test(text)) {
      updateSession((x) => ({ ...x, exercise: x.exercise ? { ...x.exercise, hinted: true } : x.exercise }));
    }

    switch (intent?.type) {
      case 'stop':
        if (s.topicId && !s.answers.length) {
          // nothing answered yet: no score to show, just go back to the topic list
          goToTopics('tutorStopNoAnswers');
          return true;
        }
        finishSession({ early: true });
        return true;
      case 'again':
        if (running) break; // "nochmal" during a question = "say it again": the tutor answers
        again(msg);
        return true;
      case 'restart':
        restart();
        return true;
      case 'changeTopic':
        goToTopics('tutorAskTopicAgain');
        return true;
      case 'topicGroup':
        listTopicGroup(intent.group, msg);
        return true;
      case 'view':
        changeView(intent.view);
        return true;
      case 'questions':
        changeQuestions(intent.value);
        thenTopic();
        return true;
      case 'direction':
        changeDirection(intent.value);
        if (open && isVocab(s)) askTutor(text, { msg, settingsDone: true });
        else if (!running && !s.topicId) listTopicGroup('Wortschatz', msg); // flashcards = vocabulary
        return true;
      case 'sentences':
        changeSentences(intent.value);
        thenTopic();
        return true;
      case 'difficulty': {
        const cur = DIFFS.indexOf(prefsRef.current.difficulty);
        changeDifficulty(intent.value || DIFFS[Math.max(0, Math.min(2, cur + intent.step))], { fromChat: true });
        if (open) askTutor(text, { msg, settingsDone: true });
        return true;
      }
      case 'level':
        changeLevel(intent.value, { fromChat: true });
        if (open) askTutor(text, { msg, settingsDone: true });
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

    // a topic: tapped chip, its exact name, or a short wish ("Ich möchte jetzt Wohnen üben")
    const exact = topicsRef.current.find((x) => same(x.short, text) || same(x.title, text));
    const wish = exact ? null : detectTopicWish(text, topicsRef.current, { running });
    if (wish?.group) {
      listTopicGroup(wish.group, msg);
      return true;
    }
    const topic = exact || (wish?.topicId && topicById(wish.topicId));
    if (topic) {
      // a vocabulary section with several lists: ask for the whole section or one list
      if (topic.lists?.length && same(text, topic.short)) {
        const chips = [topic.title, ...topicsRef.current.filter((x) => x.parent === topic.id).map((x) => x.short)];
        update((x) => ({ ...x, localOptions: { label: topic.short, chips } }));
        tutorSay(t('tutorChooseList', { section: topic.short }));
        return true;
      }
      // the topic that is already running: say so – never grade it as an answer
      if (topic.id === s.topicId && running) tutorSay(t('tutorAlreadyOnTopic', { topic: topic.short }));
      else startTopic(topic, msg);
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

  async function askTutor(text, { msg, settingsDone = false } = {}) {
    // mark the student's message as part of the AI conversation
    if (msg && !msg.ai) update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === msg.id ? { ...m, ai: true } : m)) }));

    const c = convoRef.current;
    const p = prefsRef.current;
    const s = c.session;
    // settingsDone: the app already applied the level/difficulty command of this message, so the
    // tutor must not change it again (e.g. "schwieriger" must not jump two steps)
    const sent = { level: p.level, difficulty: p.difficulty, topicId: s.topicId, sessionId: s.id, text, settingsDone };
    const sentNotes = notesRef.current;
    const lastSkipped = s.answers[s.answers.length - 1]?.skipped ? s.answers[s.answers.length - 1] : null;
    const body = {
      name: profileRef.current.name,
      classCode: profileRef.current.classCode,
      settings: { level: p.level, difficulty: p.difficulty, direction: p.direction, sentences: p.sentences },
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
      ...(isVocab(s) && !s.wordIds?.length ? { scores: loadScores(), source: 'both' } : {}),
      progress: score(s.answers),
      // what was already asked in this session, so 20–50 questions don't repeat
      asked: s.answers.map((a) => a.line || a.skippedLine).filter(Boolean).slice(-50),
      mistakes: recentMistakes(s.answers, historyRef.current.sessions),
      clientId: profileRef.current.clientId,
      notes: Object.values(sentNotes),
      messages: aiHistory(c),
    };

    setBusy(true);
    setWaiting(true);
    const request = { controller: new AbortController(), cancelled: false };
    requestRef.current = request;
    let then = null;
    try {
      const { res, data } = await postJson('/api/chat', body, 70000, request.controller.signal);
      if (request.cancelled) return;
      // the student started something else meanwhile (new session, other topic): drop this answer
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
      if (notesRef.current === sentNotes) notesRef.current = {}; // (a click during the request keeps its note)
      if (!data.reply) {
        // not valid JSON: show the text, keep the session and the panel as they are
        add({ role: 'tutor', text: data.text || '…', modelText: data.text || '' });
        if (Array.isArray(data.words) && data.words.length) updateSession((x) => (x.wordIds?.length ? x : { ...x, wordIds: data.words.map((w) => w.id), words: data.words }));
      } else {
        then = applyReply(data.reply, data.modelText, sent, data.words);
      }
    } catch (e) {
      if (request.cancelled) return;
      // the student started something else meanwhile (new session, other topic): drop this answer
      if (convoRef.current.session.id !== sent.sessionId) return; // the student stopped it: no error message
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
  function applyReply(reply, modelText, sent, pickedWords) {
    const rs = reply.session;
    const before = convoRef.current.session;

    // 1) the tutor switched topic because the student asked in their own words
    //    (only during a running session – at the start of a topic the app's choice wins)
    if (before.started && before.topicId && rs.topicId && rs.topicId !== before.topicId && sent.topicId === before.topicId && topicById(rs.topicId)) {
      add({ role: 'tutor', reply: { ...reply, feedback: null, exercise: null }, modelText });
      const topic = topicById(rs.topicId);
      return () => startTopic(topic, null);
    }

    let s = { ...before };
    // 2) no topic yet: the tutor picked one (or the server guessed it) and started with a question.
    //    (If it only asks which topic, nothing is decided yet.)
    if (!s.topicId && rs.topicId && reply.exercise) {
      const topic = topicById(rs.topicId) || { id: rs.topicId, short: rs.topicName || rs.topicId, type: 'Gemischt' };
      s = { ...newSession(topic, prefsRef.current.questions), id: s.id };
      if (topic.id === 'free' && rs.topicName) s.topicName = rs.topicName;
    }

    // the words the server picked for this vocabulary session: kept for the whole session
    if (Array.isArray(pickedWords) && pickedWords.length && !s.wordIds?.length && s.topicId && !s.finished) {
      s.wordIds = pickedWords.map((w) => w.id);
      s.words = pickedWords;
    }

    // 3) feedback for the open question. (Also counted if the tutor asked its question only in
    //    the text, without a question card – but never twice for a question that was skipped.)
    let feedback = null;
    const lastAnswer = s.answers[s.answers.length - 1];
    const forSkipped = lastAnswer?.skipped && !s.exercise && reply.feedback?.forNumber === lastAnswer.n;
    if (reply.feedback && s.topicId && !s.finished && !forSkipped) {
      feedback = { ...reply.feedback, kind: s.exercise?.type || null }; // kind: the type of question it answers
      // word scores: updated by the app from the tutor's verdict (correct, errorType), a hint and "Leicht"
      scoreAnswer(s, s.exercise, { correct: feedback.correct, errorType: feedback.errorType });
      s.answers = [...s.answers, { ...feedback, n: s.answers.length + 1, skipped: false, line: s.exercise?.line || '', question: s.exercise?.line || '', qType: s.exercise?.type || null, wordId: s.exercise?.wordId || '', task: s.exercise?.task || null }];
      s.exercise = null;
      s.started = true;
    }
    // 4) the app ends the session: all questions done, or the student said they want to stop
    const wasFinished = s.finished;
    if (s.started && s.answers.length >= s.total) {
      s.finished = true;
      s.exercise = null;
    } else if (rs.finished && s.started && !s.finished) {
      s.finished = true;
      s.endedEarly = true;
      s.exercise = null;
    }
    // 5) the next (or repeated) question – its number is counted by the app
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
      stage: s.topicId ? 'practice' : 'topic',
      modelOptions: s.finished ? [] : reply.options,
      messages: [...c.messages, message],
    }));

    // the tutor changed a setting because the student asked in their own words. Only then: a
    // tutor that just repeats an old value from earlier turns must not undo a button click.
    const askedForSetting = !sent.settingsDone && SETTING_WORDS.test(sent.text || '');
    if (askedForSetting && rs.level !== sent.level) changeLevel(rs.level, { tellTutor: false });
    if (askedForSetting && rs.difficulty !== sent.difficulty) changeDifficulty(rs.difficulty, { tellTutor: false });
    if (reply.panelView) changeView(reply.panelView);
    if (feedback || justFinished) remember(s);
    return null;
  }

  // ---------- what the screen shows ----------
  const { stage, session, messages, modelOptions, localOptions } = convo;

  const optionGroups = useMemo(() => {
    if (stage === 'loading' || stage === 'name' || stage === 'code') return [];
    const groups = [];
    const taken = new Set();
    const chips = (list, style) => list
      .filter((x) => x && !taken.has(x.toLowerCase()) && taken.add(x.toLowerCase()))
      .map((text) => ({ text, style }));

    if (localOptions) groups.push({ label: localOptions.label, chips: chips(localOptions.chips, 'outline') });

    if (stage === 'topic') {
      const forLevel = topics.filter((x) => !x.parent && x.levels.includes(prefs.level));
      const list = forLevel.length ? forLevel : topics;
      if (modelOptions.length) groups.push({ label: t('groupNow'), chips: chips(modelOptions, 'soft') });
      if (list.length) {
        groups.push({
          label: forLevel.length ? t('groupTopics', { level: prefs.level }) : t('groupTopicsAll'),
          chips: chips(list.map((x) => x.short), 'outline'),
        });
      }
      groups.push({ label: t('groupTopic'), chips: chips([t('chipGrammar'), t('chipVocab')], 'outline') });
    } else if (session.finished) {
      groups.push({ label: t('groupNext'), chips: chips([t('chipAgain'), t('chipChangeTopic')], 'soft') });
      groups.push({ label: t('groupTopic'), chips: chips([t('chipGrammar'), t('chipVocab')], 'outline') });
    } else {
      if (modelOptions.length) groups.push({ label: t('groupNow'), chips: chips(modelOptions, 'soft') });
      const vocab = isVocab(session);
      groups.push({
        label: t('groupPractising'),
        chips: chips([t('chipHint'), vocab ? null : t('chipRule'), t('chipSkip'), t('chipRepeat'), t('chipEndSession')], 'soft'),
      });
      if (vocab) {
        const dirs = { 'en-de': t('chipEnDe'), 'de-en': t('chipDeEn'), mixed: t('chipMixed') };
        groups.push({
          label: t('groupFlashcards'),
          chips: chips([
            ...DIRECTIONS.filter((d) => d !== prefs.direction).map((d) => dirs[d]),
            prefs.sentences ? t('chipSentencesOff') : t('chipSentencesOn'),
          ], 'outline'),
        });
      }
      groups.push({ label: t('groupTopic'), chips: chips([t('chipGrammar'), t('chipVocab'), t('chipChangeTopic')], 'outline') });
    }
    return groups.filter((g) => g.chips.length);
  }, [stage, session, modelOptions, localOptions, topics, prefs.level, prefs.direction, prefs.sentences]);

  const status = stage === 'topic' ? t('statusChoosing')
    : stage === 'practice'
      ? (session.finished ? t('statusFinished') : !session.started ? t('statusStarting') : isVocab(session) ? t('statusFlashcards') : t('statusLesson'))
      : t('statusStarting');

  const topic = topicById(session.topicId);
  const recent = history.sessions.filter((x) => x.id !== session.id && x.answered > 0).slice(0, 4);

  // put the cursor back into the input after each answer
  useEffect(() => {
    if (!busy) inputRef.current?.focus({ preventScroll: true });
  }, [busy, stage]);

  return (
    <div className="app">
      <Header
        name={profile.name}
        streak={currentStreak(history.streak)}
        onNewSession={restart}
        onChangeName={account ? null : changeName}
        onLogOut={account ? logOut : null}
      />
      <main className="workspace">
        <OptionsPanel
          onToggle={() => setPrefs({ optionsHidden: !prefsRef.current.optionsHidden })}
          groups={optionGroups}
          note={t('optionsOnboarding')}
          onPick={handleSend}
          disabled={busy}
        />
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
        />
        <SessionPanel
          prefs={prefs}
          onLevel={(v) => changeLevel(v)}
          onDifficulty={(v) => changeDifficulty(v)}
          onQuestions={(v) => changeQuestions(v)}
          onDirection={(v) => changeDirection(v)}
          onSentences={(v) => changeSentences(v)}
          onView={changeView}
          session={session}
          topic={topic}
          recent={recent}
        />
      </main>
    </div>
  );
}
