'use client';

// The Home page: greeting, stat tiles, goals, the plan timeline, strengths & gaps and the recent
// sessions; the coach column on the right is the coach chat (components/Coach.js). All numbers come from
// the app (/api/stats, lib/home-stats.js), never from the AI.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '../lib/ui-text';
import { goalState, todayKey } from '../lib/goals';
import { fmtDay } from '../lib/dates';
import { loadHome, saveGoal, removeGoal } from '../lib/home-client';
import { applyPlan } from '../lib/coach';
import GoalForm from './GoalForm';
import Coach from './Coach';
import PlanTimeline from './PlanTimeline';

function greeting(name) {
  const h = new Date().getHours();
  return t(h < 11 ? 'homeGreetMorning' : h < 18 ? 'homeGreetDay' : 'homeGreetEvening', { name });
}

function Tile({ label, value, sub }) {
  return (
    <div className="card tile">
      <p className="caps">{label}</p>
      <p className="tile-value">{value}</p>
      <p className="detail">{sub}</p>
    </div>
  );
}

function GoalCard({ goal, pct, today, onEdit, onDelete }) {
  const st = goalState(goal, pct, today);
  const weeks = st.ended ? t('goalEnded') : st.weeksLeft === 1 ? t('goalWeekOne') : t('goalWeeks', { n: st.weeksLeft });
  return (
    <article className="card goal-card">
      <div className="goal-top">
        <span className={`goal-tag ${st.tag}`}>{t(`goalTag_${st.tag}`)}</span>
        <span className="goal-actions">
          <button type="button" className="text-button" onClick={onEdit}>{t('goalEdit')}</button>
          <button type="button" className="text-button" onClick={onDelete}>{t('goalDelete')}</button>
        </span>
      </div>
      <h3 className="goal-name">{goal.title}</h3>
      <p className="detail">{t(`goalType_${goal.type}`)} · {goal.level}</p>
      <p className="detail">{t('goalDates', { from: fmtDay(goal.startDate), to: fmtDay(goal.endDate, true) })} · {weeks}</p>
      <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.pct} aria-label={goal.title}>
        <span style={{ width: `${st.pct}%` }} />
      </div>
      <p className="goal-pct">{t('goalDone', { n: st.pct })}</p>
    </article>
  );
}

