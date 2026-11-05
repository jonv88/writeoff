import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

type Phase = 'checking' | 'open' | 'needed';

/**
 * Asks for the branch-only owner code before the private preview workspace opens.
 * A missing access route, used by local development, leaves the workspace available.
 */
export function OwnerAccessGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch('/api/preview-access', { credentials: 'same-origin' })
      .then(async (response) => {
        if (cancel) return;
        if (response.status === 404 || response.status === 405) {
          setPhase('open');
          return;
        }
        const body = (await response.json().catch(() => null)) as { ok?: boolean; required?: boolean } | null;
        if (response.ok && body?.ok) setPhase('open');
        else if (body?.required) setPhase('needed');
        else setPhase('open');
      })
      .catch(() => {
        if (!cancel) setPhase('open');
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/preview-access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        setPhase('open');
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message || 'That access code is not valid.');
    } catch {
      setError('Could not check the access code. Try it again.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'open') return children;

  return (
    <div className="auth-shell">
      <aside className="auth-panel">
        <div className="brand">
          <span className="mark">w</span>
          writeoff<span style={{ color: '#a4b984' }}>.</span>
        </div>
        {phase === 'checking' ? (
          <p>Checking access…</p>
        ) : (
          <>
            <div className="kicker">PRIVATE PREVIEW</div>
            <h1>Owner access</h1>
            <p>This preview is limited to its owner. Receipt processing stays off until it is turned on.</p>
            <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
              <label>
                Access code
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              {error && (
                <div className="formerror" role="alert">
                  {error}
                </div>
              )}
              <div className="dialogactions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </div>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
