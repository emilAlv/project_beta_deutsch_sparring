'use client';

// The whole app is this one screen. The chat is the control panel:
//   stage 'name'  → the tutor asks for the name (no AI)
//   stage 'code'  → asks for the class code, checked by /api/code (no AI)
//   stage 'topic' → the student picks a topic by tapping or typing
//   stage 'practice' → role-play / exercises with the AI tutor (/api/chat)
// Short commands ("harder", "show me progress", "change topic" …) are understood by the app
// itself (lib/intents.js); everything else goes to the tutor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import OptionsPanel from '../components/OptionsPanel';
import Chat from '../components/Chat';
import SessionPanel from '../components/SessionPanel';
import { t } from '../lib/ui-text';
import { detectIntent, extractName } from '../lib/intents';
import { score, taskStates } from '../lib/stats';
import {
  loadProfile, saveProfile, loadPrefs, savePrefs, loadChat, saveChat, loadHistory,
  recordSession, recentMistakes, currentStreak,
} from '../lib/storage';

const LEVELS = ['A1', 'A2', 'B1'];
const DIFFS = ['easy', 'medium', 'hard'];
const VIEWS = ['glance', 'progress', 'grammar'];
const DIFF_DE = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const DEFAULT_PREFS = { level: 'B1', difficulty: 'medium', view: 'glance', optionsHidden: false };
const RESTORE_HOURS = 18; // a conversation from earlier today comes back after a reload
const RESUME_GREETING_MIN = 30; // …with a "welcome back" line if the break was longer than this

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function newSession(topicId = null) {
  return {
    id: uid(),
    topicId,
    topicName: null,
    scenario: null,
    theme: null,
    exerciseType: null,
    exercise: null, // the task waiting for an answer
    total: 8,
    answers: [], // { n, correct, studentAnswer, corrected, changedWords, explanation, rule, errorType }
    grammarFocus: null,
    finished: false,
    started: false,
  };
}

const EMPTY_CONVO = {
  stage: 'loading',
  messages: [],
  session: newSession(),
  modelOptions: [], // situational options from the tutor
  localOptions: null, // { label, chips } e.g. the grammar topics after tapping "Grammar"
  historyFrom: 0, // the AI only sees messages from this moment on
};

function sanitizePrefs(p) {
  return {
    level: LEVELS.includes(p.level) ? p.level : DEFAULT_PREFS.level,
    difficulty: DIFFS.includes(p.difficulty) ? p.difficulty : DEFAULT_PREFS.difficulty,
    view: VIEWS.includes(p.view) ? p.view : DEFAULT_PREFS.view,
    optionsHidden: Boolean(p.optionsHidden),
  };
}

class UiError extends Error {
  constructor(message, retry = true) {
    super(message);
    this.retry = retry;
  }
}

