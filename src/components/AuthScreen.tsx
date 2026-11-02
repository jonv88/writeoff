import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export function AuthScreen() {
  const { configured, signIn, signUp, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="auth-shell">
        <aside className="auth-panel">
          <div className="brand">
            <span className="mark">w</span>
            writeoff<span style={{ color: '#a4b984' }}>.</span>
          </div>
          <h1>Almost ready.</h1>
          <p>
            Customer accounts need a Supabase project. Add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from{' '}
            <code>.env.example</code>, apply <code>supabase/migrations/</code>, then restart the
            app.
          </p>
          <div className="notice" style={{ marginTop: 20 }}>
            Existing projects under this account (Rhev / RHEV Development) were not reused. Create a
            dedicated Writeoff project, or supply credentials for one you own. No secrets are
            committed.
          </div>
          <p className="helper" style={{ marginTop: 18 }}>
            Reference preview (no accounts):{' '}
            <a href="/reference-preview/" target="_blank" rel="noreferrer">
              open locked template
            </a>
          </p>
        </aside>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'sign-in') await signIn(email.trim(), password);
      else if (mode === 'sign-up') {
        await signUp(email.trim(), password);
        setInfo('Check your email to verify your account if confirmation is required.');
      } else {
        await resetPassword(email.trim());
        setInfo('If that email exists, a reset link is on its way.');
      }
    } catch {
      /* surfaced via auth.error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-panel">
        <div className="brand">
          <span className="mark">w</span>
          writeoff<span style={{ color: '#a4b984' }}>.</span>
        </div>
        <div className="kicker">LESS ADMIN. MORE LIVING.</div>
        <h1>
          {mode === 'sign-in' && 'Welcome back.'}
          {mode === 'sign-up' && 'Create your account.'}
          {mode === 'reset' && 'Reset your password.'}
        </h1>
        <p>
          {mode === 'sign-in' && 'Sign in to review expenses and keep receipts with your records.'}
          {mode === 'sign-up' && 'A short setup after this. Your records stay yours.'}
          {mode === 'reset' && 'We’ll email a secure link when the address is registered.'}
        </p>
        <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <div className="formerror" role="alert">
              {error}
            </div>
          )}
          {info && <div className="notice">{info}</div>}
          <div className="dialogactions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : mode === 'sign-up'
                    ? 'Create account'
                    : 'Send reset link'}
            </button>
          </div>
        </form>
        <div className="helper" style={{ marginTop: 18, display: 'grid', gap: 8 }}>
          {mode !== 'sign-in' && (
            <button type="button" className="linkbtn" onClick={() => setMode('sign-in')}>
              Back to sign in
            </button>
          )}
          {mode === 'sign-in' && (
            <>
              <button type="button" className="linkbtn" onClick={() => setMode('sign-up')}>
                Create an account
              </button>
              <button type="button" className="linkbtn" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
