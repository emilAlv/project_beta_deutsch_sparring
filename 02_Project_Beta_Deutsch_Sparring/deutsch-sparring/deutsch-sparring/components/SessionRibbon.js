'use client';

// One slim line above the chat: the fixed settings of the running session as small tags,
// "Question X of N" with a mini progress track, and "End session".

import { t, dirKey } from '../lib/ui-text';
import { taskStates } from '../lib/stats';
import { modeOf } from '../lib/session-settings';
import { ProgressTrack } from './Chat';

export default function SessionRibbon({ session, onEnd, disabled }) {
  const st = session.settings;
  if (!st) return null;
  const vocab = st.kind === 'vocab';
  const tags = [
    t(`kind_${modeOf(st)}`),
    st.topicLabel || session.topicName,
    st.level,
    t(`diff_${st.difficulty}`),
    vocab ? t(`dirShort_${dirKey(st.direction)}`) : null,
    vocab && st.source !== 'both' ? t(`source_${st.source}`) : null,
    t(`variantShort_${st.variant}`),
  ].filter(Boolean);
  const done = session.answers.length;
  const current = Math.min(session.total, done + (session.exercise && !session.finished ? 1 : 0)) || 1;
  const label = session.finished
    ? t('ribbonDone', { n: done, total: session.total })
    : t('ribbonQuestion', { n: current, total: session.total });
  return (
    <div className="ribbon" role="region" aria-label={t('ribbonLabel')}>
      <ul className="ribbon-tags">
        {tags.map((x, i) => <li key={`${i}-${x}`} className={i === 1 ? 'tag tag-topic' : 'tag'} title={x}>{x}</li>)}
      </ul>
      <div className="ribbon-progress">
        <span className="ribbon-count">{label}</span>
        <div className="ribbon-track"><ProgressTrack states={taskStates(session)} /></div>
      </div>
      {!session.finished && (
        <button type="button" className="button-outline small" onClick={onEnd} disabled={disabled}>{t('ribbonEnd')}</button>
      )}
    </div>
  );
}