async function postJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
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

  const [prefs, setPrefsState] = useState(DEFAULT_PREFS);
  const prefsRef = useRef(DEFAULT_PREFS);
  const prefsLoaded = useRef(false); // don't overwrite the saved settings before they are read
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

  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (b) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null); // { text, retry }
  const notesRef = useRef({}); // settings changed by buttons, told to the tutor with the next message
  const inputRef = useRef(null);

  // ---------- small helpers to add things to the chat ----------
  const add = useCallback((msg) => {
    const m = { id: uid(), at: Date.now(), ...msg };
    update((c) => ({ ...c, messages: [...c.messages, m] }));
    return m;
  }, [update]);

  // a short line like "Difficulty: Hard"; several clicks in a row only keep the last one
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
  const tutorSay = useCallback((...lines) => new Promise((resolve) => {
    setBusy(true);
    setTimeout(() => {
      lines.filter(Boolean).forEach((text) => add({ role: 'tutor', text }));
      setBusy(false);
      resolve();
    }, 450);
  }), [add]);

  // ---------- start: read what the browser remembers ----------
  useEffect(() => {
    let cancelled = false;
    const p = loadProfile();
    profileRef.current = p;
    setProfileState(p);
    if (!prefsLoaded.current) setPrefs(sanitizePrefs(loadPrefs()));
    prefsLoaded.current = true;
    setHistory(loadHistory());

    fetch('/api/topics')
      .then((r) => r.json())
      .catch(() => ({}))
      .then((d) => {
        if (cancelled) return;
        topicsRef.current = Array.isArray(d.topics) ? d.topics : [];
        needsCodeRef.current = Boolean(d.needsCode);
        setTopics(topicsRef.current);
        begin(p);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function begin(p) {
    const saved = loadChat();
    const codeOk = !needsCodeRef.current || p.classCode;
    if (p.name && codeOk && saved?.messages?.length && Date.now() - (saved.savedAt || 0) < RESTORE_HOURS * 3600_000) {
      const restored = { ...EMPTY_CONVO, ...saved, session: { ...newSession(), ...saved.session } };
      convoRef.current = restored;
      setConvo(restored);
      if (Date.now() - saved.savedAt > RESUME_GREETING_MIN * 60_000) tutorSay(t('tutorResume', { name: p.name }));
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
      tutorSay(
        t('tutorWelcomeBack', { name: p.name }),
        last && last.answered ? t('tutorLastTime', { topic: last.topicName || last.scenario, score: `${last.correct}/${last.answered}` }) : null,
      );
    }
  }

  // ---------- remember things ----------
  useEffect(() => {
    if (convo.stage === 'topic' || convo.stage === 'practice') {
      saveChat({ ...convo, messages: convo.messages.slice(-80), savedAt: Date.now() });
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

  // ---------- settings (buttons and chat do the same) ----------
  function changeLevel(level, { tellTutor = true } = {}) {
    if (!LEVELS.includes(level) || level === prefsRef.current.level) return;
    setPrefs({ level });
    addSystem('level', t('sysLevel', { value: level }));
    if (tellTutor) notesRef.current.level = `Niveau → ${level}`;
  }

  function changeDifficulty(difficulty, { tellTutor = true } = {}) {
    if (!DIFFS.includes(difficulty) || difficulty === prefsRef.current.difficulty) return;
    setPrefs({ difficulty });
    addSystem('difficulty', t('sysDifficulty', { value: t(`diff_${difficulty}`) }));
    if (tellTutor) notesRef.current.difficulty = `Schwierigkeit → ${DIFF_DE[difficulty]}`;
  }

  function changeView(view) {
    if (!VIEWS.includes(view)) return;
    if (view !== prefsRef.current.view) addSystem('view', t('sysView', { value: t(`view_${view}`) }));
    setPrefs({ view });
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
      const { data } = await postJson('/api/code', { classCode: text }, 15000);
      if (data.ok) {
        setProfile({ ...profileRef.current, classCode: text });
        const resume = convoRef.current.session.started;
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

  // ---------- navigation by talking (no AI) ----------
  function goToTopics(lineKey) {
    update((c) => ({ ...c, stage: 'topic', session: newSession(), modelOptions: [], localOptions: null, historyFrom: Date.now() }));
    const forLevel = topicsRef.current.filter((x) => x.levels.includes(prefsRef.current.level));
    tutorSay(
      t(lineKey, { name: profileRef.current.name }),
      topicsRef.current.length && !forLevel.length ? t('tutorNoTopicsForLevel', { level: prefsRef.current.level }) : null,
    );
  }

  function restart() {
    const fresh = { ...EMPTY_CONVO, stage: 'topic', session: newSession(), historyFrom: Date.now() };
    convoRef.current = fresh;
    setConvo(fresh);
    setError(null);
    notesRef.current = {};
    tutorSay(t('tutorRestart', { name: profileRef.current.name }));
  }

  function changeName() {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmChangeName'))) return;
    setProfile({ ...profileRef.current, name: '' });
    saveChat(null);
    const fresh = { ...EMPTY_CONVO, stage: 'name', session: newSession(), historyFrom: Date.now() };
    convoRef.current = fresh;
    setConvo(fresh);
    setError(null);
    tutorSay(t('tutorAskName'));
  }

  function listTopicGroup(group, msg) {
    const list = topicsRef.current.filter((x) => x.type === group);
    if (list.length === 1) {
      const c = convoRef.current;
      if (list[0].id !== c.session.topicId) askTutor(msg.text, { msg, topicId: list[0].id, fresh: c.stage === 'practice' });
      else tutorSay(t('tutorChooseGrammar'));
      return;
    }
    if (!list.length) {
      tutorSay(t('tutorNoTopicsOfType'));
      return;
    }
    update((c) => ({ ...c, localOptions: { label: t(`type_${group}`), chips: list.map((x) => ({ text: x.short, style: 'outline' })) } }));
    tutorSay(t(group === 'Grammatik' ? 'tutorChooseGrammar' : 'tutorChooseVocab'));
  }

  // ---------- the router: every message (typed or tapped) comes through here ----------
  function handleSend(raw) {
    const text = String(raw || '').trim();
    if (!text || busyRef.current) return false;
    setError(null);
    const c = convoRef.current;
    if (c.stage === 'loading') return false;
    if (c.stage === 'name') return onName(text);
    if (c.stage === 'code') return onCode(text);

    const msg = add({ role: 'user', text });
    update((x) => ({ ...x, localOptions: null }));
    const intent = detectIntent(text);
    const practising = c.stage === 'practice' && c.session.exercise && !c.session.finished;

    switch (intent?.type) {
      case 'view':
        changeView(intent.view);
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
      case 'difficulty': {
        const cur = DIFFS.indexOf(prefsRef.current.difficulty);
        const next = intent.value || DIFFS[Math.max(0, Math.min(2, cur + intent.step))];
        changeDifficulty(next);
        if (practising) askTutor(text, { msg });
        return true;
      }
      case 'level':
        changeLevel(intent.value);
        if (practising) askTutor(text, { msg });
        return true;
      case 'rule':
        changeView('grammar');
        askTutor(text, { msg });
        return true;
      default:
    }

    // a topic name (tapped chip or typed exactly) starts that topic
    const topic = topicsRef.current.find((x) => same(x.short, text) || same(x.title, text));
    if (topic && topic.id !== c.session.topicId) {
      askTutor(text, { msg, topicId: topic.id, fresh: c.stage === 'practice' });
      return true;
    }
    askTutor(text, { msg });
    return true;
  }

  // ---------- talking to the AI tutor ----------
  function aiHistory(c, from) {
    return c.messages
      .filter((m) => m.at >= from && ((m.role === 'user' && m.ai) || (m.role === 'tutor' && m.modelText)))
      .map((m) => (m.role === 'user' ? { role: 'user', text: m.text } : { role: 'assistant', text: m.modelText }));
  }

  async function askTutor(text, { msg, topicId, fresh = false } = {}) {
    // mark the student's message as part of the AI conversation
    if (msg) update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === msg.id ? { ...m, ai: true } : m)) }));
    if (fresh && msg) update((c) => ({ ...c, historyFrom: msg.at }));

    const c = convoRef.current;
    const p = prefsRef.current;
    const s = fresh ? newSession(topicId) : c.session;
    const sent = { level: p.level, difficulty: p.difficulty };
    const sentNotes = notesRef.current;
    const notes = Object.values(sentNotes);
    const body = {
      name: profileRef.current.name,
      classCode: profileRef.current.classCode,
      settings: sent,
      session: {
        topicId: topicId || s.topicId,
        scenario: s.scenario,
        exerciseNumber: s.finished ? 0 : s.exercise?.number || 0,
        exerciseLine: s.exercise?.line || '',
        total: s.total,
        started: s.started,
      },
      progress: score(s.answers),
      mistakes: recentMistakes(c.session.answers, historyRef.current.sessions),
      notes,
      messages: aiHistory(c, c.historyFrom).slice(-40),
    };

    setBusy(true);
    try {
      const { res, data } = await postJson('/api/chat', body, 70000);
      if (!res.ok || data.error) {
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
        // not valid JSON: show the text, keep the panel as it is
        add({ role: 'tutor', text: data.text || '…', modelText: data.text || '' });
      } else {
        applyReply(data.reply, data.modelText, sent);
      }
    } catch (e) {
      const text2 = e instanceof UiError ? e.message : e?.name === 'TimeoutError' ? t('errorTimeout') : t('errorNetwork');
      const canRetry = !(e instanceof UiError) || e.retry;
      setError({ text: text2, retry: canRetry ? () => { setError(null); askTutor(text, { topicId, fresh }); } : null });
    } finally {
      setBusy(false);
    }
  }

  function applyReply(reply, modelText, sent) {
    const rs = reply.session;
    let answered = false;
    update((c) => {
      let s = c.session;
      const newTopic = Boolean(rs.topicId) && rs.topicId !== s.topicId;
      const newRound = !newTopic && reply.exercise?.number === 1 && !reply.feedback && (s.finished || s.answers.length > 0);
      if (newTopic || newRound) s = newSession(rs.topicId || s.topicId);
      s = { ...s };
      if (rs.topicName) s.topicName = rs.topicName;
      if (rs.scenario || newTopic || newRound) s.scenario = rs.scenario || s.scenario;
      if (rs.theme || newTopic || newRound) s.theme = rs.theme || s.theme;

      if (reply.feedback) {
        const f = reply.feedback;
        const n = f.forNumber || c.session.exercise?.number || s.answers.length + 1;
        if (!s.answers.some((a) => a.n === n)) {
          s.answers = [...s.answers, { ...f, n }];
          answered = true;
        }
      }
      if (reply.exercise) {
        s.exercise = reply.exercise;
        s.total = reply.exercise.total;
        s.exerciseType = reply.exercise.type;
        s.started = true;
      } else if (reply.feedback || rs.finished) {
        s.exercise = null;
      }
      if (reply.grammarFocus) s.grammarFocus = reply.grammarFocus;
      s.finished = rs.finished || (s.finished && !reply.exercise);

      const summary = rs.finished && s.answers.length ? { ...score(s.answers), total: s.total, states: taskStates(s) } : null;
      const message = { id: uid(), at: Date.now(), role: 'tutor', reply, modelText, summary };
      return {
        ...c,
        session: s,
        stage: s.topicId && s.started ? 'practice' : 'topic',
        modelOptions: reply.options,
        messages: [...c.messages, message],
      };
    });

    // the tutor changed a setting because the student asked in the chat
    if (rs.level !== sent.level) changeLevel(rs.level, { tellTutor: false });
    if (rs.difficulty !== sent.difficulty) changeDifficulty(rs.difficulty, { tellTutor: false });
    if (reply.panelView) changeView(reply.panelView);

    if (answered) {
      const s = convoRef.current.session;
      const topic = topicsRef.current.find((x) => x.id === s.topicId);
      setHistory(recordSession({
        id: s.id,
        topicId: s.topicId,
        topicName: s.topicName || topic?.short || '',
        scenario: s.scenario,
        level: prefsRef.current.level,
        difficulty: prefsRef.current.difficulty,
        ...score(s.answers),
        total: s.total,
        updatedAt: Date.now(),
        mistakes: s.answers.filter((a) => !a.correct).slice(-5)
          .map(({ studentAnswer, corrected, rule }) => ({ studentAnswer, corrected, rule })),
      }));
    }
  }

  // ---------- what the screen shows ----------
  const { stage, session, messages, modelOptions, localOptions } = convo;

  const optionGroups = useMemo(() => {
    if (stage === 'loading' || stage === 'name' || stage === 'code') return [];
    const groups = [];
    const taken = new Set();
    const chips = (list, style) => list.filter((x) => !taken.has(x.toLowerCase()) && taken.add(x.toLowerCase())).map((text) => ({ text, style }));

    if (localOptions) groups.push({ label: localOptions.label, chips: chips(localOptions.chips.map((c) => c.text), 'outline') });
    if (modelOptions.length) groups.push({ label: t('groupNow'), chips: chips(modelOptions, 'soft') });

    if (stage === 'topic') {
      const forLevel = topics.filter((x) => x.levels.includes(prefs.level));
      const list = forLevel.length ? forLevel : topics;
      if (list.length) {
        groups.push({
          label: forLevel.length ? t('groupTopics', { level: prefs.level }) : t('groupTopicsAll'),
          chips: chips(list.map((x) => x.short), 'outline'),
        });
      }
      groups.push({ label: t('groupTopic'), chips: chips([t('chipGrammar'), t('chipVocab')], 'outline') });
    } else {
      const practising = session.finished
        ? [t('chipRepeat')]
        : [t('chipHint'), t('chipRule'), t('chipSkip'), t('chipRepeat')];
      groups.push({ label: t('groupPractising'), chips: chips(practising, 'soft') });
      groups.push({
        label: t('groupTopic'),
        chips: chips([t('chipGrammar'), t('chipVocab'), t('chipRoleplay'), t('chipChangeTopic')], 'outline'),
      });
    }
    return groups.filter((g) => g.chips.length);
  }, [stage, session.finished, modelOptions, localOptions, topics, prefs.level]);

  const status = stage === 'topic' ? t('statusChoosing')
    : stage === 'practice' ? (session.finished ? t('statusFinished') : session.exerciseType === 'roleplay' ? t('statusRoleplay') : t('statusLesson'))
      : t('statusStarting');

  const topic = topics.find((x) => x.id === session.topicId);
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
        onChangeName={changeName}
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
          slow={slow}
          error={error?.text}
          onRetry={error?.retry}
          stage={stage}
          onSend={handleSend}
          inputRef={inputRef}
        />
        <SessionPanel
          level={prefs.level}
          difficulty={prefs.difficulty}
          view={prefs.view}
          onLevel={(v) => changeLevel(v)}
          onDifficulty={(v) => changeDifficulty(v)}
          onView={changeView}
          session={session}
          topic={topic}
          recent={recent}
        />
      </main>
    </div>
  );
}
