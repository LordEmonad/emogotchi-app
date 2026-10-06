/**
 * The r1's UI pieces. One interaction model everywhere: a list of chips the wheel walks through, the side button
 * fires the selected one, a tap fires a chip directly, a long press goes back. Every screen is built from these.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { encode } from 'uqr';
import { Icon } from '../ui/Icon';
import type { PropName } from '../scene/props';

export type Chip = {
  key: string;
  label: string;
  /** a drawn icon (one of the props) or a picture (an on-chain item, as a data: url) */
  icon?: PropName;
  img?: string;
  sub?: string;
  disabled?: boolean;
  /** the row is shown but has no action (a heading, a fact) */
  inert?: boolean;
  run: () => void;
};

/** The chips the wheel moves through: a grid of buttons on the pet screen, tiles on the menu, rows everywhere else. */
export function Chips({ chips, sel, onPick, mode = 'grid' }: { chips: Chip[]; sel: number; onPick: (i: number) => void; mode?: 'grid' | 'list' | 'tiles' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('.is-sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  return (
    <div ref={ref} className={`r1-chips is-${mode}`}>
      {chips.map((c, i) => (
        <button key={c.key} className={`r1-chip ${i === sel ? 'is-sel' : ''} ${c.inert ? 'is-inert' : ''}`} disabled={c.disabled} onPointerUp={(e) => { if (!e.isTrusted) return; onPick(i); if (!c.disabled && !c.inert) c.run(); }}>
          {c.img ? <img className="r1-chip-img" src={c.img} alt="" /> : c.icon ? <Icon name={c.icon} size={mode === 'list' ? 14 : mode === 'tiles' ? 22 : 18} /> : null}
          <span className="r1-chip-l">{c.label}</span>
          {c.sub && <span className="r1-chip-s">{c.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** A screen's title bar: the name on the left, a fact on the right (the balance, a count). */
export function Bar({ title, right }: { title: string; right?: ReactNode }) {
  return <div className="r1-head"><b>{title}</b>{right !== undefined && <span>{right}</span>}</div>;
}

/** Centred text and pictures for a screen that is mostly one thing (the wallet, the words). */
export function Card({ title, lines, children }: { title: string; lines: string[]; children?: ReactNode }) {
  return (
    <div className="r1-card">
      <h1>{title}</h1>
      {children}
      {lines.map((l, i) => <p key={i} className={/^0x[0-9a-fA-F]{40}$/.test(l) ? 'r1-addr' : ''}>{l}</p>)}
    </div>
  );
}

export function Status({ text, kind }: { text: string; kind: string }) {
  return <div className={`r1-status ${kind}`} aria-live="polite"><span>{text}</span></div>;
}

/** Every screen but the room is an overlay on top of it, so the drawing is never re-parsed on the way back. */
export function Over({ children }: { children: ReactNode }) { return <div className="r1-over">{children}</div>; }

export function Qr({ text, size }: { text: string; size: number }) {
  const { d, n } = useMemo(() => {
    const q = encode(text, { border: 2, ecc: 'L' });
    let path = '';
    q.data.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
    return { d: path, n: q.size };
  }, [text]);
  return <svg className="r1-qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="QR code" shapeRendering="crispEdges"><rect width={n} height={n} fill="#F8F8FF" /><path d={d} fill="#1A1620" /></svg>;
}

/** Numbers the way a 2.88" screen can afford them: 82,534 → 82.5k, 1,234,567 → 1.23M. */
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : n.toLocaleString());
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const mon = (wei: bigint) => (Number(wei / 10n ** 12n) / 1e6).toFixed(wei >= 10n ** 18n ? 2 : 3);