function SgColumn({ kind, items, goals, empty }) {
  const goalName = (id) => goals.find((g) => g.id === id)?.title;
  return (
    <div className={`sg-col ${kind}`}>
      <h3 className="sg-head"><span className="dot" />{t(kind === 'strengths' ? 'sgStrengths' : 'sgGaps')}</h3>
      {!items.length && <p className="detail">{empty}</p>}
      <ul className="sg-list">
        {items.map((x) => (
          <li key={`${x.kind}:${x.label}`}>
            <div className="sg-line">
              <span className="sg-label">{x.label}</span>
              <span className="sg-pct">{x.pct} %</span>
            </div>
            <div className="sg-bar"><span style={{ width: `${x.pct}%` }} /></div>
            <p className="detail">
              {t('sgAnswers', { n: x.n })}
              {x.kind === 'list' && x.v != null && ` · ${x.g != null ? t('sgAvg', { v: x.v, g: x.g }) : t('sgAvgV', { v: x.v })}`}
              {' · '}{goalName(x.goalId) ? t('sgGoal', { goal: goalName(x.goalId) }) : t('sgNoGoal')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home({ name, classCode, clientId, streak, sessions, topics, running, onStart, onContinue, onAgain, onSetupSuggested }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState('whole');
  const [form, setForm] = useState(null); // { goal } (goal = null: a new one)
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const today = useMemo(() => todayKey(), []);

  const reload = useCallback(async () => {
    const d = await loadHome();
    if (d) {
      setData(d);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save(goal) {
    setSaving(true);
    setFormError('');
    const ok = await saveGoal(goal);
    setSaving(false);
    if (!ok) {
      setFormError(t('goalSaveError'));
      return;
    }
    setForm(null);
    await reload();
  }

  async function remove(goal) {
    if (!window.confirm(t('goalDeleteConfirm', { title: goal.title }))) return;
    setNotice('');
    if (!(await removeGoal(goal.id))) {
      setNotice(t('goalDeleteError'));
      return;
    }
    await reload();
  }

  const goals = data?.goals || [];

  // the coach proposed changes and the student tapped "Apply": checked again against the goal as it is now
  async function applyCoachPlan(goalId, changes) {
    const goal = goals.find((g) => g.id === goalId);
    const next = goal && applyPlan(goal, changes, today);
    if (!next) return { ok: false, stale: true };
    if (!(await saveGoal(next))) return { ok: false };
    await reload();
    return { ok: true };
  }
  const progress = data?.progress || {};
  const behind = goals.filter((g) => goalState(g, progress[g.id], today).tag === 'behind');
  const summary = !goals.length ? t('homeSummaryNone')
    : behind.length ? t('homeSummaryBehind', { names: behind.map((g) => g.title).join(', ') })
      : t('homeSummaryOn');
  const tiles = data?.tiles;
  const recent = sessions.filter((x) => x.answered > 0).slice(0, 5);

  return (
    <main className="home">
      <div className="home-main">
        <section className="home-hero">
          <div>
            <h1 className="home-greeting">{greeting(name)}</h1>
            <p className="home-summary">{data ? summary : failed ? t('homeError') : t('homeLoading')}</p>
          </div>
          <div className="home-cta">
            {running && <button type="button" className="button-outline" onClick={onContinue}>{t('homeContinue')}</button>}
            <button type="button" className="button-primary" onClick={onStart}>{t('homeStart')}</button>
          </div>
        </section>

        {failed && !data && (
          <p className="detail">
            {t('homeError')} <button type="button" className="text-button" onClick={reload}>{t('homeRetry')}</button>
          </p>
        )}

        <section className="tiles" aria-label={t('tilePeriod')}>
          <Tile label={t('tileSessions')} value={tiles ? tiles.sessions : '–'} sub={t('tilePeriod')} />
          <Tile
            label={t('tileQuestions')}
            value={tiles ? tiles.answered : '–'}
            sub={tiles && tiles.answered ? `${t('tileRight', { pct: tiles.pctRight })} · ${t('tilePeriod')}` : t('tilePeriod')}
          />
          <Tile
            label={t('tileWords')}
            value={tiles ? tiles.learnt : '–'}
            sub={tiles ? t('tileWordsOf', { total: tiles.wordsTotal }) : ''}
          />
          <Tile
            label={t('tileStreak')}
            value={streak === 1 ? t('tileStreakDay') : streak > 1 ? t('tileStreakDays', { n: streak }) : '0'}
            sub={streak > 0 ? '' : t('tileStreakNone')}
          />
        </section>

        <section className="home-section">
          <div className="section-head">
            <h2 className="section-title">{t('goalsTitle')}</h2>
            <button type="button" className="button-outline small" onClick={() => { setFormError(''); setForm({ goal: null }); }}>{t('goalNew')}</button>
          </div>
          {notice && <p className="form-error" role="alert">{notice}</p>}
          {data && !goals.length && <p className="card empty-card muted">{t('goalsEmpty')}</p>}
          <div className="goal-grid">
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                pct={progress[g.id] ?? 0}
                today={today}
                onEdit={() => { setFormError(''); setForm({ goal: g }); }}
                onDelete={() => remove(g)}
              />
            ))}
          </div>
        </section>

        <section className="card plan-card">
          <div className="section-head">
            <h2 className="section-title">{t('planTitle')}</h2>
            <div className="segmented small plan-switch" role="radiogroup" aria-label={t('planSwitch')}>
              {['whole', 'still'].map((k) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                  {t(k === 'whole' ? 'planWhole' : 'planStill')}
                </button>
              ))}
            </div>
          </div>
          <PlanTimeline goals={goals} progress={progress} mode={mode} today={today} />
        </section>

        <section className="card sg-card">
          <div className="section-head">
            <h2 className="section-title">{t('sgTitle')}</h2>
            <span className="detail">{t('sgSub')}</span>
          </div>
          {data && !data.strengths.length && !data.gaps.length && !tiles?.answered ? (
            <p className="muted">{t('sgNone')}</p>
          ) : (
            <div className="sg-grid">
              <SgColumn kind="strengths" items={data?.strengths || []} goals={goals} empty={t('sgNoneStrong')} />
              <SgColumn kind="gaps" items={data?.gaps || []} goals={goals} empty={t('sgNoneGaps')} />
            </div>
          )}
        </section>

        <section className="card recent-card">
          <h2 className="section-title">{t('recentTitle')}</h2>
          {!recent.length && <p className="muted">{t('recentNone')}</p>}
          <ul className="recent-rows">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="recent-topic">{r.topicName || '—'}</span>
                <span className="detail">{r.level || ''}</span>
                <span className="recent-score">{t('recentScore', { correct: r.correct, answered: r.answered })}</span>
                {r.settings && <button type="button" className="button-outline small" onClick={() => onAgain(r.settings)}>{t('recentAgain')}</button>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="home-side">
        <Coach
          name={name}
          classCode={classCode}
          clientId={clientId}
          goals={goals}
          topics={topics}
          today={today}
          onSetup={onSetupSuggested}
          onApplyPlan={applyCoachPlan}
        />
      </aside>

      {form && (
        <GoalForm
          goal={form.goal}
          today={today}
          topics={topics}
          busy={saving}
          error={formError}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      )}
    </main>
  );
}
