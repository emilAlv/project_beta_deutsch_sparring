'use client';

// The coach on the Home page (right column): a chat that recommends what to practise and can propose
// changes to the plan. The coach only PROPOSES: "Set up this session" opens the setup screen prefilled,
// plan changes are applied only after "Apply" (and checked again against the goal, lib/coach.js).
// The messages are saved per student (last 30): database when logged in, this browser otherwise.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { fmtDay } from '../lib/dates';
import { dayKey, coachTriedDay, setCoachTriedDay } from '../lib/storage';
import { loadCoachMessages, saveCoachMessages, askCoach } from '../lib/coach-client';
import { suggestionToSetup, MAX_MESSAGES } from '../lib/coach';
import { newGoalId } from '../lib/goals';
import { ArrowUp } from './icons';

const CHIPS = ['today', 'plan', 'weak'];
const MAX_INPUT = 500;

function topicName(topic, topics) {
  if (!topic) return '';
  const parent = topic.parent && topics.find((x) => x.id === topic.parent);
  return parent ? `${parent.short} › ${topic.short}` : topic.short;
}

function SuggestionBox({ suggestion, topics, onSetup }) {
  const topic = topics.find((x) => x.id === suggestion.topicId);
  if (!topic) return null;
  const line = t('coachSuggestLine', {
    topic: topicName(topic, topics), level: suggestion.level, difficulty: t(`diff_${suggestion.difficulty}`), n: suggestion.questions,
  });
  return (
    <div className="coach-box">
      <p className="caps brand">{t('coachSuggested')}</p>
      <p className="coach-box-line">{line}</p>
      <button type="button" className="button-primary coach-box-button" onClick={() => onSetup(suggestion)}>{t('coachSetup')}</button>
    </div>
  );
}

function changeText(c) {
  if (c.action === 'add') return t('coachPlanAdd', { title: c.title, date: fmtDay(c.date, true), target: c.target });
  if (c.action === 'move') return t('coachPlanMove', { title: c.title, date: fmtDay(c.date, true) });
  return t('coachPlanRemove', { title: c.title });
}

