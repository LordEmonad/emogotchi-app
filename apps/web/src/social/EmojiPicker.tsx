/**
 * The emoji picker (compose.tsx opens it; loaded only then). Unicode's own list up to Emoji 14.0, in its nine groups,
 * with a search over the names and the ones you used last (kept in this browser, and only as code points).
 * Picking one types it into the box; the picker stays open for more.
 */
import { useMemo, useState } from 'react';
import { EMOJI_GROUPS } from './emoji-data';

const toChar = (hex: string) => String.fromCodePoint(...hex.split('-').map((h) => parseInt(h, 16)));
const RECENT_KEY = 'emotown.emoji.recent';
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{2,6}(-[0-9a-f]{2,6}){0,9}$/.test(x)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [recent, setRecent] = useState(readRecent);
  const [tab, setTab] = useState(() => (readRecent().length ? -1 : 0));
  const [q, setQ] = useState('');
  const all = useMemo(() => EMOJI_GROUPS.flatMap((g) => g.items), []);
  const names = useMemo(() => new Map(all), [all]);
  const term = q.trim().toLowerCase();
  const list: [string, string][] = term
    ? all.filter(([, n]) => n.includes(term)).slice(0, 200)
    : tab === -1 ? recent.map((h) => [h, names.get(h) ?? ''] as [string, string]) : EMOJI_GROUPS[tab]?.items ?? [];
  const pick = (hex: string) => {
    onPick(toChar(hex));
    const next = [hex, ...recent.filter((x) => x !== hex)].slice(0, RECENT_MAX);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private window: no memory, still works */ }
  };
  return (
    <div className="so-emoji">
      <input className="so-pick-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" aria-label="Search emoji" maxLength={40} />
      {!term && (
        <div className="so-emoji-tabs" role="tablist">
          {recent.length > 0 && <button type="button" role="tab" aria-selected={tab === -1} className={tab === -1 ? 'on' : ''} onClick={() => setTab(-1)} title="Recent">{toChar('1f558')}</button>}
          {EMOJI_GROUPS.map((g, i) => <button key={g.name} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)} title={g.name}>{toChar(g.icon)}</button>)}
        </div>
      )}
      <div className="so-emoji-grid">
        {list.map(([hex, name]) => <button key={hex} type="button" title={name} aria-label={name || 'emoji'} onClick={() => pick(hex)}>{toChar(hex)}</button>)}
        {term && list.length === 0 && <p className="so-pick-note">No emoji called that.</p>}
      </div>
    </div>
  );
}
