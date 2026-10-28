'use client';

// The session summary screen (stage 'summary'): shown when a session ends. All numbers are worked out by the
// app from the answers (lib/stats.js) and, for the goals, by the same logic as the Home page (/api/stats).

import { useEffect, useMemo, useState } from 'react';
import { t } from '../lib/ui-text';
import { score, scoreLine, taskStates, headlineKey, summaryDetails } from '../lib/stats';
import { loadScores } from '../lib/storage';
import { loadHome } from '../lib/home-client';
import { milestoneSummary, findMilestone } from '../lib/milestone-session';
import { fmtWeekday } from '../lib/dates';
import { ProgressTrack } from './Chat';
import { Marked } from './Rich';

const reasonText = (key) => (key.startsWith('case:') ? key.slice(5) : t(`sumReason_${key}`));

// "Meaning 7 · Article 4": the word's scores after this session (vocabulary sessions)
const partsText = (parts) => (parts || []).map((p) => t('sumPartScore', { name: t(`partsOf_${p.part}`), s: p.s })).join(' · ');
// a word's reason first: "wrong meaning", "wrong article", "skipped"; other reasons keep their normal text
const wordReason = (key) => (t(`sumWordReason_${key}`) !== `sumWordReason_${key}` ? t(`sumWordReason_${key}`) : reasonText(key));

// Pills: a word or a question that was right (wraps when the question is long) · words with their reason and scores
function Tags({ items, kind, words = false }) {
  return (
    <ul className={`sum-tags ${kind}`}>
      {items.map((x, i) => (
        <li key={`${i}-${x.label}`} className="sum-tag">
          {x.label}
          {x.reason && <span className="sum-reason"> · {words ? wordReason(x.reason) : reasonText(x.reason)}</span>}
          {x.parts?.length > 0 && <span className="sum-parts"> · {partsText(x.parts)}</span>}
        </li>
      ))}
    </ul>
  );
}

