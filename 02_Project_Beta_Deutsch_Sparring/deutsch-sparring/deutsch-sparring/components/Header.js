'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { initials } from '../lib/intents';
import { Flame } from './icons';

export default function Header({ name, streak, onNewSession, onChangeName }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // close the little menu on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">{t('brand')}</span>
        <span className="divider" aria-hidden="true" />
        <span className="tagline">{t('tagline')}</span>
      </div>
      {name && (
        <div className="student">
          {streak > 0 && (
            <>
              <span className="streak"><Flame size={18} />{t('streak', { n: streak })}</span>
              <span className="divider" aria-hidden="true" />
            </>
          )}
          <div className="identity" ref={menuRef}>
            <span>{t('hello', { name })}</span>
            <button
              type="button"
              className="avatar"
              aria-label={t('accountMenu')}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {initials(name)}
            </button>
            {open && (
              <div className="menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewSession(); }}>{t('menuNewSession')}</button>
                <button type="button" role="menuitem" onClick={() => { setOpen(false); onChangeName(); }}>{t('menuChangeName')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
