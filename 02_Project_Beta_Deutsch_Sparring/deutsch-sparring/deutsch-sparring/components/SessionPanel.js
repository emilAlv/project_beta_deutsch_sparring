'use client';

import { t, LOCALE, dirKey } from '../lib/ui-text';
import { compareAnswer } from '../lib/diff';
import { score, scoreLine, conversationExamples, taskStates, headlineKey, ruleRows } from '../lib/stats';
import { ProgressTrack } from './Chat';
import { Marked } from './Rich';
import SceneArt from './SceneArt';
import { Check, MessageCircle, Sprout } from './icons';
import { withSentences } from '../lib/session-settings';

// Arrow keys move between the buttons of a group (radio buttons and tabs work like this).
function arrowKeys(options, value, onChange) {
  return (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = options[(options.indexOf(value) + step + options.length) % options.length];
    onChange(next);
    const buttons = e.currentTarget.querySelectorAll('button');
    buttons[options.indexOf(next)]?.focus();
  };
}

const VIEWS = ['glance', 'progress', 'grammar'];
const isVocab = (session) => session.topicType === 'Wortschatz';

// Right column: "Your session" – the three views as tabs. The settings are fixed for the
// session (setup screen) and shown in the ribbon above the chat, so there is no settings card here.
export default function SessionPanel({ view, onView, session, topic, recent }) {
  return (
    <aside className="session-panel" aria-label={t('panelTitle')}>
      <div className="segmented tabs" role="tablist" aria-label={t('views')} onKeyDown={arrowKeys(VIEWS, view, onView)}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`tab-${v}`}
            aria-selected={view === v}
            tabIndex={view === v ? 0 : -1}
            aria-controls="panel-view"
            className={view === v ? 'on' : ''}
            onClick={() => onView(v)}
          >
            {t(`view_${v}`)}
          </button>
        ))}
      </div>

      <div id="panel-view" role="tabpanel" aria-labelledby={`tab-${view}`} className="view">
        {view === 'glance' && <GlanceView session={session} topic={topic} recent={recent} />}
        {view === 'progress' && <ProgressView session={session} />}
        {view === 'grammar' && <GrammarView session={session} />}
      </div>

      <p className="panel-hint"><MessageCircle size={16} /> <span>{t('panelHint')}</span></p>
    </aside>
  );
}

function topicLine(session, topic) {
  if (!session.topicId) return null;
  const type = session.topicId === 'free' ? t('type_free') : t(`type_${topic?.type || 'Gemischt'}`);
  const name = session.topicName || topic?.short || '';
  return { type, name };
}

// "Flashcards · EN → DE + sentences" or "Exercises · gap fill"
function modeLine(session) {
  if (!session.topicId) return null;
  const st = session.settings || {};
  if (isVocab(session)) {
    return { name: t('flashcards'), detail: `${t(`dirShort_${dirKey(st.direction)}`)}${withSentences(st) ? ` ${t('withSentences')}` : ''}` };
  }
  return { name: t('modeExercises'), detail: session.lastType ? t(`ex_${session.lastType}`) : '' };
}

function LessonProgress({ session }) {
  return (
    <div className="lesson-progress">
      <p className="progress-label">
        <span>{t('lessonProgress')}</span>
        <span className="muted">{t('questionsOf', { n: session.answers.length, total: session.total })}</span>
      </p>
      <ProgressTrack states={taskStates(session)} />
    </div>
  );
}

