'use client';

// The coach on the Home page (right column): a chat that recommends what to practise AND where goals are made (R12).
//  - A new goal: the student says what they want; the app builds the plan from a template and the chat shows it as a
//    PREVIEW card (parts, first milestones, a "doesn't fit" box with fixes). The goal is saved only when the student taps Accept.
//  - Changes to a goal (name, end date, time per day): a before → after card, saved only after Apply.
//  - The coach only PROPOSES; names and dates come from the templates, never from the model.
// The messages are saved per student (last 30): database when logged in, this browser otherwise.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { fmtDay } from '../lib/dates';
import { dayKey, coachTriedDay, setCoachTriedDay } from '../lib/storage';
import { loadCoachMessages, saveCoachMessages, askCoach } from '../lib/coach-client';
import { suggestionToSetup, MAX_MESSAGES } from '../lib/coach';
import { newGoalId } from '../lib/goals';
import { ArrowUp } from './icons';

const MAX_INPUT = 500;

function topicName(topic, topics) {
  if (!topic) return '';
  const parent = topic.parent && topics.find((x) => x.id === topic.parent);
  return parent ? `${parent.short} › ${topic.short}` : topic.short;
}

function SuggestionBox({ suggestion, topics, onSetup }) {
  const topic = topics.find((x) => x.id === suggestion.topicId);
  // tied to a milestone of the plan (R15): the same one the Home page shows as "Next up"; the setup screen stays free
  const forMilestone = Boolean(suggestion.milestoneId && suggestion.title);
  if (!topic && !forMilestone) return null;
  const line = forMilestone
    ? t('coachSuggestNext', { title: suggestion.title, difficulty: t(`diff_${suggestion.difficulty}`), n: suggestion.questions })
    : t('coachSuggestLine', {
      topic: topicName(topic, topics), level: suggestion.level, difficulty: t(`diff_${suggestion.difficulty}`), n: suggestion.questions,
    });
  return (
    <div className="coach-box">
      <p className="caps brand">{t('coachSuggested')}</p>
      <p className="coach-box-line">{line}</p>
      {forMilestone && <p className="detail">{t('coachSuggestFree')}</p>}
      <button type="button" className="button-primary coach-box-button" onClick={() => onSetup(suggestion)}>{t('coachSetup')}</button>
    </div>
  );
}

// ---------- a goal preview ----------
// what a fix of the generator does, in words: "30 minutes a day + leave out course-only words"
function fixLabel(fix) {
  const l = fix.lever;
  const bits = [];
  if (l.minutesPerDay) bits.push(t('gpFix_minutes', { n: l.minutesPerDay }));
  if (l.cut?.includes('kursWords')) bits.push(t('gpFix_kurs'));
  if (l.cut?.includes('receptiveIntroduced')) bits.push(t('gpFix_receptive'));
  if (l.endDate) bits.push(t('gpFix_endDate', { date: fmtDay(l.endDate, true) }));
  return bits.join(' + ');
}