// "To repeat" for grammar sessions: the whole question, then the corrected sentence with the changed word
// highlighted – or, for a skipped question, its solution (or just "Skipped" when the app has none).
function RepeatList({ items }) {
  return (
    <ul className="sum-repeat-list">
      {items.map((x, i) => (
        <li key={`${i}-${x.label}`}>
          <p className="sum-q">{x.label}<span className="sum-reason"> · {reasonText(x.reason)}</span></p>
          {x.skipped ? (
            <p className="sum-fix">{x.solution ? <><span className="sum-fix-label">{t('sumSolution')}</span> <strong>{x.solution}</strong></> : <span className="sum-skipped-plain">{t('sumSkippedPlain')}</span>}</p>
          ) : x.fix && (
            <p className="sum-fix"><span className="sum-fix-label">{t('sumFixed')}</span> „<Marked segments={x.fix} as="strong" className="fixed" />“</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// "1 more word" / "3 more words": the _one text is used for exactly 1
const tn = (key, n, vars = {}) => t(n === 1 && t(`${key}_one`) !== `${key}_one` ? `${key}_one` : key, { n, ...vars });

// the main line of the box: "12 → 15 of 16 words learnt", grammar in its own wording, then what is still missing
function MilestoneLines({ p }) {
  const same = p.from === p.to;
  const half = (n) => String(Math.round(n * 2) / 2);
  const key = p.unit === 'words' ? 'sumMsWords'
    : p.unit === 'lessons' ? 'sumMsLessons'
      : p.criterion?.target === 'introduced' ? 'sumMsAnswers' : 'sumMsRight';
  const count = t(key, { from: half(p.from), to: half(p.to), total: p.total });
  const togo = Math.max(0, p.need - p.to);
  const left = p.reached || togo <= 0 ? null
    : p.unit === 'words' ? tn('sumMsToGoWords', togo)
      : p.unit === 'lessons' ? tn('sumMsToGoLessons', togo)
        : p.criterion?.target === 'introduced' ? null : tn('sumMsToGoRight', Math.ceil(togo));
  return (
    <>
      <p className="sum-ms-count">{count}{same && <span className="detail"> · {t('sumMsSame')}</span>}{p.date && <span className="detail"> · {t('sumMsDue', { date: fmtWeekday(p.date) })}</span>}</p>
      {left && <p className="detail">{left}</p>}
    </>
  );
}

function alsoText(x) {
  const key = x.unit === 'words' ? 'sumMsAlsoWords' : x.unit === 'lessons' ? 'sumMsAlsoLessons' : 'sumMsAlsoAnswers';
  const what = x.plus > 0 ? tn(key, Math.round(x.plus * 2) / 2, { title: x.title }) : x.title;
  return x.justReached ? t('sumMsAlsoReached', { what }) : what;
}

function MilestoneBox({ state, data, onNext }) {
  if (state === 'loading') return <p className="detail">{t('sumMsLoading')}</p>;
  if (state === 'error') return <p className="detail">{t('sumMsError')}</p>;
  if (state === 'nogoal') return <p className="detail">{t('sumMsNoGoal')}</p>;
  const { primary: p, also, next } = data;
  return (
    <>
      {p && (
        <>
          <p className="caps">{p.partTitle}</p>
          <p className="sum-ms-title">{p.justReached ? t('sumMsReached', { title: p.title }) : p.reached ? t('sumMsWasReached', { title: p.title }) : p.title}</p>
          {!(p.reached && !p.justReached) && <MilestoneLines p={p} />}
          {p.reached && next && (
            <p className="sum-ms-next">
              <span>{t('sumMsNext', { title: next.title })}</span>{' '}
              <button type="button" className="button-outline small" onClick={() => onNext(next)}>{t('sumMsNextStart')}</button>
            </p>
          )}
        </>
      )}
      {!p && !also.length && <><p className="sum-ms-title">{t('sumMsNone')}</p><p className="detail">{t('sumMsNoneHelp')}</p></>}
      {also.length > 0 && <p className={p ? 'detail sum-ms-also' : 'sum-ms-title'}>{t('sumMsAlso', { list: also.map(alsoText).join(' · ') })}</p>}
    </>
  );
}

export default function SessionSummary({ session, name, topicType, onHome, onAgain, onNew, onChat, onNextMilestone }) {
  const sc = score(session.answers);
  const d = useMemo(() => {
    let scores = null;
    try { scores = loadScores(); } catch { /* no stored scores: the words are listed without them */ }
    return summaryDetails(session, scores);
  }, [session]);
  const st = session.settings || {};
  const vocabWords = d.words;
  const [ms, setMs] = useState({ state: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    loadHome().then((after) => {
      if (cancelled) return;
      if (!after) setMs({ state: 'error', data: null });
      else if (!after.goals?.some((g) => g.version === 2)) setMs({ state: 'nogoal', data: null });
      else {
        const data = milestoneSummary(session.goalsBefore?.milestones, after, session.settings?.milestoneId);
        const nu = after.nextUp && after.nextUp.milestoneId !== session.settings?.milestoneId ? after.nextUp : null;
        const hit = nu ? findMilestone(after.goals, nu.milestoneId) : null;
        const spec = nu ? after.sessions?.[nu.milestoneId] : null;
        setMs({ state: 'ok', data: { ...data, next: hit && spec ? { id: nu.milestoneId, title: hit.title, spec } : null } });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const meta = [
    t('sumMeta', { type: t(`type_${topicType || 'Gemischt'}`), level: st.level || '', difficulty: t(`diff_${st.difficulty || 'medium'}`), n: sc.done }),
    d.minutes ? t('sumMinutes', { n: d.minutes }) : null,
  ].filter(Boolean).join(' · ');
  const known = vocabWords ? vocabWords.known : d.questions.right;
  const repeat = vocabWords ? vocabWords.repeat : d.questions.repeat;

  return (
    <main className="summary-page">
      <div className="summary-column">
        <section className="card summary-screen" aria-label={t('sumFinished')}>
          <div className="sum-top">
            <div className="sum-title-block">
              <p className="caps brand">{t('sumFinished')} · {session.topicName || ''}</p>
              <h1 className="sum-title">{t(`sumHead_${headlineKey(sc).slice(9)}`, { name })}</h1>
              <p className="sum-meta">{meta}</p>
            </div>
            <div className="sum-score-block">
              <p className="sum-score" aria-label={scoreLine(sc, t)}>
                {sc.answered ? <>{sc.correct} <span className="sum-of">/ {sc.answered}</span></> : '–'}
              </p>
              <p className="detail">{scoreLine(sc, t)}</p>
            </div>
          </div>

          <ProgressTrack states={taskStates({ ...session, exercise: null, finished: true })} />

          <div className="sum-boxes">
            <section className="sum-box sum-known">
              <h2 className="sum-box-title">{vocabWords ? t('sumWordsKnown') : t('sumQKnown')}</h2>
              {known.length ? <Tags items={known} kind="known" /> : <p className="detail">{t('sumNoneKnown')}</p>}
            </section>
            <section className="sum-box sum-repeat">
              <h2 className="sum-box-title">{vocabWords ? t('sumWordsRepeat') : t('sumQRepeat')}</h2>
              {!repeat.length ? <p className="detail">{t('sumNoneRepeat')}</p> : vocabWords ? <Tags items={repeat} kind="repeat" words /> : <RepeatList items={repeat} />}
              {vocabWords && repeat.length > 0 && <p className="detail">{t('sumWordsRepeatNote')}</p>}
            </section>
            <section className="sum-box">
              <h2 className="sum-box-title">{t('sumGrammar')}</h2>
              {d.grammar.length ? (
                <ul className="sum-rules">
                  {d.grammar.map((r) => (
                    <li key={r.rule}>
                      <span className="sum-rule-name">{r.rule}</span>
                      <span className={r.right / r.total < 0.5 ? 'sum-low' : ''}>{r.right} / {r.total}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="detail">{t('sumGrammarNone')}</p>}
            </section>
          </div>

          <section className={`sum-goals sum-ms${ms.data?.primary?.justReached ? ' reached' : ''}`}>
            <h2 className="sum-box-title">{t('sumMs')}</h2>
            <MilestoneBox state={ms.state} data={ms.data} onNext={(n) => onNextMilestone?.(n.spec, n.id, n.title)} />
          </section>

          <div className="sum-actions">
            <button type="button" className="button-primary" onClick={onHome}>{t('sumHome')}</button>
            <button type="button" className="button-outline" onClick={onAgain}>{t('summaryAgain')}</button>
            <button type="button" className="button-ghost" onClick={onNew}>{t('summaryNew')}</button>
            <button type="button" className="text-button sum-chat-link" onClick={onChat}>{t('sumSeeChat')}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