function GlanceView({ session, topic, recent }) {
  const tl = topicLine(session, topic);
  const ml = modeLine(session);
  const sc = score(session.answers);
  const rows = ruleRows(session.answers);
  const level = session.settings?.level;
  return (
    <>
      <section className="card lesson">
        <p className="lesson-status">
          <span className="caps">{t('currentLesson')}</span>
          <span className="synced"><span className="dot" aria-hidden="true" />{t('synced')}</span>
        </p>
        {level && (
          <>
            <div className="level-row">
              <span className="level-big">{level}</span>
              <span>
                <span className="level-name">{t(`levelName_${level}`)}</span>
                <span className="level-caption">{t('levelCaption')}</span>
              </span>
            </div>
            <hr />
          </>
        )}
        <div className="indicator">
          <p className="caps">{t('topic')}</p>
          {tl ? (
            <>
              <div className="scene">
                <SceneArt subject={`${tl.name} ${topic?.title || ''}`} />
                <p className="scene-name">{tl.name || tl.type}</p>
              </div>
              <p className="detail">
                {tl.type}{session.grammarFocus ? ` · ${t('grammarFocusLine', { rule: session.grammarFocus.title })}` : ''}
              </p>
            </>
          ) : (
            <p className="scene-empty">{t('topicEmpty')}</p>
          )}
        </div>
        {ml && (
          <div className="indicator">
            <p className="caps">{t('mode')}</p>
            <p className="value">{ml.name}</p>
            <p className="detail capitalize">{[ml.detail, t('questionsOf', { n: session.answers.length, total: session.total })].filter(Boolean).join(' · ')}</p>
          </div>
        )}
      </section>

      <section className="card performance">
        <p className="caps">{t('howYoureDoing')}</p>
        <div className="perf-summary">
          <div>
            <p className="headline">{t(headlineKey(sc))}</p>
            <p className="detail">{sc.done === 0 ? t('basedOnNone') : scoreLine(sc, t)}</p>
          </div>
          {sc.answered > 0 && (
            <div className="perf-score">
              <p><span className="big">{sc.correct}</span><span className="of"> / {sc.answered}</span></p>
              <p className="tiny">{t('correctLabel')}</p>
            </div>
          )}
        </div>
        {rows.length > 0 && (
          <ul className="rule-rows">
            {rows.map((r) => (
              <li key={r.rule}>
                <span>{r.rule}</span>
                {r.ok
                  ? <span className="on-target">{t('onTarget')} <Check size={14} strokeWidth={2.4} /></span>
                  : <span className="keep">{t('keepPractising')} <Sprout size={14} /></span>}
              </li>
            ))}
          </ul>
        )}
        <hr />
        <LessonProgress session={session} />
      </section>

      {recent.length > 0 && (
        <section className="card recent">
          <p className="caps">{t('recentSessions')}</p>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <span>
                  <span className="recent-topic">{r.topicName || '—'}</span>
                  <span className="muted"> · {new Date(r.updatedAt).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
                </span>
                <span className="recent-score">{scoreLine(r, t)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ProgressView({ session }) {
  const sc = score(session.answers);
  const lastGap = [...session.answers].reverse().find((a) => !a.correct && !a.skipped);
  return (
    <>
      {lastGap ? <GapCard a={lastGap} /> : sc.answered > 0 && (
        <section className="card no-gap">
          <p className="caps">{t('gapTitle')}</p>
          <p className="gap-name">{t('noGapTitle')}</p>
          <p className="detail">{t('noGapText')}</p>
        </section>
      )}

      <section className="card answers">
        <p className="answers-head">
          <span className="caps">{t('yourAnswers')}</span>
          {sc.done > 0 && <span className="answers-score">{scoreLine(sc, t)}</span>}
        </p>
        {sc.done === 0 ? (
          <p className="detail">{t('noAnswers')}</p>
        ) : (
          <ul className="answer-list">
            {[...session.answers].reverse().map((a) => <AnswerRow key={a.n} a={a} />)}
          </ul>
        )}
        <hr />
        <LessonProgress session={session} />
      </section>
    </>
  );
}

// One answer: "N · type", the question, what the student wrote, the correction, a right / to-repeat tag.
// Older saved answers keep the question in line / skippedLine; without any, the line is left out.
function AnswerRow({ a }) {
  const type = a.qType || a.kind;
  const typeName = type && t(`ex_${type}`);
  const meta = [a.n, typeName !== `ex_${type}` && typeName].filter(Boolean).join(' · ');
  const question = a.question || a.line || a.skippedLine;
  // right = green · wrong = amber "to repeat" · skipped = neutral "– Skipped" (not a mistake)
  const tag = a.skipped
    ? <span className="answer-tag neutral">{t('tagSkipped')}</span>
    : a.correct
      ? <span className="answer-tag">✓ {t('tagRight')}</span>
      : <span className="answer-tag">✗ {t('tagRepeat')}</span>;
  const state = a.skipped ? 'skipped' : a.correct ? 'right' : 'wrong';
  return (
    <li className={state}>
      <span className="mark" aria-hidden="true">{a.correct ? '✓' : a.skipped ? '–' : '✗'}</span>
      <span>
        <span className="answer-meta"><span>{meta}</span>{tag}</span>
        {question && <span className="answer-question">{question}</span>}
        {a.skipped ? (
          <span className="answer-you">{t('answerYou')} {t('skipped')}</span>
        ) : (
          <span className="answer-you">
            {t('answerYou')} <span className={a.correct ? undefined : 'struck'}>{a.studentAnswer}</span>
          </span>
        )}
        {!a.correct && a.corrected && <span className="answer-right">{t('answerRight')} {a.corrected}</span>}
      </span>
    </li>
  );
}

function GapCard({ a }) {
  const d = compareAnswer(a.studentAnswer, a.corrected, a.changedWords);
  return (
    <section className="card gap">
      <p className="gap-head">
        <span className="caps">{t('gapTitle')}</span>
        <Sprout size={14} />
      </p>
      <p className="gap-name">{a.rule || t('gapTitle')}</p>
      {a.explanation && <p className="detail">{a.explanation.replace(/\*/g, '')}</p>}
      <div className="evidence">
        <p className="caps amber">{t('yourAnswer')}</p>
        <p className="evidence-answer">„<Marked segments={d.answer} as="s" />“</p>
        <p className="caps brand">{t('corrected')}</p>
        <p className="evidence-fixed">„<Marked segments={d.corrected} as="strong" className="fixed" />“</p>
      </div>
    </section>
  );
}

function GrammarView({ session }) {
  const g = session.grammarFocus;
  if (!g) {
    return (
      <section className="card grammar">
        <p className="caps">{t('grammarFocus')}</p>
        <p className="detail">{t('noGrammar')}</p>
      </section>
    );
  }
  // two examples from this conversation: a corrected mistake first, then a right answer
  const examples = conversationExamples(session);
  return (
    <section className="card grammar">
      <p className="caps">{t('grammarFocus')}</p>
      <h3 className="grammar-title">{g.title}</h3>
      <p className="grammar-rule">{g.rule}</p>
      {g.boxes.length > 0 && (
        <div className="rule-boxes">
          {g.boxes.map((b) => (
            <div key={b.label} className="rule-box">
              <p className="rule-box-label">{b.label}</p>
              <p className="rule-box-value">{b.value}</p>
              <p className="rule-box-note">{b.note}</p>
            </div>
          ))}
        </div>
      )}
      {examples.length > 0 && (
        <>
          <p className="caps">{t('fromConversation')}</p>
          <ul className="examples">
            {examples.map((a) => {
              const d = compareAnswer(a.studentAnswer, a.corrected, a.changedWords);
              return (
                <li key={a.n}>
                  <p>„{a.correct ? a.corrected : <Marked segments={d.corrected} as="strong" className="fixed" />}“</p>
                  {a.rule && <p className="tiny">{a.rule}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {g.watchOut && (
        <div className="watch-out">
          <p className="caps amber">{t('watchOut')}</p>
          <p>{g.watchOut}</p>
        </div>
      )}
    </section>
  );
}
