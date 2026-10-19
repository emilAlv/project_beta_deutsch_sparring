'use client';

// "Your plan": one line per goal from its start to its end date, month ticks, milestone dots and a
// "Today" line. Plain HTML + CSS (no chart package). The maths is in lib/goals.js (buildTimeline).

import { useMemo } from 'react';
import { t } from '../lib/ui-text';
import { buildTimeline, monthTicks } from '../lib/goals';
import { fmtDay, fmtMonth } from '../lib/dates';

const CLOSE = 0.11; // dots closer than this (share of the width) put their labels on two levels

function levels(dots) {
  return dots.map((d, i) => {
    const near = (dots[i - 1] && d.pos - dots[i - 1].pos < CLOSE) || (dots[i + 1] && dots[i + 1].pos - d.pos < CLOSE);
    return near ? i % 2 : 0;
  });
}

export default function PlanTimeline({ goals, progress, mode, today }) {
  const tl = useMemo(() => buildTimeline(goals, (g) => progress[g.id] ?? 0, today, mode), [goals, progress, today, mode]);
  const ticks = useMemo(() => monthTicks(tl.from, tl.to), [tl.from, tl.to]);

  if (!goals.length) return <p className="plan-empty muted">{t('planEmpty')}</p>;
  if (!tl.rows.length) return <p className="plan-empty muted">{t('planNothing')}</p>;

  return (
    <div className="plan-grid">
      <div className="plan-axis" aria-hidden="true">
        {ticks.map((k) => (
          <span key={k.day} className="plan-tick" style={{ left: `${k.pos * 100}%` }}>
            <span className="plan-tick-label">{fmtMonth(k.day)}</span>
          </span>
        ))}
      </div>

      {tl.rows.map((row) => {
        const lv = levels(row.dots);
        const deep = lv.some((x) => x === 1);
        return (
          <div key={row.goal.id} className={`plan-row${deep ? ' deep' : ''}`}>
            <div className="plan-label">
              <span className="plan-goal">{row.goal.title}</span>
              <span className="plan-meta">{t(`goalType_${row.goal.type}`)} · {row.goal.level}</span>
              {(row.folded.reached > 0 || row.folded.missed > 0) && (
                <span className="plan-folded">
                  {row.folded.reached > 0 && <span className="plan-tag green">{t('planReached', { n: row.folded.reached })}</span>}
                  {row.folded.missed > 0 && <span className="plan-tag amber">{t('planMissed', { n: row.folded.missed })}</span>}
                </span>
              )}
            </div>
            <div className="plan-lane">
              {ticks.map((k) => <span key={k.day} className="plan-gridline" style={{ left: `${k.pos * 100}%` }} aria-hidden="true" />)}
              <span className="plan-track" style={{ left: `${row.start * 100}%`, width: `${Math.max(0, row.end - row.start) * 100}%` }} />
              {row.dots.map((d, i) => (
                <span
                  key={d.m.id}
                  className={`plan-dot ${d.status}`}
                  style={{ left: `${d.pos * 100}%` }}
                  title={t('msTarget', { title: d.m.title, target: d.m.target })}
                >
                  <span className="plan-pin" />
                  <span className={`plan-dot-label${lv[i] ? ' low' : ''}`}>
                    <span className="plan-dot-date">{fmtDay(d.m.date)}</span>
                    <span className="plan-dot-title">{d.m.title}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {tl.todayInside && (
        <div className="plan-today-layer" aria-hidden="true">
          <span className="plan-today" style={{ left: `${tl.today * 100}%` }}><span>{t('planToday')}</span></span>
        </div>
      )}

      <ul className="plan-legend">
        {['reached', 'next', 'coming', 'missed'].map((k) => (
          <li key={k}><span className={`plan-dot-key ${k}`} />{t(`planLegend${k[0].toUpperCase()}${k.slice(1)}`)}</li>
        ))}
        <li><span className="plan-today-key" />{t('planToday')}</li>
      </ul>
    </div>
  );
}
