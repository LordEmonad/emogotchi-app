// Keeping an open copy of the site from going stale. A deploy replaces the site's files all at once, so a page that
// has been open since before it (a tab left overnight; above all the home-screen app, which a phone keeps alive for
// days and which has no reload button) is still the old code, and the pieces of it that have not been fetched yet (every
// page and sheet is a file of its own) no longer exist.

const ONCE = 'emogotchi.reloaded';
const tried = (what: string) => {
  try { const k = `${ONCE}:${what}`; if (sessionStorage.getItem(k)) return true; sessionStorage.setItem(k, '1'); return false; }
  catch { return true; }   // nowhere to remember that it was done: then it is not done at all (it could go round for ever)
};
const standalone = () => (window.matchMedia?.('(display-mode: standalone)').matches ?? false) || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** The main script this page was started from, as index.html names it. */
const mainScript = (html: Document | string) => {
  if (typeof html !== 'string') return (html.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.getAttribute('src') ?? null;
  return /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1] ?? null;
};

/** Not now: something is open or half done that a reload would throw away. */
const busy = () => {
  if (document.hidden) return true;
  if (document.querySelector('.modal-back, [role="dialog"], .pending-line')) return true;
  for (const f of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input:not([type])')) if (f.value) return true;
  return false;
};
/** Whether the site has changed since this copy of it was loaded (index.html names another main script). */
async function changed(): Promise<boolean> {
  const mine = mainScript(document);
  if (!mine) return false;
  try {
    const r = await fetch('/', { cache: 'no-store', credentials: 'omit' });
    if (!r.ok) return false;
    const now = mainScript(await r.text());
    return !!now && now !== mine;
  } catch { return false; }   // offline: the old copy carries on
}

export function keepFresh() {
  // A piece of the site failed to load (Vite says so with this event). If that is because the site has changed since
  // this copy was loaded, load the page again: the new site's own pieces are then fetched (without this the page went
  // blank). If the site has NOT changed it was the network, and nothing is done: a reload would only throw away what
  // the visitor was doing. Never under an open sheet, a pending transaction or typed text (it waits and looks again),
  // and once for any one address and build.
  let waiting = false;
  window.addEventListener('vite:preloadError', () => {
    if (waiting) return;
    waiting = true;
    const key = `${location.pathname}|${mainScript(document) ?? ''}`;
    let looks = 0;
    const look = async () => {
      if (!(await changed())) { waiting = false; return; }
      if (busy()) { if (++looks < 40) setTimeout(() => void look(), 15_000); else waiting = false; return; }
      if (tried(key)) { waiting = false; return; }   // it has been reloaded for this already: let it be
      location.reload();
    };
    void look();
  });
  // The home-screen app, brought back to the front after a long time away: if the site has changed since this copy
  // was loaded, load it again. Only after half an hour away (anything in progress then is long over: a wallet's request
  // lives five minutes), and never under an open sheet or over something typed.
  if (!import.meta.env.PROD) return;
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!standalone() || !hiddenAt || Date.now() - hiddenAt < 30 * 60_000) return;
    hiddenAt = 0;
    void changed().then((yes) => { if (yes && !busy()) location.reload(); });
  });
}
