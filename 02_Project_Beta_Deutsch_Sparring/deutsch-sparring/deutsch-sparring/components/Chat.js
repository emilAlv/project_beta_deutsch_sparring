'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, LOCALE, dirKey } from '../lib/ui-text';
import { compareAnswer } from '../lib/diff';
import Rich, { Marked } from './Rich';
import { ArrowUp, Check, Pencil, Refresh, Square } from './icons';

const time = (at) => new Date(at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayLabel = (at) => (sameDay(at, Date.now())
  ? t('today')
  : new Date(at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }));

export default function Chat({ status, messages, busy, waiting, onCancel, slow, error, onRetry, stage, onSend, inputRef }) {
  const scrollRef = useRef(null);
  const stick = useRef(true);

  // follow new messages, unless the student scrolled up to read something
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (messages[messages.length - 1]?.role === 'user') stick.current = true; // own message: always follow
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error, slow]);

  return (
    <section className="card chat" aria-label="Chat">
      <header className="chat-head">
        <div>
          <h1 className="chat-title">{t('chatTitle')}</h1>
          <p className="chat-sub">{t('chatSubtitle')}</p>
        </div>
        <p className="live-status"><span className="dot" aria-hidden="true" />{status}</p>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-log" role="log" aria-live="polite" aria-relevant="additions">
          {messages.filter((m) => !m.hidden).map((m, i, shown) => {
            const prev = shown[i - 1];
            const marker = !prev || !sameDay(prev.at, m.at);
            return (
              <div key={m.id} className="chat-item">
                {marker && <DayMarker at={m.at} />}
                <Message m={m} />
              </div>
            );
          })}
          {busy && <Typing slow={slow} />}
          {error && (
            <div className="chat-error" role="alert">
              <span>{error}</span>
              {onRetry && (
                <button type="button" className="text-button" onClick={onRetry}>
                  <Refresh size={14} /> {t('retry')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <Composer stage={stage} busy={busy} waiting={waiting} onCancel={onCancel} onSend={onSend} inputRef={inputRef} />
    </section>
  );
}

function DayMarker({ at }) {
  return (
    <div className="day-marker" aria-hidden="true">
      <span>{dayLabel(at)} · {time(at)}</span>
    </div>
  );
}

function Message({ m }) {
  if (m.role === 'system') {
    return <p className="system-line"><span>{m.text}</span></p>;
  }
  if (m.role === 'user') {
    return (
      <div className="msg-user">
        <p className="bubble">{m.masked ? t('codeHidden') : m.text}</p>
        <p className="meta">{t('you')} · {time(m.at)}</p>
      </div>
    );
  }
  return <TutorMessage m={m} />;
}

function TutorMessage({ m }) {
  const r = m.reply;
  const text = r ? r.message : m.text;
  return (
    <div className="msg-tutor">
      <div className="avatar-w" aria-hidden="true">w</div>
      <div className="tutor-body">
        <p className="tutor-label"><strong>{t('tutorName')}</strong> · {t('tutorRole')}</p>
        {text && <p className="tutor-text"><Rich text={text} /></p>}
        {r?.feedback && <FeedbackCard f={r.feedback} />}
        {r?.exercise && (r.feedback ? <NextLine ex={r.exercise} /> : <ExerciseCard ex={r.exercise} />)}
        {m.summary && <SummaryCard s={m.summary} />}
      </div>
    </div>
  );
}

// "ENGLISH → GERMAN · CARD 3 OF 20" or "GAP FILL · QUESTION 3 OF 20"
function exLabel(ex) {
  return ex.type === 'flashcard'
    ? `${t(`dir_${dirKey(ex.direction)}`)} · ${t('cardOf', { n: ex.number, total: ex.total })}`
    : `${t(`ex_${ex.type}`)} · ${t('questionOf', { n: ex.number, total: ex.total })}`;
}

function ExerciseCard({ ex }) {
  return (
    <div className={`exercise-card${ex.type === 'flashcard' ? ' is-flashcard' : ''}`}>
      <p className="caps">{exLabel(ex)}</p>
      <p className="exercise-line">{ex.line}</p>
      {ex.hint && <p className="exercise-hint">{ex.hint}</p>}
    </div>
  );
}

// the next question right under a correction: same content, lighter (no card)
function NextLine({ ex }) {
  return (
    <div className={`next-line${ex.type === 'flashcard' ? ' is-flashcard' : ''}`}>
      <p className="caps">{exLabel(ex)}</p>
      <p className="exercise-line">{ex.line}</p>
      {ex.hint && <p className="exercise-hint"><span className="hint-accent">{ex.hint}</span></p>}
    </div>
  );
}

function FeedbackCard({ f }) {
  const d = compareAnswer(f.studentAnswer, f.corrected, f.changedWords);
  const label = f.correct ? t('feedbackSpotOn')
    : f.kind === 'flashcard' ? t('feedbackNotQuite')
      : d.changes <= 2 ? t('feedbackPolish') : t('feedbackFix');
  return (
    <div className={`feedback-card ${f.correct ? 'is-right' : 'is-wrong'}`}>
      <p className="caps feedback-label">
        {f.correct ? <Check size={15} strokeWidth={2.4} /> : <Pencil size={14} strokeWidth={2.2} />} {label}
      </p>
      <p className="feedback-sentence">
        {f.correct ? f.corrected : <Marked segments={d.corrected} as="strong" className="fixed" />}
      </p>
      {f.explanation && <p className="feedback-explain"><Rich text={f.explanation} /></p>}
    </div>
  );
}

function SummaryCard({ s }) {
  return (
    <div className="summary-card">
      <p className="caps">{s.ended ? t('summaryEnded') : t('summaryTitle')}</p>
      <p className="summary-score">
        {s.answered
          ? <><span className="big">{s.correct}</span><span className="of"> / {s.answered}</span></>
          : <span className="big">–</span>}
      </p>
      <p className="summary-caption">
        {s.answered ? `${t('summaryScore', s)} · ` : ''}{t('summaryDetail', { done: s.done, total: s.total })}
        {s.skipped > 0 && ` · ${t('summarySkipped', { n: s.skipped })}`}
      </p>
      <ProgressTrack states={s.states} />
    </div>
  );
}

export function ProgressTrack({ states }) {
  // many questions → thinner gaps, so 50 segments still fit
  const gap = states.length > 30 ? 1 : states.length > 15 ? 3 : 5;
  return (
    <div className="track" style={{ gap }} aria-hidden="true">
      {states.map((st, i) => <span key={i} className={`seg seg-${st}`} />)}
    </div>
  );
}

function Typing({ slow }) {
  return (
    <div className="msg-tutor typing" aria-label={t('typing')}>
      <div className="avatar-w" aria-hidden="true">w</div>
      <div className="tutor-body">
        <p className="tutor-label"><strong>{t('tutorName')}</strong> · {t('tutorRole')}</p>
        <p className="dots" aria-hidden="true"><span /><span /><span /></p>
        {slow && <p className="typing-slow">{t('typingSlow')}</p>}
      </div>
    </div>
  );
}

function Composer({ stage, busy, waiting, onCancel, onSend, inputRef }) {
  const [text, setText] = useState('');
  const placeholder = stage === 'name' ? t('inputPlaceholderName') : stage === 'code' ? t('inputPlaceholderCode') : t('inputPlaceholder');

  // grow with the text, up to ~5 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text, inputRef]);

  function submit(e) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return; // (while the tutor writes, the app only lets "stop" through)
    if (onSend(value) !== false) setText('');
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="input-row">
        <label htmlFor="chat-input" className="sr-only">{t('inputLabel')}</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          maxLength={1500}
          autoComplete={stage === 'code' ? 'off' : undefined}
          spellCheck={stage !== 'code'}
          autoFocus
        />
        {waiting ? (
          <button className="send stop" type="button" onClick={onCancel} aria-label={t('cancel')} title={t('cancel')}>
            <Square size={16} />
          </button>
        ) : (
          <button className="send" type="submit" disabled={busy || !text.trim()} aria-label={t('send')}>
            <ArrowUp size={21} />
          </button>
        )}
      </div>
      <div className="composer-foot">
        <span>{t('composerNote')}</span>
        <span>{t('enterToSend')}</span>
      </div>
    </form>
  );
}
