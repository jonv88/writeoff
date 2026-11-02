import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  enableLocalPreview,
  saveLocalWorkspace,
  seedDemoFixtures,
} from '../lib/localWorkspace';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export function AuthScreen({ onLocalPreview }: { onLocalPreview?: () => void }) {
  const { configured, signIn, signUp, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  function startLocal(seed: boolean) {
    enableLocalPreview();
    if (seed) saveLocalWorkspace(seedDemoFixtures());
    window.dispatchEvent(new Event('writeoff-local-preview'));
    onLocalPreview?.();
  }

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
            Cloud accounts need a dedicated Writeoff Supabase project. Add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, apply{' '}
            <code>supabase/migrations/</code>, then restart.
          </p>
          <div className="notice" style={{ marginTop: 20 }}>
            Existing projects under this account (Rhev / RHEV Development) were not reused. Create a
            dedicated Writeoff project, or supply credentials for one you own. No secrets are
            committed. Auth, storage, and isolation are <strong>not verified</strong> until that
            backend is configured and tested.
          </div>
          <div className="dialogactions" style={{ justifyContent: 'flex-start', marginTop: 22 }}>
            <button type="button" className="btn" onClick={() => startLocal(true)}>
              Local preview with sample expenses
            </button>
            <button type="button" className="btn secondary" onClick={() => startLocal(false)}>
              Empty local preview
            </button>
          </div>
          <p className="formhint" style={{ marginTop: 14 }}>
            Local preview stays on this device and is not cloud sync. Use it to exercise suggestions,
            Snap a receipt (manual entry when OCR is unconfigured), filters and CSV export.
          </p>
          <p className="helper" style={{ marginTop: 18 }}>
            Reference preview (immutable template):{' '}
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
              <button type="button" className="linkbtn" onClick={() => startLocal(true)}>
                Or try local preview (this device only)
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
