'use client';

import { t, LOCALE, dirKey } from '../lib/ui-text';
import { compareAnswer } from '../lib/diff';
import { score, taskStates, headlineKey, ruleRows } from '../lib/stats';
import { ProgressTrack } from './Chat';
import { Marked } from './Rich';
import SceneArt from './SceneArt';
import { Check, MessageCircle, Sprout } from './icons';

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

const LEVELS = ['A1', 'A2', 'B1'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUESTIONS = [10, 20, 30, 40, 50];
const DIRECTIONS = ['en-de', 'de-en', 'mixed'];
const VIEWS = ['glance', 'progress', 'grammar'];
const isVocab = (session) => session.topicType === 'Wortschatz';

// Right column: "Your session". Buttons here do the same as asking in the chat.
export default function SessionPanel({
  prefs, onLevel, onDifficulty, onQuestions, onDirection, onSentences, onView, session, topic, recent,
}) {
  const { view } = prefs;
  return (
    <aside className="session-panel" aria-label={t('panelTitle')}>
      <SettingsCard
        prefs={prefs}
        onLevel={onLevel}
        onDifficulty={onDifficulty}
        onQuestions={onQuestions}
        onDirection={onDirection}
        onSentences={onSentences}
        session={session}
        topic={topic}
      />

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
        {view === 'glance' && <GlanceView prefs={prefs} session={session} topic={topic} recent={recent} />}
        {view === 'progress' && <ProgressView session={session} />}
        {view === 'grammar' && <GrammarView session={session} />}
      </div>

      <p className="panel-hint"><MessageCircle size={16} /> <span>{t('panelHint')}</span></p>
    </aside>
  );
}

function Segmented({ label, options, value, onChange, render, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup" aria-label={label} onKeyDown={arrowKeys(options, value, onChange)}>
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          tabIndex={value === o || (!options.includes(value) && i === 0) ? 0 : -1}
          className={value === o ? 'on' : ''}
          onClick={() => value !== o && onChange(o)}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      <span className="switch-label">{label}</span>
    </button>
  );
}

function topicLine(session, topic) {
  if (!session.topicId) return null;
  const type = session.topicId === 'free' ? t('type_free') : t(`type_${topic?.type || 'Gemischt'}`);
  const name = session.topicName || topic?.short || '';
  return { type, name };
}

// "Flashcards · EN → DE + sentences" or "Exercises · gap fill"
function modeLine(session, prefs) {
  if (!session.topicId) return null;
  if (isVocab(session)) {
    return { name: t('flashcards'), detail: `${t(`dirShort_${dirKey(prefs.direction)}`)}${prefs.sentences ? ` ${t('withSentences')}` : ''}` };
  }
  return { name: t('modeExercises'), detail: session.lastType ? t(`ex_${session.lastType}`) : '' };
}

function SettingsCard({ prefs, onLevel, onDifficulty, onQuestions, onDirection, onSentences, session, topic }) {
  const tl = topicLine(session, topic);
  const ml = modeLine(session, prefs);
  const showCards = isVocab(session) || !session.topicId;
  return (
    <section className="card settings">
      <p className="caps">{t('level')}</p>
      <Segmented label={t('level')} options={LEVELS} value={prefs.level} onChange={onLevel} />

      <p className="caps">{t('difficulty')}</p>
      <Segmented label={t('difficulty')} options={DIFFICULTIES} value={prefs.difficulty} onChange={onDifficulty} render={(d) => t(`diff_${d}`)} />
      <p className="settings-help">{t(`diffHelp_${prefs.difficulty}`)}</p>

      <p className="caps">{t('questions')}</p>
      <Segmented label={t('questions')} options={QUESTIONS} value={prefs.questions} onChange={onQuestions} small />

      {showCards && (
        <>
          <p className="caps caps-row"><span>{t('flashcards')}</span><span className="ref-lang">{t('refLang')}</span></p>
          <Segmented label={t('flashcards')} options={DIRECTIONS} value={prefs.direction} onChange={onDirection} render={(d) => t(`dirShort_${dirKey(d)}`)} small />
          <Switch label={t('sentencesToggle')} on={prefs.sentences} onChange={onSentences} />
        </>
      )}

      <dl className="facts">
        <div>
          <dt>{t('topic')}</dt>
          <dd>{tl ? <><strong>{tl.type}</strong>{tl.name && ` · ${tl.name}`}</> : <span className="muted">{t('notChosen')}</span>}</dd>
        </div>
        <div>
          <dt>{t('mode')}</dt>
          <dd>{ml ? <><strong>{ml.name}</strong>{ml.detail && ` · ${ml.detail}`}</> : <span className="muted">{t('notChosen')}</span>}</dd>
        </div>
      </dl>
      <p className="settings-note">{t('settingsNote')}</p>
    </section>
  );
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

function GlanceView({ prefs, session, topic, recent }) {
  const tl = topicLine(session, topic);
  const ml = modeLine(session, prefs);
  const sc = score(session.answers);
  const rows = ruleRows(session.answers);
  const level = prefs.level;
  return (
    <>
      <section className="card lesson">
        <p className="lesson-status">
          <span className="caps">{t('currentLesson')}</span>
          <span className="synced"><span className="dot" aria-hidden="true" />{t('synced')}</span>
        </p>
        <div className="level-row">
          <span className="level-big">{level}</span>
          <span>
            <span className="level-name">{t(`levelName_${level}`)}</span>
            <span className="level-caption">{t('levelCaption')}</span>
          </span>
        </div>
        <hr />
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
            <p className="detail">
              {sc.answered === 0 ? t('basedOnNone') : sc.answered === 1 ? t('basedOnOne') : t('basedOnMany', { n: sc.answered })}
            </p>
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
                <span className="recent-score">{r.correct}/{r.answered}</span>
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
          {sc.answered > 0 && <span className="answers-score">{t('scoreCorrect', sc)}</span>}
        </p>
        {sc.answered === 0 ? (
          <p className="detail">{t('noAnswers')}</p>
        ) : (
          <ol className="answer-list">
            {session.answers.map((a) => {
              if (a.skipped) {
                return (
                  <li key={a.n} className="skipped">
                    <span className="mark" aria-hidden="true">–</span>
                    <span>{a.skippedLine || '…'} <span className="you-wrote">({t('skipped')})</span></span>
                  </li>
                );
              }
              const d = compareAnswer(a.studentAnswer, a.corrected, a.changedWords);
              return (
                <li key={a.n} className={a.correct ? 'right' : 'wrong'}>
                  <span className="mark" aria-hidden="true">{a.correct ? '✓' : '✗'}</span>
                  <span>
                    {a.correct ? a.corrected : <Marked segments={d.corrected} as="strong" />}
                    {!a.correct && d.removed && <span className="you-wrote"> {t('youWrote', { words: d.removed })}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <hr />
        <LessonProgress session={session} />
      </section>
    </>
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
  const wrong = [...session.answers].reverse().find((a) => !a.correct && !a.skipped);
  const right = [...session.answers].reverse().find((a) => a.correct);
  const examples = [wrong, right].filter(Boolean).slice(0, 2);
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
