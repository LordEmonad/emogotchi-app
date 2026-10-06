/**
 * The town crier, retired (2026-10-03; operator: "the chat should just be for chat"). From 2026-10-02 the index posted
 * what happened on chain (a fight decided, a pet named, a revive, a paid item, the hour's mints) into the square as
 * messages from a sender nobody can sign for. Those events belong with the town's ticker, which the site already fills
 * from the chain (and now fights too: fight/town/FightTown.tsx), so nothing posts as the crier any more.
 *
 * What is left: the sender's address and name, because a message from it may still be quoted by a reply in some open
 * tab (chat.js names it), and `silenceCrier()`, which takes every line it ever posted out of the square once (the room's
 * own purge: D1 rows marked deleted, the room's recent list, a live `del_user` to every open tab) and remembers that it
 * did in the fold table.
 */
import { roomStub } from './chat.js';

/** The crier's sender address: a sentinel nobody can sign for ("c21e" for crier), lowercased like every address in D1. */
export const CRIER = '0x000000000000000000000000000000000000c21e';
export const CRIER_NAME = 'Emotown';

const DONE = 'crier:gone';
let done = false;   // once seen in this isolate, the fold table is not read again

/** Take the crier's old lines out of the square, once. Safe to call on every cron run. */
export async function silenceCrier(env) {
  if (done || !env.DB || !env.CHAT) return;
  const row = await env.DB.prepare('SELECT value FROM fold WHERE key = ?').bind(DONE).first();
  if (row) { done = true; return; }
  const res = await roomStub(env, 'square').fetch('https://room/purge', { method: 'POST', body: JSON.stringify({ address: CRIER, by: CRIER }) });
  const out = await res.json().catch(() => ({}));
  if (!out.ok) throw new Error(`the square would not purge the crier: ${JSON.stringify(out).slice(0, 120)}`);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO fold (key, value, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at`).bind(DONE, JSON.stringify({ deleted: out.deleted ?? 0 }), Date.now()),
    env.DB.prepare(`DELETE FROM fold WHERE key = 'crier:mints'`),
  ]);
  done = true;
  return out.deleted ?? 0;
}
