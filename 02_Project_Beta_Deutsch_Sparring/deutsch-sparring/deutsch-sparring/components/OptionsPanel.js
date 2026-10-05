'use client';

import { t } from '../lib/ui-text';
import { ChevronLeft, ChevronRight } from './icons';

// Left column: "You can say". Every chip just sends its text as a chat message.
// groups: [{ label, chips: [{ text, style: 'soft' | 'outline' }] }]
// Open or hidden is decided by CSS (html[data-options]), so a remembered "hidden" is already
// applied before the page appears – see the small script in app/layout.js.
export default function OptionsPanel({ onToggle, groups, note, onPick, disabled }) {
  return (
    <div className="options-col">
      <aside className="card options" aria-label={t('optionsTitle')}>
        <div className="options-head">
          <h2 className="panel-title">{t('optionsTitle')}</h2>
          <button type="button" className="icon-button" onClick={onToggle} aria-label={t('optionsHide')} title={t('optionsHide')}>
            <ChevronLeft size={18} />
          </button>
        </div>
        {groups.length === 0 && <p className="options-note">{note}</p>}
        {groups.map((g) => (
          <div className="chip-group" key={g.label}>
            <p className="caps">{g.label}</p>
            <div className="chips">
              {g.chips.map((c) => (
                <button
                  key={c.text}
                  type="button"
                  className={`chip chip-${c.style || 'soft'}`}
                  disabled={disabled}
                  onClick={() => onPick(c.text)}
                >
                  {c.text}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length > 0 && <p className="options-foot">{t('optionsFootnote')}</p>}
      </aside>

      <button type="button" className="options-rail" onClick={onToggle} aria-label={t('optionsShow')} title={t('optionsShow')}>
        <ChevronRight size={18} />
        <span className="rail-label">{t('optionsTab')}</span>
      </button>
    </div>
  );
}
