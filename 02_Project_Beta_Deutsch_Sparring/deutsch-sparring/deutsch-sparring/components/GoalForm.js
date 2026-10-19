'use client';

// The goal form (a dialog): type, level, name, start and end, what it covers, and the milestones.
// A new goal gets a default plan of four evenly spaced milestones, so the timeline is never empty;
// it is regenerated while the dates / type change, until the student edits a milestone.

import { useEffect, useMemo, useState } from 'react';
import { t } from '../lib/ui-text';
import { GOAL_TYPES, GOAL_LEVELS, MAX_MILESTONES, cleanGoal, defaultMilestones, newGoalId, addDays, isDay, dayNum } from '../lib/goals';
import { RULES } from '../lib/grammar';

const RULE_NAMES = Object.values(RULES).filter((r) => typeof r === 'string');

const titleOf = (type) => (target) => t(`msDefault_${type}`, { pct: target });

export default function GoalForm({ goal, today, topics, onSave, onCancel, busy, error }) {
  const isNew = !goal;
  const [type, setType] = useState(goal?.type || 'exam');
  const [level, setLevel] = useState(goal?.level || 'B1');
  const [title, setTitle] = useState(goal?.title || '');
  const [start, setStart] = useState(goal?.startDate || today);
  const [end, setEnd] = useState(goal?.endDate || addDays(today, 90));
  const [section, setSection] = useState(goal?.scope.section || '');
  const [list, setList] = useState(goal?.scope.list || '');
  const [rules, setRules] = useState(goal?.scope.rules || []);
  const [ms, setMs] = useState(goal?.milestones || []);
  const [touched, setTouched] = useState(!isNew);
  const [problem, setProblem] = useState('');
  const id = useMemo(() => goal?.id || newGoalId(), [goal]);

  // word sections and their lists, from the topics the page already has
  const sections = useMemo(() => topics.filter((x) => x.type === 'Wortschatz' && !x.parent), [topics]);
  const lists = useMemo(() => {
    const s = sections.find((x) => x.section === section);
    if (!s) return [];
    return s.lists?.length ? s.lists : s.list ? [s.list] : [];
  }, [sections, section]);

  const datesOk = isDay(start) && isDay(end) && dayNum(end) > dayNum(start);
  useEffect(() => {
    if (touched || !datesOk) return;
    setMs(defaultMilestones({ startDate: start, endDate: end }, titleOf(type)));
  }, [touched, datesOk, start, end, type]);

  const uses = { words: type !== 'grammar', grammar: type !== 'vocab' };
  const editMs = (i, patch) => {
    setTouched(true);
    setMs((all) => all.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  };

  function submit(e) {
    e.preventDefault();
    const draft = {
      id, type, level, title, startDate: start, endDate: end,
      scope: { section: uses.words ? section : '', list: uses.words ? list : '', rules: uses.grammar ? rules : [] },
      milestones: ms.map((m) => ({ ...m, target: Number(m.target) })),
    };
    const clean = cleanGoal(draft);
    if (!draft.title.trim()) return setProblem(t('gfErrTitle'));
    if (!clean) return setProblem(t('gfErrDates'));
    if (clean.milestones.length !== ms.length) return setProblem(t('gfErrMs'));
    setProblem('');
    onSave(clean);
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="card modal goal-form" role="dialog" aria-modal="true" aria-label={t(isNew ? 'goalFormNew' : 'goalFormEdit')} onSubmit={submit}>
        <h2 className="modal-title">{t(isNew ? 'goalFormNew' : 'goalFormEdit')}</h2>

        <div className="gf-grid">
          <div className="gf-field">
            <span className="caps" id="gf-type">{t('gfType')}</span>
            <div className="segmented small" role="radiogroup" aria-labelledby="gf-type">
              {GOAL_TYPES.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{t(`goalType_${k}`)}</button>
              ))}
            </div>
          </div>
          <div className="gf-field">
            <span className="caps" id="gf-level">{t('gfLevel')}</span>
            <div className="segmented small" role="radiogroup" aria-labelledby="gf-level">
              {GOAL_LEVELS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={level === k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{k}</button>
              ))}
            </div>
          </div>
        </div>

        <label className="gf-field">
          <span className="caps">{t('gfTitle')}</span>
          <input className="gf-input" value={title} maxLength={80} placeholder={t('gfTitlePlaceholder')} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <div className="gf-grid">
          <label className="gf-field">
            <span className="caps">{t('gfStart')}</span>
            <input className="gf-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="gf-field">
            <span className="caps">{t('gfEnd')}</span>
            <input className="gf-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>

        {uses.words && (
          <div className="gf-grid">
            <label className="gf-field">
              <span className="caps">{t('gfSection')}</span>
              <select className="gf-input" value={section} onChange={(e) => { setSection(e.target.value); setList(''); }}>
                <option value="">{t('gfSectionAll')}</option>
                {sections.map((s) => <option key={s.id} value={s.section}>{s.section}</option>)}
              </select>
            </label>
            <label className="gf-field">
              <span className="caps">{t('gfList')}</span>
              <select className="gf-input" value={list} disabled={!lists.length} onChange={(e) => setList(e.target.value)}>
                <option value="">{t('gfListAll')}</option>
                {lists.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
        )}

        {uses.grammar && (
          <div className="gf-field">
            <span className="caps">{t('gfRules')}</span>
            <div className="chips">
              {RULE_NAMES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rules.includes(r)}
                  className={`chip small chip-outline${rules.includes(r) ? ' on' : ''}`}
                  onClick={() => setRules((all) => (all.includes(r) ? all.filter((x) => x !== r) : [...all, r]))}
                >
                  {r}
                </button>
              ))}
            </div>
            <span className="detail">{t('gfRulesHelp')}</span>
          </div>
        )}

        <div className="gf-field">
          <span className="caps">{t('gfMilestones')}</span>
          {isNew && !touched && <span className="detail">{t('gfMsAuto')}</span>}
          <ul className="gf-ms">
            {ms.map((m, i) => (
              <li key={m.id}>
                <input className="gf-input" type="date" aria-label={t('gfMsDate')} value={m.date} min={start} max={end} onChange={(e) => editMs(i, { date: e.target.value })} />
                <input className="gf-input" aria-label={t('gfMsTitle')} value={m.title} maxLength={80} onChange={(e) => editMs(i, { title: e.target.value })} />
                <input className="gf-input gf-num" type="number" min="0" max="100" aria-label={t('gfMsTarget')} value={m.target} onChange={(e) => editMs(i, { target: e.target.value })} />
                <label className="gf-check">
                  <input type="checkbox" checked={m.status === 'done'} onChange={(e) => editMs(i, { status: e.target.checked ? 'done' : 'open' })} />
                  {t('gfMsDone')}
                </label>
                <button type="button" className="text-button" aria-label={t('gfMsRemove')} onClick={() => { setTouched(true); setMs((all) => all.filter((_, j) => j !== i)); }}>×</button>
              </li>
            ))}
          </ul>
          {ms.length < MAX_MILESTONES && (
            <button
              type="button"
              className="button-outline small gf-add"
              onClick={() => {
                setTouched(true);
                setMs((all) => [...all, { id: newGoalId('m'), date: datesOk ? end : today, title: '', target: 100, status: 'open' }]);
              }}
            >
              {t('gfMsAdd')}
            </button>
          )}
        </div>

        {(problem || error) && <p className="form-error" role="alert">{problem || error}</p>}
        <div className="modal-actions">
          <button type="button" className="button-outline" onClick={onCancel}>{t('gfCancel')}</button>
          <button type="submit" className="button-primary" disabled={busy}>{t('gfSave')}</button>
        </div>
      </form>
    </div>
  );
}
