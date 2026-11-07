type LinkHandler = { open(): void; destroy(): void };
type LinkOptions = { token: string; onSuccess(token: string): void; onExit(error: unknown): void };
declare global { interface Window { Plaid?: { create(options: LinkOptions): LinkHandler } } }
let loading: Promise<void> | undefined;
export async function openSandboxLink(token: string): Promise<string | null> {
  if (!window.Plaid) {
    loading ||= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.onload = () => resolve(); script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Bank connection window could not load.')); };
      document.head.appendChild(script);
    });
    await loading;
  }
  if (!window.Plaid) throw new Error('Bank connection window is unavailable.');
  return new Promise((resolve, reject) => {
    const handler = window.Plaid!.create({ token,
      onSuccess(publicToken) { handler.destroy(); resolve(publicToken); },
      onExit(error) { handler.destroy(); if (error) reject(new Error('Bank connection was not completed.')); else resolve(null); },
    });
    handler.open();
  });
}
