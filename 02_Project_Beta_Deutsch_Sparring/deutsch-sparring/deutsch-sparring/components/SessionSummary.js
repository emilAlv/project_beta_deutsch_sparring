'use client';

// The session summary screen (stage 'summary'): shown when a session ends. All numbers are worked out by the
// app from the answers (lib/stats.js) and, for the goals, by the same logic as the Home page (/api/stats).

import { useEffect, useState } from 'react';
import { t } from '../lib/ui-text';
import { score, taskStates, headlineKey, summaryDetails, isGrammarAnswer } from '../lib/stats';
import { loadHome } from '../lib/home-client';
import { ProgressTrack } from './Chat';

const reasonText = (key) => (key.startsWith('case:') ? key.slice(5) : t(`sumReason_${key}`));

function Tags({ items, kind }) {
  return (
    <ul className={`sum-tags ${kind}`}>
      {items.map((x, i) => (
        <li key={`${i}-${x.label}`} className="sum-tag" title={x.label}>
          {x.label}{x.reason && <span className="sum-reason"> · {reasonText(x.reason)}</span>}
        </li>
      ))}
    </ul>
  );
}

// one line per goal: how far it moved during this session
function goalLines(goals, before, after, session) {
  const learnt = Math.max(0, (after.tiles?.learnt ?? 0) - (before?.learnt ?? 0));
  return goals.map((g) => {
    const from = before?.progress?.[g.id] ?? after.progress?.[g.id] ?? 0;
    const to = after.progress?.[g.id] ?? from;
    let what;
    if (g.type === 'grammar') {
      const rules = g.scope?.rules || [];
      const mine = session.answers.filter((a) => isGrammarAnswer(a) && (!rules.length || rules.includes(a.rule)));
      what = mine.length ? t('sumGoalRules', { ok: mine.filter((a) => a.correct).length, n: mine.length }) : t('sumGoalNoRules');
    } else {
      what = learnt ? t('sumGoalWords', { n: learnt }) : t('sumGoalNoWords');
    }
    return { id: g.id, text: t('sumGoalLine', { title: g.title, what, from, to }) };
  });
}

export default function SessionSummary({ session, name, topicType, onHome, onAgain, onNew, onChat }) {
  const sc = score(session.answers);
  const d = summaryDetails(session);
  const st = session.settings || {};
  const vocabWords = d.words;
  const [goals, setGoals] = useState({ state: 'loading', lines: [] });

  useEffect(() => {
    let cancelled = false;
    loadHome().then((after) => {
      if (cancelled) return;
      if (!after) setGoals({ state: 'error', lines: [] });
      else if (!after.goals?.length) setGoals({ state: 'none', lines: [] });
      else setGoals({ state: 'ok', lines: goalLines(after.goals, session.goalsBefore, after, session) });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const meta = [
    t('sumMeta', { type: t(`type_${topicType || 'Gemischt'}`), level: st.level || '', difficulty: t(`diff_${st.difficulty || 'medium'}`), n: sc.done }),
    d.minutes ? t('sumMinutes', { n: d.minutes }) : null,
  ].filter(Boolean).join(' · ');
  const rightLine = [t('sumRight'), sc.skipped ? t('sumSkipped', { n: sc.skipped }) : null].filter(Boolean).join(' · ');
  const known = vocabWords ? vocabWords.known.map((label) => ({ label })) : d.questions.right.map((label) => ({ label }));
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
              <p className="sum-score" aria-label={`${sc.correct} / ${sc.done}`}>
                {sc.answered ? <>{sc.correct} <span className="sum-of">/ {sc.done}</span></> : '–'}
              </p>
              <p className="detail">{rightLine}</p>
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
              {repeat.length ? <Tags items={repeat} kind="repeat" /> : <p className="detail">{t('sumNoneRepeat')}</p>}
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

          <section className="sum-goals">
            <h2 className="sum-box-title">{t('sumGoals')}</h2>
            {goals.state === 'loading' && <p className="detail">{t('sumGoalsLoading')}</p>}
            {goals.state === 'error' && <p className="detail">{t('sumGoalsError')}</p>}
            {goals.state === 'none' && <p className="detail">{t('sumGoalsNone')}</p>}
            {goals.lines.map((l) => <p key={l.id} className="sum-goal-line">{l.text}</p>)}
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
