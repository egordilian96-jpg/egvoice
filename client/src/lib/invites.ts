const CODE = /^[A-Za-z0-9_-]{8}$/;
const PUBLIC_HOSTS = new Set(['egvoice.ru', 'www.egvoice.ru', 'egvoice.pplx.app', 'egvoice-web.pplx.app']);

/** Parse only a code or an EG Voice invite. Never navigate/fetch an input URL. */
export function parseInvite(input: string): string | null {
  const value = input.trim();
  if (CODE.test(value)) return value;
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    // Old Windows links can be recovered by extracting their code locally.
    const legacy = url.hostname === 'tauri.localhost' || url.hostname === 'localhost';
    if (!PUBLIC_HOSTS.has(url.hostname) && !legacy) return null;
    if (!['https:', 'http:', 'tauri:'].includes(url.protocol) || url.username || url.password) return null;
    const route = url.hash ? url.hash.slice(1) : url.pathname;
    return route.match(/^\/invite\/([A-Za-z0-9_-]{8})\/?$/)?.[1] ?? null;
  } catch { return null; }
}

/** Desktop origin is not a shareable website. Use an explicit public website. */
export function inviteLink(code: string, publicBase: string): string | null {
  if (!CODE.test(code)) return null;
  try {
    const base = new URL(publicBase);
    if (base.protocol !== 'https:' || !PUBLIC_HOSTS.has(base.hostname) || base.username || base.password) return null;
    return `${base.origin}/#/invite/${code}`;
  } catch { return null; }
}

export async function copyInviteText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* WebView fallback below. */ }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(field);
  field.select();
  try { return document.execCommand('copy'); } catch { return false; }
  finally { field.remove(); }
}
