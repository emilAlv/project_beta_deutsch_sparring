'use client';

// The "Log in" / "Create account" card (pages /login and /signup).
import { useRef, useState } from 'react';
import { t } from '../lib/ui-text';
import { arrowKeys } from './keys';

const MODES = ['login', 'signup'];

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
  const [badField, setBadField] = useState(''); // 'username' | 'password' | 'classCode': the field the error is about
  const fields = useRef({});
  const signup = mode === 'signup';

  function switchTo(next) {
    if (next === mode) return;
    setMode(next);
    setError('');
    setBadField('');
    try {
      window.history.replaceState(null, '', next === 'signup' ? '/signup' : '/login');
    } catch {}
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const name = username.trim();
    // empty fields first (one clear message, focus on the field), then the rules (the server checks them again)
    const problem = !name ? ['username', 'authErrNoUsername']
      : !password ? ['password', 'authErrNoPassword']
        : signup && !classCode.trim() ? ['classCode', 'authErrNoCode']
          : signup && !/^[A-Za-z0-9]{3,24}$/.test(name) ? ['username', 'authUsernameHelp']
            : signup && password.length < 8 ? ['password', 'authPasswordHelp']
              : null;
    if (problem) {
      setBadField(problem[0]);
      setError(t(problem[1]));
      fields.current[problem[0]]?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setBadField('');
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

        <div className="segmented" role="radiogroup" aria-label={t('authSwitch')} onKeyDown={arrowKeys(MODES, mode, switchTo)}>
          <button type="button" role="radio" aria-checked={!signup} tabIndex={signup ? -1 : 0} className={signup ? '' : 'on'} onClick={() => switchTo('login')}>
            {t('authLogIn')}
          </button>
          <button type="button" role="radio" aria-checked={signup} tabIndex={signup ? 0 : -1} className={signup ? 'on' : ''} onClick={() => switchTo('signup')}>
            {t('authCreate')}
          </button>
        </div>

        <label className="auth-field">
          <span className="caps">{t('authUsername')}</span>
          <input
            name="username"
            aria-invalid={badField === 'username' || undefined}
            aria-describedby={badField === 'username' ? 'auth-error' : undefined}
            ref={(el) => { fields.current.username = el; }}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
          />
          {signup && <span className="detail">{t('authUsernameHelp')}</span>}
        </label>

        <label className="auth-field">
          <span className="caps">{t('authPassword')}</span>
          <span className="auth-password">
            <input
              name="password"
              aria-invalid={badField === 'password' || undefined}
              aria-describedby={badField === 'password' ? 'auth-error' : undefined}
              ref={(el) => { fields.current.password = el; }}
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? 'new-password' : 'current-password'}
              maxLength={200}
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
              aria-invalid={badField === 'classCode' || undefined}
              aria-describedby={badField === 'classCode' ? 'auth-error' : undefined}
              ref={(el) => { fields.current.classCode = el; }}
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              />
            <span className="detail">{t('authClassCodeHelp')}</span>
          </label>
        )}

        <p className="auth-error" id="auth-error" role="alert" aria-live="polite">{error}</p>

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? t('authWorking') : signup ? t('authCreate') : t('authLogIn')}
        </button>
        {!signup && <p className="auth-forgot detail">{t('authForgot')}</p>}
      </form>
    </main>
  );
}