function ProposalBox({ proposal, busy, error, onAccept, onChange, onFix }) {
  const { preview: p, request, status } = proposal;
  const open = status === 'open';
  const tight = p.tight;
  return (
    <div className="coach-box goal-preview">
      <p className="caps brand">{t('goalSuggested')}</p>
      <p className="coach-box-line">{p.title}</p>
      <p className="detail">
        {t('gpParts', { n: p.parts.length, m: p.milestones })}
        {p.finishesOn ? ` · ${t('gpUntil', { date: fmtDay(p.finishesOn, true) })}` : ''}
        {` · ${t('pace_minutes', { n: request.minutesPerDay })}`}
      </p>
      <ul className="gp-parts">
        {p.parts.map((part, i) => (
          <li key={i}>
            <span className="gp-part">{part.title}</span>
            <span className="detail">
              {part.words ? `${t('gpWords', { n: part.words })} · ` : ''}{t('gpMilestones', { n: part.count })}
            </span>
            {part.first[0] && (
              <span className="detail gp-first">{t('gpFirst', { title: part.first[0].title, date: part.first[0].date ? fmtDay(part.first[0].date) : '–' })}</span>
            )}
          </li>
        ))}
      </ul>
      {p.bufferDays > 0 && <p className="detail">{t('gpExamBuffer', { n: p.bufferDays })}</p>}
      {p.alreadySolid > 0 && <p className="detail">{t('gpSolid', { n: p.alreadySolid })}</p>}
      {p.courseWords > 0 && <p className="detail">{t('gpCourse', { n: p.courseWords })}</p>}

      {tight && (
        <div className="coach-warn" role="group" aria-label={t('gpNoFitTitle')}>
          <p className="gp-warn-title">{t('gpNoFitTitle')}</p>
          <p className="detail">
            {tight.examDate
              ? t('gpNoFitExam', { date: fmtDay(tight.needsUntil, true), exam: fmtDay(tight.examDate, true) })
              : t('gpNoFit', { date: fmtDay(tight.needsUntil, true), weeks: tight.weeksOver })}
          </p>
          {tight.byPlanEnd.filter((x) => x.of > 0 && x.milestones < x.of).slice(0, 2).map((x, i) => (
            <p className="detail" key={i}>
              {x.words != null ? t('gpByEndWords', { n: x.words, of: x.wordsOf, part: x.title }) : t('gpByEndSteps', { n: x.milestones, of: x.of, part: x.title })}
            </p>
          ))}
          {open && !!tight.fixes.length && (
            <>
              <p className="detail gp-fix-intro">{t('gpFixIntro')}</p>
              <div className="gp-fixes">
                {tight.fixes.map((fix, i) => (
                  <button key={i} type="button" className="chip chip-outline small gp-fix" disabled={busy} onClick={() => onFix(fix.lever)}>
                    {fixLabel(fix)} <span className="detail">({fix.fits ? t('gpFixFits') : t('gpFixLonger', { date: fmtDay(fix.needsUntil, true) })})</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {open ? (
        <div className="coach-actions">
          <button type="button" className="button-primary small" disabled={busy} onClick={onAccept}>{busy ? t('gpSaving') : t('gpAccept')}</button>
          <button type="button" className="button-outline small" disabled={busy} onClick={onChange}>{t('gpChange')}</button>
        </div>
      ) : (
        <p className="detail">{t({ accepted: 'gpAccepted', changed: 'gpChanged', replaced: 'coachReplaced' }[status])}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

// ---------- a change to a goal (name, end date, time per day): before → after ----------
function changeText(c) {
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? fmtDay(x, true) : x);
  if (c.type === 'rename') return t('cpRename', { from: c.from, to: c.to });
  if (c.type === 'pace') return t('cpPace', { from: c.from, to: c.to });
  if (c.type === 'endDate') return t('cpEnd', { from: d(c.from), to: d(c.to) });
  if (c.type === 'move') return t('cpMove', { title: c.title, from: d(c.from) || '–', to: d(c.to) });
  return t('cpFocus');
}

function PlanBox({ plan, goals, busy, error, onApply, onKeep }) {
  const goal = goals.find((g) => g.id === plan.goalId);
  return (
    <div className="coach-box">
      <p className="caps brand">{t('coachPlanLabel')}</p>
      {goal && <p className="detail">{t('coachPlanGoal', { goal: goal.title })}</p>}
      <ul className="coach-changes">
        {plan.changes.map((c, i) => (
          <li key={i} className={c.type === 'move' ? 'move' : ''}>{changeText(c)}</li>
        ))}
        {plan.more > 0 && <li className="move">{t('cpMore', { n: plan.more })}</li>}
      </ul>
      {plan.finishAfter && (
        <p className="detail cp-finish">
          {plan.finishBefore && plan.finishBefore !== plan.finishAfter
            ? t('cpFinish', { from: fmtDay(plan.finishBefore, true), to: fmtDay(plan.finishAfter, true) })
            : t('cpFinishNow', { to: fmtDay(plan.finishAfter, true) })}
          {plan.fits && plan.endDate ? ` · ${t(goal?.isExam ? 'cpFitsExam' : 'cpFits', { end: fmtDay(plan.endDate, true) })}` : ''}
        </p>
      )}
      {!plan.fits && plan.needsUntil && <p className="detail">{t('cpNoFit', { date: fmtDay(plan.needsUntil, true) })}</p>}
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
// goals: the goals as the Home page shows them now
// lastSession: the newest saved session { id, answered, correct } – a short local line (no AI) is added once after it ends
// starter: { n, text } – "+ New goal" on Home sends a starter message (n counts up so the same text can be sent again)
// onAcceptGoal(proposal) / onFix(request, lever) / onApplyPlan(plan): Home does the saving and the calls to /api/plan
export default function Coach({ name, classCode, clientId, goals, topics, today, starter, lastSession, running, onSetup, onAcceptGoal, onFix, onApplyPlan }) {
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
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const handledStarter = useRef(0);

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
    if (c.goalProposal) reply.proposal = c.goalProposal;
    if (c.planChanges) reply.plan = c.planChanges;
    if (c.quickReplies?.length) reply.quick = c.quickReplies;
    // an older open card is replaced by the new one
    const before = c.goalProposal || c.planChanges
      ? msgsRef.current.map((m) => ({
        ...m,
        ...(c.goalProposal && m.proposal?.status === 'open' ? { proposal: { ...m.proposal, status: 'replaced' } } : {}),
        ...(c.planChanges && m.plan?.status === 'open' ? { plan: { ...m.plan, status: 'replaced' } } : {}),
      }))
      : msgsRef.current;
    commit([...before, reply]);
  }

  // load the saved messages; greet by itself at most once a day (a coach message from today, or an earlier
  // try today, means: only answer when the student writes)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let saved = await loadCoachMessages();
      // a session has just ended: one local line, no AI call (the id keeps it from coming twice)
      const sid = lastSession && !running && lastSession.answered > 0 ? `s-${String(lastSession.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36)}` : '';
      if (sid && !saved.some((m) => m.id === sid) && dayKey(lastSession.updatedAt || Date.now()) === dayKey()) {
        saved = [...saved, {
          id: sid, role: 'coach', auto: true, at: Date.now(),
          text: t('coachLineSession', { correct: lastSession.correct, answered: lastSession.answered }),
          quick: [t('coachChip_today'), t('coachChip_weak')],
        }].slice(-MAX_MESSAGES);
        saveCoachMessages(saved);
      }
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

  // "+ New goal" on Home: the starter message goes to the coach as if the student had typed it
  useEffect(() => {
    if (!starter?.n || !loaded || busy || handledStarter.current === starter.n) return;
    handledStarter.current = starter.n;
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    ask(starter.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starter, loaded, busy]);

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

  const setCard = (id, key, status) => commit(msgsRef.current.map((m) => (m.id === id && m[key] ? { ...m, [key]: { ...m[key], status } } : m)));
  const setError2 = (id, msg) => setPlanErrors((e) => ({ ...e, [id]: msg }));

  async function apply(msg) {
    setApplying(msg.id);
    setError2(msg.id, '');
    const out = await onApplyPlan(msg.plan);
    setApplying('');
    if (out?.ok) setCard(msg.id, 'plan', 'applied');
    else setError2(msg.id, out?.stale ? t('coachPlanStale') : t('coachPlanSaveError'));
  }

  async function accept(msg) {
    setApplying(msg.id);
    setError2(msg.id, '');
    const out = await onAcceptGoal(msg.proposal);
    setApplying('');
    if (out?.ok) {
      setCard(msg.id, 'proposal', 'accepted');
      // a local line, no AI call
      commit([...msgsRef.current, { id: newGoalId('c'), role: 'coach', auto: true, at: Date.now(), text: t('coachLineGoal', { title: msg.proposal.preview.title }), quick: [t('coachChip_today'), t('coachChip_plan')] }]);
    } else setError2(msg.id, t('gpSaveError'));
  }

  // one of the generator's fixes: the same goal previewed again, as a new card
  async function fix(msg, lever) {
    setApplying(msg.id);
    setError2(msg.id, '');
    const out = await onFix(msg.proposal.request, lever);
    setApplying('');
    if (!out?.ok) {
      setError2(msg.id, t('gpFixError'));
      return;
    }
    const reply = { id: newGoalId('c'), role: 'coach', text: t('gpFixText'), at: Date.now(), proposal: { ...out.proposal, status: 'open' } };
    commit([...msgsRef.current.map((m) => (m.id === msg.id ? { ...m, proposal: { ...m.proposal, status: 'replaced' } } : m)), reply]);
  }

  // "Change": the student tells the coach what to change (the coach is asked on the next message)
  function change(msg) {
    commit([
      ...msgsRef.current.map((m) => (m.id === msg.id ? { ...m, proposal: { ...m.proposal, status: 'changed' } } : m)),
      { id: newGoalId('c'), role: 'coach', text: t('gpChangePrompt'), at: Date.now() },
    ]);
    inputRef.current?.focus();
  }

  // day labels between the messages
  let lastDay = '';
  const last = messages.at(-1);
  const defaultChips = goals.length ? ['today', 'plan', ...(goals.some((g) => g.isExam) ? [] : ['date']), 'weak'] : ['goal', 'today', 'weak'];
  // plan chips ("less time", "move my goal date") make no sense without a goal
  const planChip = /less time|redo my plan|goal date|minutes a day|weniger Zeit|Zieldatum/i;
  const quick = goals.length ? last?.quick || [] : (last?.quick || []).filter((c) => !planChip.test(c));
  const chips = !loaded || busy ? [] : last?.role === 'coach' ? quick : !messages.length ? defaultChips.map((k) => t(`coachChip_${k}`)) : [];

  return (
    <section className="card coach-card" aria-label={t('coachTitle')} ref={rootRef}>
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
                    {m.proposal && (
                      <ProposalBox
                        proposal={m.proposal}
                        busy={applying === m.id}
                        error={planErrors[m.id]}
                        onAccept={() => accept(m)}
                        onChange={() => change(m)}
                        onFix={(lever) => fix(m, lever)}
                      />
                    )}
                    {m.plan && !m.plan.legacy && (
                      <PlanBox
                        plan={m.plan}
                        goals={goals}
                        busy={applying === m.id}
                        error={planErrors[m.id]}
                        onApply={() => apply(m)}
                        onKeep={() => setCard(m.id, 'plan', 'kept')}
                      />
                    )}
                    {m.plan?.legacy && <p className="detail">{t('coachReplaced')}</p>}
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
          ref={inputRef}
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
