/**
 * The Notifications sheet (the wallet menu, the phone menu, the nudge on a pet's page): turn pushes on or off on this
 * device, pick what to hear about (every kind, each pet, quiet hours), send yourself a test one. On an iPhone it first
 * explains the home-screen install, because that is the only place Safari delivers pushes.
 */
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { GROUPS, type Kind } from './kinds';
import { push, usePush } from './client';
import './push.css';

const PET_LABEL: Record<string, string> = { cat: 'Cat', frok: 'inversebrah', sahur: 'Sahur', thiccums: 'Thiccums', r3tards: 'r3tard', ...(__EMONAD__ ? { emonad: 'Emonad' } : {}) };
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hour = (h: number) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="nf-switch" disabled={disabled} onClick={() => onChange(!on)} />;
}

export function NotifSheet() {
  const s = usePush();
  const [tested, setTested] = useState(false);
  useEffect(() => { if (!s.open) setTested(false); }, [s.open]);
  if (!s.open) return null;
  const on = s.status === 'on';
  const needsInstall = s.ios && !s.standalone;
  const blocked = s.permission === 'denied';
  const signedIn = s.verified;
  return createPortal(
    <div className="modal-back nf-back" onPointerDown={(e) => { if (e.target === e.currentTarget) push.close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="modal-head">
          <h2>Notifications</h2>
          <button className="modal-x" onClick={() => push.close()} aria-label="Close">✕</button>
        </div>

        {!s.supported ? (
          <p className="send-note">This browser cannot receive push notifications. On an iPhone, add Emogotchi to the home screen with Safari and open it from there.</p>
        ) : needsInstall ? (
          <>
            <p className="send-note">On an iPhone, notifications only reach the home-screen app. Two taps:</p>
            <ol className="nf-steps">
              <li>Tap <b>Share</b> <svg className="nf-share" viewBox="0 0 20 20" aria-hidden><path d="M10 2.5v10M6.5 6l3.5-3.5L13.5 6M4 9.5v6.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> at the bottom of Safari.</li>
              <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              <li>Open <b>Emogotchi</b> from your home screen and come back to this sheet.</li>
            </ol>
          </>
        ) : (
          <div className="nf-status">
            <div>
              <b>{on ? 'On for this device' : 'Off on this device'}</b>
              <small>{blocked ? 'Blocked in the browser settings for this site.' : on ? (s.address ? `Watching the pets of ${s.address.slice(0, 6)}…${s.address.slice(-4)}` : 'No wallet to watch yet. Connect one and it follows.') : s.wallet ? 'Your pets, Emotown and Fight Club, as you choose below.' : 'Connect a wallet so there is something to tell you about.'}</small>
            </div>
            <Switch on={on} disabled={s.busy || blocked} label="Notifications on this device" onChange={(v) => { if (v) void push.enable(); else void push.disable(); }} />
          </div>
        )}
        {s.error && <p className="nf-err">{s.error}</p>}

        {s.supported && !needsInstall && (
          <>
            {GROUPS.map((g) => (
              <div className="nf-group" key={g.title}>
                <h3>{g.title}</h3>
                {g.note && <small>{g.title === 'Emotown' && on && !signedIn ? 'Sign in to Emotown on this device to receive these.' : g.note}</small>}
                {g.kinds.map((k) => (
                  <div className="nf-row" key={k.kind}>
                    <div><b>{k.label}</b><small>{k.hint}</small></div>
                    <Switch on={s.prefs.kinds[k.kind as Kind] !== false} disabled={s.busy} label={k.label} onChange={(v) => push.setKind(k.kind as Kind, v)} />
                  </div>
                ))}
              </div>
            ))}

            {on && s.pets.length > 0 && (
              <div className="nf-group nf-pets">
                <h3>Which pets</h3>
                <small>Every pet this wallet holds. Switch one off to hear nothing about it.</small>
                {s.pets.map((p) => { const key = `${p.col}:${p.id}`; return (
                  <div className="nf-row" key={key}>
                    <div><b>{p.name || `${PET_LABEL[p.col] ?? p.col} #${p.id}`} {p.name && <span>· {PET_LABEL[p.col] ?? p.col} #{p.id}</span>}</b></div>
                    <Switch on={!s.prefs.petsOff.includes(key)} disabled={s.busy} label={p.name || `${PET_LABEL[p.col]} #${p.id}`} onChange={(v) => push.setPet(key, v)} />
                  </div>
                ); })}
              </div>
            )}

            <div className="nf-group">
              <h3>Quiet hours</h3>
              <div className="nf-row">
                <div><b>Hold the quiet ones overnight</b><small>Bowls, poops, crowns, Emotown and fights wait until morning. A starving pet always gets through.</small></div>
                <Switch on={!!s.prefs.quiet} disabled={s.busy} label="Quiet hours" onChange={(v) => push.setQuiet(v ? { from: 23, to: 8 } : null)} />
              </div>
              {s.prefs.quiet && (
                <div className="nf-quiet">
                  from <select value={s.prefs.quiet.from} onChange={(e) => push.setQuiet({ from: Number(e.target.value), to: s.prefs.quiet!.to })}>{HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}</select>
                  to <select value={s.prefs.quiet.to} onChange={(e) => push.setQuiet({ from: s.prefs.quiet!.from, to: Number(e.target.value) })}>{HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}</select>
                  <span>your time</span>
                </div>
              )}
            </div>

            {on && (
              <div className="nf-actions">
                <button className="chip-btn" disabled={s.busy || tested} onClick={() => { setTested(true); void push.test(); }}>{tested ? 'Sent. Check your notifications.' : 'Send me a test'}</button>
              </div>
            )}
            {on && !s.standalone && !s.ios && <p className="send-note">Tip: install Emogotchi from your browser's menu to have it on your home screen.</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The nudge: one card under a pet's care buttons (App renders it after the PetView), until answered. In the page's flow,
 * never fixed over it: a fixed bar at the foot of the screen sat on top of the stunt buttons (the rehearsal's Slap click
 * landed on the bar).
 */
export function NotifNudge() {
  const s = usePush();
  if (s.open || !push.nudgeWanted()) return null;
  return (
    <div className="nf-nudge" role="status">
      <span>Get a nudge when your pet is hungry, and when Emotown has something for you.</span>
      <button className="btn btn-pink btn-sm" onClick={() => { push.open(); }}>Turn on</button>
      <button className="modal-x" aria-label="Not now" onClick={() => push.dismissNudge()}>✕</button>
    </div>
  );
}

export function NotifRoot() { return <NotifSheet />; }