function PlanBox({ plan, goals, busy, error, onApply, onKeep }) {
  const goal = goals.find((g) => g.id === plan.goalId);
  return (
    <div className="coach-box">
      <p className="caps brand">{t('coachPlanLabel')}</p>
      {goal && <p className="detail">{t('coachPlanGoal', { goal: goal.title })}</p>}
      <ul className="coach-changes">
        {plan.changes.map((c, i) => (
          <li key={i} className={c.action}>{changeText(c)}</li>
        ))}
      </ul>
      {plan.status === 'open' ? (
        <div className="coach-actions">
          <button type="button" className="button-primary small" disabled={busy} onClick={onApply}>{busy ? t('coachApplying') : t('coachApply')}</button>
          <button type="button" className="button-outline small" disabled={busy} onClick={onKeep}>{t('coachKeep')}</button>
        </div>
      ) : (
        <p className="detail">{t({ applied: 'coachApplied', kept: 'coachKept', replaced: 'coachReplaced' }[plan.status])}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

// name / classCode / clientId: for the server (class code when accounts are off)
// goals: the goals as the Home page shows them now; onApplyPlan(goalId, changes) → { ok, error? } saves and reloads Home
export default function Coach({ name, classCode, clientId, goals, topics, today, onSetup, onApplyPlan }) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [applying, setApplying] = useState('');
  const [planErrors, setPlanErrors] = useState({});
  const msgsRef = useRef([]);
  const busyRef = useRef(false);
  const lastAsk = useRef('chat');
  const started = useRef(false);
  const logRef = useRef(null);

  // state + the saved copy together
  function commit(next) {
    msgsRef.current = next.slice(-MAX_MESSAGES);
    setMessages(msgsRef.current);
    saveCoachMessages(msgsRef.current);
  }

  // text = what the student wrote (null: ask again with the messages as they are); kind = 'chat' | 'greeting'
  async function ask(textToSend, kind = 'chat') {
    if (busyRef.current) return;
    busyRef.current = true;
    lastAsk.current = kind;
    setBusy(true);
    setError('');
    if (textToSend) commit([...msgsRef.current, { id: newGoalId('c'), role: 'student', text: textToSend, at: Date.now() }]);
    const res = await askCoach({ messages: msgsRef.current, kind, name, classCode, clientId, today });
    busyRef.current = false;
    setBusy(false);
    if (!res.coach) {
      const msg = t(`coachErr_${res.code}`) === `coachErr_${res.code}` ? t('coachErr_server') : t(`coachErr_${res.code}`);
      setError(res.detail ? `${msg} (${res.detail})` : msg);
      return;
    }
    const c = res.coach;
    const reply = { id: newGoalId('c'), role: 'coach', text: c.message, at: Date.now() };
    if (kind === 'greeting') reply.auto = true;
    if (c.suggestedSession) reply.suggestion = c.suggestedSession;
    if (c.planChanges) reply.plan = { ...c.planChanges, status: 'open' };
    if (c.quickReplies?.length) reply.quick = c.quickReplies;
    // an older open suggestion is replaced by the new one
    const before = c.planChanges
      ? msgsRef.current.map((m) => (m.plan?.status === 'open' ? { ...m, plan: { ...m.plan, status: 'replaced' } } : m))
      : msgsRef.current;
    commit([...before, reply]);
  }

  // load the saved messages; greet by itself at most once a day (a coach message from today, or an earlier
  // try today, means: only answer when the student writes)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const saved = await loadCoachMessages();
      msgsRef.current = saved;
      setMessages(saved);
      setLoaded(true);
      const day = dayKey();
      if (saved.some((m) => m.role === 'coach' && dayKey(m.at) === day) || coachTriedDay() === day) return;
      setCoachTriedDay(day);
      ask(null, 'greeting');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow new messages
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error]);

  function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busyRef.current) return;
    setText('');
    ask(value.slice(0, MAX_INPUT));
  }

  function setPlanStatus(id, status) {
    commit(msgsRef.current.map((m) => (m.id === id && m.plan ? { ...m, plan: { ...m.plan, status } } : m)));
  }

  async function apply(msg) {
    setApplying(msg.id);
    setPlanErrors((e) => ({ ...e, [msg.id]: '' }));
    const out = await onApplyPlan(msg.plan.goalId, msg.plan.changes);
    setApplying('');
    if (out?.ok) setPlanStatus(msg.id, 'applied');
    else setPlanErrors((e) => ({ ...e, [msg.id]: out?.stale ? t('coachPlanStale') : t('coachPlanSaveError') }));
  }

  // day labels between the messages
  let lastDay = '';
  const last = messages.at(-1);
  const chips = !loaded || busy ? [] : last?.role === 'coach' ? last.quick || [] : !messages.length ? CHIPS.map((k) => t(`coachChip_${k}`)) : [];

  return (
    <section className="card coach-card" aria-label={t('coachTitle')}>
      <header className="coach-head">
        <span className="avatar-w" aria-hidden="true">w</span>
        <div>
          <h2 className="coach-name">{t('coachTitle')}</h2>
          <p className="detail">{t('coachSub')}</p>
        </div>
      </header>

      <div className="coach-log" ref={logRef} role="log" aria-live="polite" aria-label={t('coachMessages')}>
        {loaded && !messages.length && !busy && <p className="muted coach-empty">{t('coachEmpty')}</p>}
        {messages.map((m) => {
          const day = dayKey(m.at);
          const label = day !== lastDay ? (day === dayKey() ? t('coachToday') : fmtDay(day)) : null;
          lastDay = day;
          return (
            <div key={m.id} className="coach-item">
              {label && <p className="caps coach-day">{label}</p>}
              {m.role === 'student' ? (
                <div className="coach-row student"><p className="coach-bubble student">{m.text}</p></div>
              ) : (
                <div className="coach-row">
                  <div className="coach-bubble coach">
                    <p className="coach-text">{m.text}</p>
                    {m.suggestion && <SuggestionBox suggestion={m.suggestion} topics={topics} onSetup={onSetup} />}
                    {m.plan && (
                      <PlanBox
                        plan={m.plan}
                        goals={goals}
                        busy={applying === m.id}
                        error={planErrors[m.id]}
                        onApply={() => apply(m)}
                        onKeep={() => setPlanStatus(m.id, 'kept')}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {busy && <p className="detail coach-thinking">{t('coachThinking')}</p>}
        {error && (
          <p className="form-error coach-error" role="alert">
            {error}{' '}
            <button type="button" className="text-button" onClick={() => ask(null, lastAsk.current)}>{t('coachRetry')}</button>
          </p>
        )}
        {!!chips.length && (
          <div className="coach-chips">
            {chips.map((c) => (
              <button key={c} type="button" className="chip chip-outline small" onClick={() => ask(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <form className="coach-composer" onSubmit={submit}>
        <input
          className="coach-input"
          type="text"
          value={text}
          maxLength={MAX_INPUT}
          placeholder={t('coachPlaceholder')}
          aria-label={t('coachPlaceholder')}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="send coach-send" disabled={busy || !text.trim()} aria-label={t('coachSend')}>
          <ArrowUp size={18} />
        </button>
      </form>
    </section>
  );
}
