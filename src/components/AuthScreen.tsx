import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { LegalNotice } from './LegalNotice';
import {
  clearLocalWorkspaceData,
  emptyLocalWorkspace,
  enableLocalPreview,
  saveLocalWorkspace,
  seedDemoFixtures,
} from '../lib/localWorkspace';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export function RecoveryPanel() {
  const { updatePassword, error, clearError } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
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
        <div className="kicker">PASSWORD RECOVERY</div>
        <h1>Choose a new password.</h1>
        <p>This replaces the password for your Writeoff account. It does not delete expenses or receipts.</p>
        {done ? (
          <div className="notice">Password updated. You can continue in this signed-in account.</div>
        ) : (
          <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
            <label>
              New password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div className="formerror" role="alert">
                {error}
              </div>
            )}
            <div className="dialogactions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}

export function AuthScreen({ onLocalPreview }: { onLocalPreview?: () => void }) {
  const { configured, signIn, signUp, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  function startLocal(seed: boolean) {
    enableLocalPreview();
    if (seed) {
      saveLocalWorkspace(seedDemoFixtures());
    } else {
      clearLocalWorkspaceData();
      saveLocalWorkspace(emptyLocalWorkspace());
    }
    window.dispatchEvent(new Event('writeoff-local-preview'));
    onLocalPreview?.();
  }

  const localGate = (
    <>
      <div className="kicker">BROWSER PREVIEW · NO CLOUD REQUIRED</div>
      <h1>Try Writeoff on this device.</h1>
      <p>
        Explore suggestions, review Business / Personal / Split, snap receipts with on-device OCR,
        and export CSV. Records stay in this browser’s local storage — they do{' '}
        <strong>not sync across devices</strong> (Mac and iPhone keep separate copies).
      </p>
      <div className="notice" style={{ marginTop: 16 }}>
        <strong>Sample data</strong> is synthetic (Demo Studio) — not anyone’s real finances.{' '}
        <strong>Empty workspace</strong> starts blank for your own test expenses. Reset anytime in
        Setup.
      </div>
      <div className="dialogactions" style={{ justifyContent: 'flex-start', marginTop: 22 }}>
        <button type="button" className="btn" onClick={() => startLocal(true)}>
          Open with sample expenses
        </button>
        <button type="button" className="btn secondary" onClick={() => startLocal(false)}>
          Start empty workspace
        </button>
      </div>
      <p className="formhint" style={{ marginTop: 14 }}>
        Receipt OCR runs in your browser (Tesseract.js) — free, no API keys. Fields stay editable;
        accuracy varies (prefer JPEG/PNG; HEIC/PDF limited). Cloud accounts, bank linking, and
        purchases are unavailable.
      </p>
    </>
  );

  if (!configured) {
    return (
      <div className="auth-shell">
        <aside className="auth-panel">
          <div className="brand">
            <span className="mark">w</span>
            writeoff<span style={{ color: '#a4b984' }}>.</span>
          </div>
          {localGate}
          <details style={{ marginTop: 22 }}>
            <summary className="helper" style={{ cursor: 'pointer' }}>
              Cloud accounts (not configured)
            </summary>
            <p className="helper" style={{ marginTop: 10 }}>
              Supabase Auth / Storage code is ready but gated. Add{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for a dedicated
              Writeoff project, apply migrations, then restart. Do not use unrelated projects. No
              secrets are committed.
            </p>
          </details>
          <p className="helper" style={{ marginTop: 18 }}>
            Locked visual template:{' '}
            <a href="/reference-preview/" target="_blank" rel="noreferrer">
              open reference
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
          {mode === 'sign-in' && 'Sign in to sync expenses across devices.'}
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
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
              <button type="button" className="linkbtn" onClick={() => startLocal(true)}>
                Or open local preview with sample expenses
              </button>
              <button type="button" className="linkbtn" onClick={() => startLocal(false)}>
                Or start an empty local workspace
              </button>
              <LegalNotice />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
