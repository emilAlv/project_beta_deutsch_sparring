'use client';

// The pieces of Home that show a PLAN (R13): "Next up", the part rows of a goal card and the plan you can zoom
// (overview → one part → one milestone). All names come from the templates (lib/plan-templates.js), all numbers from the
// app (lib/plan-progress.js via /api/stats); nothing here is written by the AI.

import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { fmtDay, fmtWeekday } from '../lib/dates';
import { goalState } from '../lib/goals';
import { partTitle } from '../lib/plan-templates';
import {
  milestoneView, partView, overviewRows, SOON_DAYS, RECENT_SHOWN,
} from '../lib/home-plan';

// ---------- the overview as a Gantt chart ----------
// One row per part on the goal's calendar: the bar runs from when the part starts to its last milestone, so parts that
// run at the same time overlap. The fill shows reached milestones, small ticks the milestone dates, one line "Today".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dn = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
const inBar = (p, day) => ((dn(day) - dn(p.start)) / Math.max(1, dn(p.end) - dn(p.start))) * 100; // a milestone tick inside its bar

function Gantt({ row, today, onOpen }) {
  const from = dn(row.start);
  const span = Math.max(1, dn(row.end) - from);
  const pos = (day) => Math.max(0, Math.min(100, ((dn(day) - from) / span) * 100));
  const months = [];
  const d = new Date(`${row.start}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.toISOString().slice(0, 10) < row.end) {
    months.push({ day: d.toISOString().slice(0, 10), label: MONTHS[d.getUTCMonth()] });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const barStyle = (p) => ({ left: `${pos(p.start)}%`, width: `${Math.max(1.5, pos(p.end) - pos(p.start))}%` });
  const at = (day) => ({ left: `${pos(day)}%` });
  const showToday = today >= row.start && today <= row.end;
  return (
    <div className="gantt">
      <div className="gantt-row gantt-scale" aria-hidden="true">
        <span />
        <span className="gantt-track">
          {months.map((m) => <span key={m.day} className="gantt-month" style={at(m.day)}>{m.label}</span>)}
        </span>
      </div>
      {row.parts.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`gantt-row gantt-part${p.late > 0 ? ' late' : ''}`}
          onClick={() => onOpen(p.id)}
          aria-label={`${t('zoomOpenPart', { part: p.title })}. ${t('zoomSegment', { part: p.title, n: p.reached, total: p.total, planned: p.planned })}. ${fmtDay(p.start)} – ${fmtDay(p.end)}`}
        >
          <span className="gantt-label">
            <span className="zoom-seg-name">{p.title}</span>
            <span className="detail">{t('goalPartSteps', { n: p.reached, total: p.total })}</span>
          </span>
          <span className="gantt-track" aria-hidden="true">
            {months.map((m) => <span key={m.day} className="gantt-grid" style={at(m.day)} />)}
            <span className="gantt-bar" style={barStyle(p)}>
              <span className="zoom-seg-fill" style={{ width: `${(p.reached / p.total) * 100}%` }} />
              {p.dates.map((day, i) => <span key={i} className="gantt-tick" style={{ left: `${inBar(p, day)}%` }} />)}
            </span>
            {showToday && <span className="zoom-today" style={at(today)} />}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- small text helpers ----------
const half = (n) => String(Math.round(n * 2) / 2);

// "Fri 6 Nov" plus "(in 5 days)" within two weeks
export function dueText(day, inDays) {
  if (!day) return '';
  const base = fmtWeekday(day);
  if (inDays === 0) return `${base} (${t('dateToday')})`;
  if (inDays === 1) return `${base} (${t('dateTomorrow')})`;
  if (inDays > 1 && inDays <= SOON_DAYS) return `${base} (${t('dateInDays', { n: inDays })})`;
  return base;
}

// "31 of 45 words" · "12 of last 20 right"
export function countText(v) {
  switch (v.unit) {
    case 'words': return t('cntWords', { have: v.have, total: v.total });
    case 'lessons': return t('cntLessons', { have: v.have, total: v.total });
    case 'answers': return v.m.criterion.target === 'introduced'
      ? t('cntAnswers', { have: v.have, total: v.total })
      : t('cntRight', { have: half(v.have), total: v.total });
    case 'mock':
    case 'task': return t('cntExam');
    default: return '';
  }
}

const pointsText = (result) => Object.entries(result || {})
  .map(([k, n]) => `${t(`tickPart${k[0].toUpperCase()}${k.slice(1)}`)} ${n} / 100`).join(' · ');

// the state line of a milestone (redesign §3.3)
export function stateText(v) {
  const count = countText(v);
  const date = v.reachedAt ? fmtWeekday(v.reachedAt) : '';
  switch (v.state) {
    case 'solid': return t('msSolid');
    case 'reached': return t('msReached', { date });
    case 'refresh': return v.m.criterion.kind === 'words' && v.refresh
      ? t('msRefreshWords', { date, n: (v.refresh.due || 0) + (v.refresh.weak || 0) }) : t('msRefreshTopic', { date });
    case 'done': return v.result ? t('msDonePoints', { date, points: pointsText(v.result) }) : t('msDone', { date });
    case 'skipped': return t('msSkipped');
    case 'late': return v.daysLate === 1 ? t('msLateOne', { count }) : t('msLate', { n: v.daysLate, count });
    case 'next': return t('msNext', { count, due: v.date ? t('dateDue', { date: dueText(v.date, v.inDays) }) : '' }).replace(/ · $/, '');
    case 'progress': return t('msProgress', { count });
    default: return v.startsAfter ? t('msComing', { title: v.startsAfter }) : t('msComingPlain');
  }
}
const STATE_WORD = {
  solid: 'msStateSolid', reached: 'msStateReached', refresh: 'msStateRefresh', done: 'msStateDone', skipped: 'msStateSkipped',
  late: 'msStateLate', next: 'msStateNext', progress: 'msStateProgress', coming: 'msStateComing',
};
const fillOf = (v) => (v.state === 'skipped' ? 0 : ['reached', 'refresh', 'solid', 'done'].includes(v.state) ? 100 : v.total ? Math.min(100, (v.have / v.total) * 100) : 0);

function findMilestone(goals, goalId, milestoneId) {
  const goal = goals.find((g) => g.id === goalId);
  for (const part of goal?.subPlans || []) {
    const m = part.milestones.find((x) => x.id === milestoneId);
    if (m) return { goal, part, m };
  }
  return null;
}

// ---------- Next up ----------
export function NextUpCard({ data, goals, today, onPractise, onOpen }) {
  const [picked, setPicked] = useState(null);
  const nu = data?.nextUp;
  useEffect(() => setPicked(null), [nu?.milestoneId]);
  if (!nu) {
    return (
      <section className="card next-card" aria-labelledby="next-title">
        <h2 id="next-title" className="caps">{t('nextTitle')}</h2>
        <p className="muted">{t('nextNone')}</p>
      </section>
    );
  }
  const id = picked || nu.milestoneId;
  const hit = findMilestone(goals, nu.goalId, id);
  if (!hit) return null;
  const v = milestoneView(hit.goal, hit.part, hit.m, data.plans?.[hit.goal.id], today);
  const spec = data.sessions?.[id];
  const others = [nu.milestoneId, ...nu.others].filter((x) => x !== id).slice(0, 3);
  return (
    <section className="card next-card" aria-labelledby="next-title">
      <p id="next-title" className="caps">{t('nextTitle')}</p>
      <h2 className="next-name">{v.title}</h2>
      <p className="detail">{t('nextIn', { goal: hit.goal.title, part: partTitle(hit.part) })}</p>
      <p className={`ms-state${v.state === 'late' ? ' late' : ''}`}>{stateText({ ...v, state: v.state === 'late' ? 'late' : 'next' })}</p>
      <div className="goal-bar" aria-hidden="true"><span style={{ width: `${fillOf(v)}%` }} /></div>
      <div className="next-actions">
        {spec && (
          <button type="button" className="button-primary" onClick={() => onPractise(id)}>{t('nextPractise', { n: spec.questions })}</button>
        )}
        <button type="button" className="button-outline" onClick={() => onOpen(hit.goal.id, hit.part.id, id)}>{t('nextOpen')}</button>
      </div>
      {others.length > 0 && (
        <details className="next-other">
          <summary>{t('nextOther')}</summary>
          <p className="detail">{t('nextOtherHint')}</p>
          <ul className="next-others">
            {others.map((oid) => {
              const o = findMilestone(goals, nu.goalId, oid);
              if (!o) return null;
              const ov = milestoneView(o.goal, o.part, o.m, data.plans?.[o.goal.id], today);
              return (
                <li key={oid}>
                  <button type="button" className="text-button" onClick={() => setPicked(oid)}>
                    {ov.title}<span className="detail"> · {countText(ov)}{ov.date ? ` · ${t('dateDue', { date: fmtWeekday(ov.date) })}` : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------- the part rows of a goal card ----------
export function PartRows({ goal, plan, today, onOpenPart }) {
  return (
    <ul className="part-rows">
      {goal.subPlans.filter((p) => p.include !== false).map((part) => {
        const pv = partView(goal, part.id, plan, today);
        if (!pv || !pv.items.some((i) => i.state !== 'skipped')) return null;
        const live = pv.items.filter((i) => i.state !== 'skipped');
        const words = part.kind === 'vocab' ? live.filter((i) => i.unit === 'words') : [];
        const sumHave = words.reduce((s, i) => s + i.have, 0);
        const sumTotal = words.reduce((s, i) => s + i.total, 0);
        const now = words.length === live.length && sumTotal
          ? t('goalPartWords', { have: sumHave, total: sumTotal })
          : t('goalPartSteps', { n: pv.reached, total: pv.total });
        const share = words.length === live.length && sumTotal ? sumHave / sumTotal : pv.total ? pv.reached / pv.total : 0;
        const nextId = plan?.parts?.[part.id]?.nextId;
        const next = pv.items.find((i) => i.id === nextId);
        return (
          <li key={part.id}>
            <button type="button" className="part-row" onClick={() => onOpenPart(goal.id, part.id)} aria-label={t('goalPartOpen', { part: pv.title })}>
              <span className="part-name">{pv.title}</span>
              <span className="part-now">
                <span className="goal-bar thin" aria-hidden="true"><span style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
                <span className="detail">{now}</span>
              </span>
              <span className={`part-next${next?.state === 'late' ? ' late' : ''}`}>
                {next ? <>{next.title}<span className="detail"> · {countText(next)}{next.date ? ` · ${fmtWeekday(next.date)}` : ''}{next.state === 'late' ? ' ⚠' : ''}</span></> : <span className="detail">{t('goalPartDone')}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- the plan you can zoom ----------
function Crumbs({ zoom, goals, pv, mv, onGo }) {
  const goal = goals.find((g) => g.id === zoom.goalId);
  const items = [{ label: t('zoomAll'), to: { level: 'overview' } }];
  if (zoom.level !== 'overview' && goal) items.push({ label: goal.title, to: { level: 'overview' } });
  if (zoom.level !== 'overview' && pv) items.push({ label: pv.title, to: { level: 'part', goalId: zoom.goalId, partId: zoom.partId } });
  if (zoom.level === 'milestone' && mv) items.push({ label: mv.title });
  return (
    <nav aria-label={t('zoomNav')}>
      <ol className="zoom-crumbs">
        {items.map((it, i) => (
          <li key={i}>
            {i < items.length - 1 && it.to ? (
              <button type="button" className="text-button" onClick={() => onGo(it.to)}>{it.label}</button>
            ) : (
              <span aria-current={i === items.length - 1 ? 'location' : undefined}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function MilestoneDot({ state }) {
  return <span className={`ms-dot ${state}`} aria-hidden="true" />;
}

function Recent({ rows }) {
  if (!rows.length) return <p className="detail">{t('mdRecentNone')}</p>;
  return (
    <>
      <p className="caps">{t('mdRecent', { n: Math.min(rows.length, RECENT_SHOWN) })}</p>
      <ul className="recent-dots">
        {rows.map((r, i) => {
          const kind = r[0] ? (r[1] ? 'hinted' : 'right') : 'wrong';
          return (
            <li key={i} className={`rd ${kind}`}>
              <span aria-hidden="true">{kind === 'wrong' ? '✗' : kind === 'hinted' ? '✓' : '✓'}</span>
              <span className="sr-only">{t(kind === 'right' ? 'mdRight' : kind === 'hinted' ? 'mdHinted' : 'mdWrong')}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TickForm({ v, busy, error, onSave, onCancel }) {
  const [pts, setPts] = useState({});
  const mock = v.m.criterion.part === 'mock';
  return (
    <form className="tick-form" onSubmit={(e) => { e.preventDefault(); onSave(pts); }}>
      {mock && (
        <fieldset>
          <legend className="caps">{t('tickPoints')}</legend>
          <div className="tick-points">
            {['lesen', 'hoeren', 'schreiben', 'sprechen'].map((k) => (
              <label key={k} className="gf-field">
                <span className="detail">{t(`tickPart${k[0].toUpperCase()}${k.slice(1)}`)}</span>
                <input className="gf-input" type="number" min="0" max="100" inputMode="numeric" value={pts[k] ?? ''} onChange={(e) => setPts({ ...pts, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button-outline" onClick={onCancel} disabled={busy}>{t('tickCancel')}</button>
        <button type="submit" className="button-primary" disabled={busy}>{t('tickSave')}</button>
      </div>
    </form>
  );
}

export function ZoomPlan({ goals, data, today, zoom, onZoom, onPractise, onTick }) {
  const headRef = useRef(null);
  const first = useRef(true);
  const [ticking, setTicking] = useState(false);
  const [tickState, setTickState] = useState({ busy: false, error: '' });
  const rows = overviewRows(goals, data?.plans, today);
  const goal = goals.find((g) => g.id === zoom.goalId);
  const plan = goal ? data?.plans?.[goal.id] : null;
  const pv = zoom.level !== 'overview' && goal ? partView(goal, zoom.partId, plan, today) : null;
  const mItem = zoom.level === 'milestone' && pv ? pv.items.find((i) => i.id === zoom.milestoneId) : null;
  const level = zoom.level === 'milestone' && mItem ? 'milestone' : zoom.level === 'part' && pv ? 'part' : zoom.level === 'milestone' && pv ? 'part' : 'overview';

  // after a zoom change the heading gets the focus (keyboard and screen reader users stay oriented); not on the first draw
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headRef.current?.focus();
  }, [level, zoom.partId, zoom.milestoneId]);
  useEffect(() => { setTicking(false); setTickState({ busy: false, error: '' }); }, [zoom.milestoneId]);

  const out = () => onZoom(level === 'milestone' ? { level: 'part', goalId: zoom.goalId, partId: zoom.partId } : { level: 'overview' });
  const announce = level === 'milestone' ? t('zoomShowMilestone', { title: mItem.title }) : level === 'part' ? t('zoomShowPart', { part: pv.title }) : t('zoomShowOverview');

  async function saveTick(points) {
    setTickState({ busy: true, error: '' });
    const ok = await onTick(goal, mItem.id, points);
    setTickState({ busy: false, error: ok ? '' : t('tickError') });
    if (ok) setTicking(false);
  }

  return (
    <div className="zoom" onKeyDown={(e) => { if (e.key === 'Escape' && level !== 'overview' && !e.defaultPrevented) { e.preventDefault(); out(); } }}>
      <Crumbs zoom={{ ...zoom, level }} goals={goals} pv={pv} mv={mItem} onGo={onZoom} />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {level === 'overview' && (
        <div>
          <h3 ref={headRef} tabIndex={-1} className="sr-only">{t('zoomShowOverview')}</h3>
          <p className="detail">{t('zoomHint')}</p>
          <ul className="zoom-goals">
            {rows.map((row) => {
              const st = goalState(row.goal, 0, today);
              return (
                <li key={row.goal.id} className="zoom-goal">
                  <div className="zoom-goal-head">
                    <span className="goal-name small">{row.goal.title}</span>
                    <span className="detail">{st.ended ? t('goalEnded') : st.weeksLeft === 1 ? t('goalWeekOne') : t('goalWeeks', { n: st.weeksLeft })}</span>
                  </div>
                  <Gantt row={row} today={today} onOpen={(partId) => onZoom({ level: 'part', goalId: row.goal.id, partId })} />
                </li>
              );
            })}
          </ul>
          <p className="zoom-key detail">
            <span className="zoom-today-key" aria-hidden="true" /> {t('zoomTodayKey')}
          </p>
        </div>
      )}

      {level === 'part' && (
        <div>
          <h3 ref={headRef} tabIndex={-1} className="zoom-title">{pv.title}</h3>
          <p className="detail">{goal.title} · {t('zoomPartHead', { n: pv.reached, total: pv.total })}</p>
          <ol className="ms-list">
            {pv.items.map((v) => (
              <li key={v.id}>
                <button type="button" className={`ms-row ${v.state}`} onClick={() => onZoom({ level: 'milestone', goalId: goal.id, partId: zoom.partId, milestoneId: v.id })} aria-label={`${t('zoomOpenMilestone', { title: v.title })}. ${t(STATE_WORD[v.state])}. ${stateText(v)}`}>
                  <MilestoneDot state={v.state} />
                  <span className="ms-main">
                    <span className="ms-title">{v.title}</span>
                    <span className="detail">{stateText(v)}</span>
                  </span>
                  {v.date && v.state !== 'skipped' && <span className="ms-date detail">{fmtDay(v.date)}</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {level === 'milestone' && (
        <div className="ms-detail">
          <h3 ref={headRef} tabIndex={-1} className="zoom-title">{mItem.title}</h3>
          <p className="detail">{goal.title} › {pv.title}{mItem.date ? ` · ${t('mdBy', { date: dueText(mItem.date, mItem.inDays) })}` : ''}</p>
          <p className={`ms-state${mItem.state === 'late' ? ' late' : ''}`}><MilestoneDot state={mItem.state} /> {stateText(mItem)}</p>
          <div className="goal-bar" aria-hidden="true"><span style={{ width: `${fillOf(mItem)}%` }} /></div>
          <MilestoneBody v={mItem} data={data} />
          <div className="next-actions">
            {data.sessions?.[mItem.id] && (
              <button type="button" className="button-primary" onClick={() => onPractise(mItem.id)}>{t('mdPractise', { n: data.sessions[mItem.id].questions })}</button>
            )}
            {mItem.tickable && !mItem.reachedAt && !ticking && (
              <button type="button" className="button-outline" onClick={() => setTicking(true)}>{t('tickDone')}</button>
            )}
          </div>
          {data.sessions?.[mItem.id] && <p className="detail">{t('mdPractiseHint')}</p>}
          {mItem.tickable && !mItem.reachedAt && !data.sessions?.[mItem.id] && <p className="detail">{t('mdOutside')}</p>}
          {ticking && <TickForm v={mItem} busy={tickState.busy} error={tickState.error} onSave={saveTick} onCancel={() => setTicking(false)} />}
        </div>
      )}
      {level !== 'overview' && (
        <button type="button" className="text-button zoom-out" onClick={out}>← {t('zoomOut')}</button>
      )}
    </div>
  );
}

// what is missing in one milestone: words, or the last answers on its topic(s)
function MilestoneBody({ v, data }) {
  const c = v.m.criterion;
  if (c.kind === 'words') {
    const ids = v.missingIds || [];
    return (
      <div>
        <p className="detail">{t('mdNeedWords', { need: v.need, total: v.total, have: v.have })}</p>
        {v.state === 'reached' || v.state === 'solid' ? null : ids.length ? (
          <>
            <p className="caps">{t('mdMissing')}</p>
            <ul className="missing-words">
              {ids.map((id) => <li key={id}>{data.missing?.[id] || id}</li>)}
              {v.total - v.have > ids.length && <li className="detail">{t('mdMissingMore')}</li>}
            </ul>
          </>
        ) : <p className="detail">{t('mdNoMissing')}</p>}
      </div>
    );
  }
  if (c.kind === 'grammar') {
    const d = v.detail || {};
    return (
      <div>
        <p className="detail">
          {c.target === 'introduced' ? t('mdNeedIntro', { n: d.n ?? 0 }) : t('mdNeedTopic', { need: v.need, have: half(v.have), n: d.n ?? 0, days: d.days ?? 0 })}
        </p>
        <Recent rows={(data.recent?.[c.topicId] || []).slice(-RECENT_SHOWN)} />
      </div>
    );
  }
  if (c.kind === 'lessons') {
    const rows = c.lessonIds.flatMap((id) => data.recent?.[id] || []).sort((a, b) => a[2] - b[2]).slice(-RECENT_SHOWN);
    return (
      <div>
        <p className="detail">{t('mdNeedLessons', { have: v.have, total: v.total })}</p>
        <Recent rows={rows} />
      </div>
    );
  }
  if (c.kind === 'exam' && c.lessonId) return <Recent rows={(data.recent?.[c.lessonId] || []).slice(-RECENT_SHOWN)} />;
  return null;
}
