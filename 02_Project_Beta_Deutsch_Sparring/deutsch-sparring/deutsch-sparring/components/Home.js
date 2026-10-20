'use client';

// The Home page: greeting, stat tiles, goals, the plan timeline, strengths & gaps and the recent
// sessions; the coach column on the right is the coach chat (components/Coach.js). All numbers come from
// the app (/api/stats, lib/home-stats.js), never from the AI.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { goalState, todayKey } from '../lib/goals';
import { PLAN_VERSION } from '../lib/plan';
import { fmtDay } from '../lib/dates';
import { loadHome, saveGoal, removeGoal, buildGoal, previewFix, changeGoal } from '../lib/home-client';
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

const PLAN_TAG = { ontrack: 'onTrack', ahead: 'onTrack', behind: 'behind', done: 'done', ended: 'ended' };

// A goal with a plan (version 2, made through the Coach): parts and milestones reached. An old-style goal still shows
// its old bar until the student switches it to a plan (the dialog below).
function GoalCard({ goal, pct, plan, today, onDelete }) {
  const isPlan = Number(goal.version) === PLAN_VERSION;
  const st = goalState(goal, pct, today);
  const tag = isPlan ? (st.tag === 'upcoming' ? 'upcoming' : PLAN_TAG[plan?.status] || 'onTrack') : st.tag;
  const weeks = st.ended ? t('goalEnded') : st.weeksLeft === 1 ? t('goalWeekOne') : t('goalWeeks', { n: st.weeksLeft });
  return (
    <article className="card goal-card">
      <div className="goal-top">
        <span className={`goal-tag ${tag}`}>{tag === 'ended' ? t('goalEnded') : t(`goalTag_${tag}`)}</span>
        <span className="goal-actions">
          <button type="button" className="text-button" onClick={onDelete}>{t('goalDelete')}</button>
        </span>
      </div>
      <h3 className="goal-name">{goal.title}</h3>
      <p className="detail">{t('goalDates', { from: fmtDay(goal.startDate), to: fmtDay(goal.endDate, true) })} · {weeks}</p>
      {isPlan ? (
        <p className="detail">
          {goal.subPlans.filter((p) => p.include).length === 1 ? t('goalPartsOne') : t('goalPartsCount', { n: goal.subPlans.filter((p) => p.include).length })}
          {plan ? ` · ${t('goalReachedOf', { n: plan.reached, total: plan.total })}` : ''}
        </p>
      ) : (
        <>
          <p className="detail">{t(`goalType_${goal.type}`)} · {goal.level}</p>
          <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.pct} aria-label={goal.title}>
            <span style={{ width: `${st.pct}%` }} />
          </div>
          <p className="detail">{t('goalOldStyle')}</p>
        </>
      )}
    </article>
  );
}

// The first visit after the update: old goals get a new plan, but only when the student says yes (D6). Nothing is saved before.
function UpgradeDialog({ items, busy, error, onConvert, onKeep }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="card upgrade-dialog" aria-labelledby="up-title" onCancel={(e) => { e.preventDefault(); onKeep(); }}>
      <h2 id="up-title" className="modal-title">{t('upTitle')}</h2>
      <p className="detail">{t('upIntro')}</p>
      <ul className="up-list">
        {items.map(({ old, next }) => (
          <li key={old.id}>
            {t('upLine', { title: old.title, newTitle: next.title, date: fmtDay(next.endDate, true) })}
          </li>
        ))}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button-outline" disabled={busy} onClick={onKeep}>{t('upKeep')}</button>
        <button type="button" className="button-primary" disabled={busy} onClick={onConvert}>{busy ? t('gpSaving') : t('upConvert')}</button>
      </div>
    </dialog>
  );
}

// "Keep the old one for now" is remembered for today only (this browser)
const SKIP_KEY = 'wort_upgrade_skip';
const skippedToday = (today) => { try { return localStorage.getItem(SKIP_KEY) === today; } catch { return false; } };
const skipToday = (today) => { try { localStorage.setItem(SKIP_KEY, today); } catch {} };

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
  const [starter, setStarter] = useState(null); // "+ New goal": a starter message for the Coach { n, text }
  const [notice, setNotice] = useState('');
  const [upgrading, setUpgrading] = useState({ busy: false, error: '', skipped: false });
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

  // ---- goals through the Coach (R12): the server builds and checks the plan, the browser saves it after Accept / Apply ----
  async function acceptGoal(proposal) {
    const built = await buildGoal(proposal.request);
    if (!built.ok || !built.goal) return { ok: false };
    if (!(await saveGoal(built.goal))) return { ok: false };
    await reload();
    return { ok: true };
  }
  const fixGoal = (request, lever) => previewFix(request, lever);
  async function applyCoachPlan(plan) {
    const goal = goals.find((g) => g.id === plan.goalId && Number(g.version) === PLAN_VERSION);
    if (!goal) return { ok: false, stale: true };
    const out = await changeGoal(goal, plan.levers, plan.label || '');
    if (!out.ok || !out.goal) return { ok: false, stale: true };
    if (!(await saveGoal(out.goal))) return { ok: false };
    await reload();
    return { ok: true };
  }

  // ---- old goals: converted only when the student confirms ----
  const pending = Object.entries(data?.upgrades || {})
    .map(([id, up]) => ({ old: goals.find((g) => g.id === id), next: up.goal }))
    .filter((x) => x.old && Number(x.old.version) !== PLAN_VERSION);
  async function convertAll() {
    setUpgrading({ busy: true, error: '', skipped: false });
    for (const { next } of pending) {
      if (!(await saveGoal(next))) {
        setUpgrading({ busy: false, error: t('upError'), skipped: false });
        return;
      }
    }
    setUpgrading({ busy: false, error: '', skipped: false });
    await reload();
  }
  function keepOld() {
    skipToday(today);
    setUpgrading({ busy: false, error: '', skipped: true });
  }
  const progress = data?.progress || {};
  const behind = goals.filter((g) => (Number(g.version) === PLAN_VERSION ? data?.plans?.[g.id]?.status === 'behind' : goalState(g, progress[g.id], today).tag === 'behind'));
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
            <button type="button" className="button-outline small" onClick={() => setStarter((x) => ({ n: (x?.n || 0) + 1, text: t('goalNewStarter') }))}>{t('goalNew')}</button>
          </div>
          {notice && <p className="form-error" role="alert">{notice}</p>}
          {data && !goals.length && <p className="card empty-card muted">{t('goalsEmpty')}</p>}
          <div className="goal-grid">
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                pct={progress[g.id] ?? 0}
                plan={data?.plans?.[g.id]}
                today={today}
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
          starter={starter}
          onSetup={onSetupSuggested}
          onAcceptGoal={acceptGoal}
          onFix={fixGoal}
          onApplyPlan={applyCoachPlan}
        />
      </aside>

      {pending.length > 0 && !upgrading.skipped && !skippedToday(today) && (
        <UpgradeDialog items={pending} busy={upgrading.busy} error={upgrading.error} onConvert={convertAll} onKeep={keepOld} />
      )}
    </main>
  );
}
