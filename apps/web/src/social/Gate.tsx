/**
 * The gate, explained kindly: to talk (in the square, or in a DM) you hold a pet with a name. The notice shows what
 * to do next from what the wallet actually holds: name one of your pets (its own page has the naming), or adopt a
 * free inversebrah or Sahur first and then name him. "I named one" asks the Worker to look at the chain again now.
 */
import { useEffect, useState } from 'react';
import type { CatView } from '@emo-pets/chain';
import { chainClient } from '../game/chain';
import { fallbackName, petHref, PETS, hasPet } from '../pets';
import { social } from './store';
import { Avatar } from './ui';

export function GateNotice({ address, compact = false }: { address: string; compact?: boolean }) {
  const [pets, setPets] = useState<CatView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void chainClient?.petsOf(address as `0x${string}`).then((p) => { if (!off) setPets(p); }).catch(() => { if (!off) setPets([]); });
    return () => { off = true; };
  }, [address]);
  const check = async () => {
    setBusy(true); setNote(null);
    try { const g = await social.refreshGate(); if (!g.ok) setNote(g.unknown ? 'Monad did not answer just now. Try again in a moment.' : 'No named pet in this wallet yet. Naming takes a few seconds to land.'); }
    catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const alive = (pets ?? []).filter((p) => p.alive);
  const pick = alive[0] ?? pets?.[0];
  return (
    <div className={`so-gate${compact ? ' compact' : ''}`}>
      <p className="so-gate-lead">To talk in Emotown, hold a pet with a name.</p>
      {!compact && <p className="so-gate-why">Naming a pet costs 10 MON and 80% of it burns EMO. It keeps the square for people who play, and bots out.</p>}
      {pets === null ? <p className="so-gate-why">Looking at your pets…</p> : pick ? (
        <div className="so-gate-pets">
          {(alive.length ? alive : pets).slice(0, 3).map((p) => (
            <a key={`${p.col}:${p.id}`} className="so-gate-pet" href={`${petHref(p.col, p.id)}?name=1`}>
              <Avatar pet={{ col: p.col, id: p.id }} view={p} size={34} />
              <span>Name {fallbackName(p.col, p.id)}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="so-gate-pets">
          <a className="so-gate-pet" href={PETS.frok.mint ?? '/mint'}><Avatar pet={{ col: 'frok', id: 0 }} size={34} /><span>Adopt a free inversebrah</span></a>
          <a className="so-gate-pet" href={PETS.sahur.mint ?? '/tung'}><Avatar pet={{ col: 'sahur', id: 0 }} size={34} /><span>{__THICCUMS__ && hasPet('thiccums') ? 'a free Sahur' : 'or a free Sahur'}</span></a>
          {__THICCUMS__ && hasPet('thiccums') ? <a className="so-gate-pet" href="/thiccums"><Avatar pet={{ col: 'thiccums', id: 0 }} size={34} /><span>{__R3TARDS__ && hasPet('r3tards') ? 'a free Thiccums' : 'or a free Thiccums'}</span></a> : null}
          {__R3TARDS__ && hasPet('r3tards') ? <a className="so-gate-pet" href="/r3tardgotchi"><Avatar pet={{ col: 'r3tards', id: 0 }} size={34} /><span>{__EMONAD__ && hasPet('emonad') ? 'a free r3tard' : 'or a free r3tard'}</span></a> : null}
          {__EMONAD__ && hasPet('emonad') ? <a className="so-gate-pet" href="/emonadgotchi"><Avatar pet={{ col: 'emonad', id: 0 }} size={34} /><span>or a free Emonad</span></a> : null}
        </div>
      )}
      <div className="so-gate-foot">
        <button type="button" className="so-textbtn" onClick={() => void check()} disabled={busy}>{busy ? 'Checking…' : 'I named one: check again'}</button>
        {note && <span className="so-gate-note">{note}</span>}
      </div>
    </div>
  );
}
