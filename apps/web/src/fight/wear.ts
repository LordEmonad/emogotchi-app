/**
 * Fight Club's looks outside the ring: the champion's belt and the loser's black eye, worn for a day after a fight
 * (FightClub.sol `looksOf`), on the pet page, the profile's live pet, the town and the gallery's cards. One store of
 * looks per pet (cached a minute; a look lasts a day) read in batches, and one way to put them on a rig.
 *
 * Never on a dead pet: the contract scores a pet that dies mid-fight (its callback reads no game, on purpose), but a
 * ghost wears nothing (audit, 2026-09-30).
 */
import { useEffect, useState } from 'react';
import type { Collection } from '@emo-pets/chain';
import type { Drawing, PetRig } from '../pet/Pet';
import { canFight, fightClient, type PetRef } from './chain';
import { fightLooks } from './looks';

export type Look = { belt: boolean; blackEye: boolean };
export const NO_LOOK: Look = { belt: false, blackEye: false };
type Ref = { col: Collection; id: number };
const TTL = 60_000;
const cache = new Map<string, { look: Look; at: number }>();
const keyOf = (p: Ref) => `${p.col}:${p.id}`;

/** What the store knows now (nothing until `loadLooks` has run for the pet). */
export const lookOf = (p: Ref): Look => cache.get(keyOf(p))?.look ?? NO_LOOK;

/** Read the looks of `pets` from the contract (those not read in the last minute, unless `force`), in batches of 100. */
export async function loadLooks(pets: readonly Ref[], force = false): Promise<Map<string, Look>> {
  const out = new Map<string, Look>();
  if (!fightClient) return out;
  const now = Date.now();
  const want: PetRef[] = [];
  const seen = new Set<string>();
  for (const p of pets) {
    if (!canFight(p.col)) continue;
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = cache.get(k);
    if (c && !force && now - c.at < TTL) { out.set(k, c.look); continue; }
    want.push({ col: p.col, id: p.id });
  }
  for (let i = 0; i < want.length; i += 100) {
    const slice = want.slice(i, i + 100);
    try {
      const looks = await fightClient.looks(slice);
      slice.forEach((p, j) => { const look = looks[j] ?? NO_LOOK; cache.set(keyOf(p), { look, at: now }); out.set(keyOf(p), look); });
    } catch { /* the page shows the pet as it was; the next read may do better */ }
  }
  return out;
}

const switches = new WeakMap<Element, ReturnType<typeof fightLooks>>();
/** Put a look on a rig (or take it off). The rig's lite profile (the town on WebKit, the r1) cuts a drawing into layers
 *  the belt cannot be drawn into: those pets show nothing, never something broken. */
export function wear(rig: PetRig, character: Drawing, look: Look, alive: boolean) {
  const { root, lite } = rig.fightKit();
  if (lite || !root) return;
  let sw = switches.get(root);
  if (!sw) { sw = fightLooks(root, character); switches.set(root, sw); }
  sw.setBelt(alive && look.belt);
  sw.setBlackEye(alive && look.blackEye);
}

/** The looks of a list of pets, for a page of cards: read once per list, again every minute while the page is open. */
export function useLooks(pets: readonly Ref[] | null): Map<string, Look> {
  const [map, setMap] = useState<Map<string, Look>>(() => new Map());
  const keys = pets?.map(keyOf).join(',') ?? '';
  useEffect(() => {
    if (!pets?.length || !fightClient) { setMap(new Map()); return; }
    let on = true;
    const go = (force: boolean) => { void loadLooks(pets, force).then((m) => { if (on) setMap(m); }); };
    go(false);
    const id = setInterval(() => { if (document.visibilityState === 'visible') go(true); }, TTL);
    return () => { on = false; clearInterval(id); };
  }, [keys]);   // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}
