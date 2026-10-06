/**
 * The gate: to post in the town square or send a DM, a wallet must HOLD a named pet right now (a cat, an inversebrah
 * or a Sahur that has a name). Naming costs 10 MON, 80% of which burns EMO, and that real floor is the whole point:
 * on Monad a transaction costs a third of a cent, so a gate counted in transactions is free to farm.
 *
 * Read off the chain, remembered in D1: a yes for five minutes, a no for twenty seconds (someone who has just named
 * a pet should not wait long). Selling your last named pet takes the access away within five minutes. When the chain
 * cannot be read, a yes less than half an hour old still counts; nothing else does.
 */
import { findNamedPet } from './chain.js';
import { now } from './http.js';

const YES_FOR = 5 * 60_000;
const NO_FOR = 20_000;
const GRACE = 30 * 60_000;

/** { ok, pet: {col, id, name} | null, checkedAt, unknown? } */
export async function gateFor(env, address, { force = false } = {}) {
  const row = await env.DB.prepare('SELECT ok, pet_col, pet_id, pet_name, checked_at FROM gate WHERE address = ?').bind(address).first();
  const t = now();
  const shaped = (r, extra = {}) => ({ ok: !!r.ok, pet: r.ok && r.pet_col ? { col: r.pet_col, id: r.pet_id, name: r.pet_name } : null, checkedAt: r.checked_at, ...extra });
  if (row && !force && t - row.checked_at < (row.ok ? YES_FOR : NO_FOR)) return shaped(row);
  let pet;
  try {
    // a pet whose holder was banned opens the gate for nobody until the ban ends (moderation.js)
    const { results } = await env.DB.prepare('SELECT pet_col, pet_id FROM banned_pets WHERE until > ?').bind(t).all();
    const banned = new Set(results.map((r) => `${r.pet_col}:${r.pet_id}`));
    pet = await findNamedPet(env, address, banned.size ? (col, id) => banned.has(`${col}:${id}`) : null);
  } catch (e) {
    console.error('[social] gate read failed', String(e?.shortMessage ?? e).slice(0, 160));
    if (row?.ok && t - row.checked_at < GRACE) return shaped(row, { stale: true });
    return { ok: false, pet: null, checkedAt: row?.checked_at ?? 0, unknown: true };
  }
  await env.DB.prepare(`INSERT INTO gate (address, ok, pet_col, pet_id, pet_name, checked_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET ok = excluded.ok, pet_col = excluded.pet_col, pet_id = excluded.pet_id, pet_name = excluded.pet_name, checked_at = excluded.checked_at`)
    .bind(address, pet ? 1 : 0, pet?.col ?? null, pet?.id ?? null, pet?.name ?? null, t).run();
  // one pet opens the gate for one wallet at a time: any other wallet it let in before is asked again next time.
  // (Handed from wallet to wallet, one named pet used to keep a yes alive in each for five minutes: a crowd of
  // talkers, and a way round a ban, for the price of a transfer. Security review, 2026-09-27.)
  if (pet) await env.DB.prepare('UPDATE gate SET ok = 0, checked_at = 0 WHERE pet_col = ? AND pet_id = ? AND address <> ? AND ok = 1').bind(pet.col, pet.id, address).run();
  return { ok: !!pet, pet, checkedAt: t };
}

/** What the site shows someone who is not through the gate, in words. */
export const GATE_MESSAGE = 'To talk in Emotown, hold a pet with a name. Naming a pet costs 10 MON, and 80% of it burns EMO.';
