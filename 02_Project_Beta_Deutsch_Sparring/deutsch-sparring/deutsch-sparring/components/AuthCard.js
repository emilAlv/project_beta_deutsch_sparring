'use client';

// The "Log in" / "Create account" card (pages /login and /signup).
import { useState } from 'react';
import { t } from '../lib/ui-text';

const ERRORS = {
  bad_login: 'authErrBadLogin',
  bad_code: 'authErrBadCode',
  username_rules: 'authUsernameHelp',
  password_rules: 'authPasswordHelp',
  username_taken: 'authErrTaken',
  too_many: 'authErrTooMany',
};

export default function AuthCard({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [classCode, setClassCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';

  function switchTo(next) {
    if (next === mode) return;
    setMode(next);
    setError('');
    try {
      window.history.replaceState(null, '', next === 'signup' ? '/signup' : '/login');
    } catch {}
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const name = username.trim();
    // the same rules are checked again on the server
    if (signup && !/^[A-Za-z0-9]{3,24}$/.test(name)) return setError(t('authUsernameHelp'));
    if (signup && password.length < 8) return setError(t('authPasswordHelp'));
    if (signup && !classCode.trim()) return setError(t('authErrNoCode'));
    if (!name || !password) return setError(t('authErrMissing'));
    setBusy(true);
    setError('');
    try {
      const res = await fetch(signup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signup ? { username: name, password, classCode } : { username: name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.replace('/');
        return;
      }
      setError(t(ERRORS[data.code] || 'authErrServer'));
    } catch {
      setError(t('authErrNetwork'));
    }
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <form className="auth-card card" onSubmit={submit} noValidate>
        <div className="auth-brand">
          <span className="auth-wordmark">{t('brand')}</span>
          <p className="auth-tagline">{t('authTagline')}</p>
        </div>

        <div className="segmented" role="tablist" aria-label={t('authSwitch')}>
          <button type="button" role="tab" aria-selected={!signup} className={signup ? '' : 'on'} onClick={() => switchTo('login')}>
            {t('authLogIn')}
          </button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => switchTo('signup')}>
            {t('authCreate')}
          </button>
        </div>

        <label className="auth-field">
          <span className="caps">{t('authUsername')}</span>
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            required
          />
          {signup && <span className="detail">{t('authUsernameHelp')}</span>}
        </label>

        <label className="auth-field">
          <span className="caps">{t('authPassword')}</span>
          <span className="auth-password">
            <input
              name="password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? 'new-password' : 'current-password'}
              maxLength={200}
              required
            />
            <button type="button" className="text-button" aria-pressed={show} onClick={() => setShow((s) => !s)}>
              {show ? t('authHide') : t('authShow')}
            </button>
          </span>
          {signup && <span className="detail">{t('authPasswordHelp')}</span>}
        </label>

        {signup && (
          <label className="auth-field">
            <span className="caps">{t('authClassCode')}</span>
            <input
              name="classCode"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <span className="detail">{t('authClassCodeHelp')}</span>
          </label>
        )}

        <p className="auth-error" role="alert" aria-live="polite">{error}</p>

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? t('authWorking') : signup ? t('authCreate') : t('authLogIn')}
        </button>
      </form>
    </main>
  );
}
