/** True when a Supabase password-reset email returned to this app. */
export function isRecoveryCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const query = parsed.searchParams;
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery';
  } catch {
    return false;
  }
}
