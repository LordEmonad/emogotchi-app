/**
 * Report something: a message in the square, a DM, or a profile. The Worker keeps a copy of what was reported, so it
 * stays readable to the operator even if it is deleted afterwards.
 */
import { useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { LIMITS, charCount } from './rules';

type Target = { kind: 'chat' | 'dm' | 'profile'; ref?: string; address: string; who: string; text?: string };
let current: Target | null = null;
const subs = new Set<() => void>();
export function reportSheet(t: Target) { current = t; for (const f of subs) f(); }
const close = () => { current = null; for (const f of subs) f(); };

const REASONS: [string, string][] = [['spam', 'Spam'], ['scam', 'A scam or a phishing link'], ['abuse', 'Abuse or hate'], ['impersonation', 'Pretending to be someone'], ['other', 'Something else']];

export function ReportHost() {
  const t = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  const [reason, setReason] = useState('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!t) return null;
  const shut = () => { close(); setDone(false); setErr(null); setNote(''); setReason('spam'); };
  const send = async () => {
    setBusy(true); setErr(null);
    try { await api.post('/report', { kind: t.kind, ref: t.ref, address: t.address, reason, note }); setDone(true); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) shut(); }}>
      <div className="modal so-report" role="dialog" aria-modal="true" aria-label="Report">
        <div className="modal-head"><h2>{done ? 'Thank you' : t.kind === 'profile' ? `Report ${t.who}` : 'Report a message'}</h2><button className="modal-x" onClick={shut} aria-label="Close">✕</button></div>
        {done ? (
          <>
            <p className="modal-sub">The report went to the people who look after Emotown, with a copy of what you reported. You can also block {t.who} so you never see them again.</p>
            <div className="pk-actions"><button className="btn btn-pink" onClick={shut}>Done</button></div>
          </>
        ) : (
          <>
            {t.text && <blockquote className="so-quote">{t.text}</blockquote>}
            <fieldset className="so-reasons">
              <legend>What is wrong?</legend>
              {REASONS.map(([k, label]) => <label key={k}><input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} /> {label}</label>)}
            </fieldset>
            <label className="so-field"><span>Anything to add? (optional)</span>
              <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.note * 2} />
              {charCount(note) > LIMITS.note - 60 && <em className="so-count">{LIMITS.note - charCount(note)}</em>}
            </label>
            {err && <p className="modal-err" role="alert">{err}</p>}
            <div className="pk-actions">
              <button className="btn btn-ghost" onClick={shut}>Cancel</button>
              <button className="btn btn-pink" onClick={() => void send()} disabled={busy || charCount(note) > LIMITS.note}>{busy ? 'Sending…' : 'Report'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
