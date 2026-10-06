/**
 * Referrals.
 *
 * A link carries `?ref=<referrer>` to the frok mint. When the person it brought connects an account, the site
 * posts the pair here and we remember it. A point is awarded later, and only if that person NAMES a pet.
 *
 * WHY NAMING IS THE BAR. On Monad gas is about a third of a cent, so any threshold counted in transactions is
 * free to farm: "mint a frok and take four actions" costs a script roughly $0.0004 a head. Naming costs a flat
 * 10 MON, which is the only fee a brand-new player can pay, so it puts a real ~$0.26 floor under every single
 * point. That floor is also why the rule is safe to PRINT on the link: unlike a secret gas threshold, telling
 * people the bar does not weaken it. And because naming splits 80/10/10, every referral burns EMO on the way in.
 *
 * WHY THIS SCALES. The counts are never stored. The stats fold already reads every Named event off the chain,
 * so a referrer's score is simply "how many of my referees appear in that set" — derived, never written, and
 * impossible to corrupt. What lives in KV is only the mapping, plus one resolved-index blob the fold keeps warm.
 * The naive design — a KV list() per page view to count someone's referees — dies at 1,000 views a day on the
 * free plan. Inverting it makes /refer cost ZERO KV operations no matter how many people open it, and leaves
 * one write per genuinely new referee as the only thing that scales with success.
 *
 * WHAT IS STORED: two wallet addresses and a timestamp, both already public on chain. No passkey data, no IP,
 * nothing personal. This namespace could be dumped in public and cost nobody anything.
 */
import { createPublicClient, http, isAddress, parseAbi } from 'viem';
import { ipKey } from './social/http.js';

const MONAD = { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } } };
const CATS = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5';
const FROKS = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6';
const SAHURS = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';
const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';
const EMONAD = '0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7';
const ERC721 = parseAbi(['function balanceOf(address) view returns (uint256)']);

/**
 * The one blob the fold keeps: namer -> { r: referrer, ts: when the referral was recorded } (or null for "asked,
 * nobody"). Saves re-reading KV forever. v2 carries the time: a naming only earns the point if it came AFTER the
 * referral (a bot that watched for namers and filed referrals for them after the fact earned points: review
 * 2026-09-27).
 */
const INDEX_KEY = 'index:v2';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

const key = (a) => `who:${a.toLowerCase()}`;

/**
 * Record who brought this player. Write-once: the FIRST link a person arrives on is the one that counts, so a
 * later link cannot steal a referral that has already been earned.
 */
export async function refer(request, env) {
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') {
    return json({ error: 'Send JSON.' }, 415);
  }
  if (!env.REFERRALS) return json({ ok: false, reason: 'unconfigured' }, 503);

  let referee, referrer;
  try {
    const b = await request.json();
    referee = String(b?.referee ?? '');
    referrer = String(b?.ref ?? '');
  } catch { return json({ error: 'Send JSON.' }, 400); }
  // strict:false checks the SHAPE only. viem's default also enforces EIP-55 checksum case, which would reject
  // every lowercase address — including the ones our own /api/stats hands out and the ones a link carries.
  if (!isAddress(referee, { strict: false }) || !isAddress(referrer, { strict: false })) return json({ error: 'Bad address.' }, 400);
  if (referee.toLowerCase() === referrer.toLowerCase()) return json({ ok: false, reason: 'self' }, 409);

  if (env.REFER_LIMIT) {
    const k = ipKey(request);
    if (k) { const { success } = await env.REFER_LIMIT.limit({ key: k }); if (!success) return json({ ok: false, reason: 'rate' }, 429); }
  }
  // the whole site's pace too: every new referee is a KV write, and the free plan counts them
  if (env.REFER_ALL) {
    const { success } = await env.REFER_ALL.limit({ key: 'all' });
    if (!success) return json({ ok: false, reason: 'rate' }, 429);
  }

  // Write-once. Checked before the chain reads so a repeat costs one KV get and nothing else.
  const already = await env.REFERRALS.get(key(referee));
  if (already) return json({ ok: true, reason: 'already', ref: already });

  // "New" means new to Emogotchi, not new to Monad: someone who already holds a pet cannot be referred, which
  // keeps the 82k launch airdrop out of it, but a Monad veteran who has never played still counts.
  try {
    const pub = createPublicClient({ chain: MONAD, transport: http(env.RPC_URL || 'https://rpc.monad.xyz') });
    const [cats, froks, sahurs, thiccums, r3tards, emonad] = await Promise.all([
      pub.readContract({ address: CATS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: FROKS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: SAHURS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: THICCUMS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: R3TARDS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: EMONAD, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n || r3tards > 0n || emonad > 0n) return json({ ok: false, reason: 'existing' }, 409);
  } catch {
    // A chain hiccup must not hand out an unearned referral, and must not permanently burn one either.
    return json({ ok: false, reason: 'retry' }, 503);
  }

  try { await env.REFERRALS.put(key(referee), referrer.toLowerCase(), { metadata: { ts: Math.floor(Date.now() / 1000) } }); }
  catch { return json({ ok: false, reason: 'retry' }, 503); }   // a full KV quota is a retry, not a crash
  return json({ ok: true, reason: 'recorded' });
}

/**
 * Fold referral scores out of the set of addresses that have named a pet.
 *
 * `namers` is a Map of lowercased owner address -> the time (unix seconds) of their latest naming, taken from the
 * chain's own events, which the stats fold already has in hand. Only namers we have never resolved cost a KV read;
 * everything else comes from one blob. Returns { counts, referred, namers } or null when referrals are not configured.
 */
export async function referralScores(env, namers) {
  if (!env.REFERRALS) return null;
  try {
    const blob = await env.REFERRALS.get(INDEX_KEY, 'json');
    const map = blob && blob.v === 2 && blob.map ? blob.map : {};
    let added = 0;

    // Resolve only the new ones. A null is cached too, so a namer with no referrer is never looked up twice.
    for (const a of namers.keys()) {
      if (a in map) continue;
      const { value, metadata } = await env.REFERRALS.getWithMetadata(key(a));
      map[a] = value ? { r: value, ts: Number(metadata?.ts) || 0 } : null;
      added++;
    }
    if (added) await env.REFERRALS.put(INDEX_KEY, JSON.stringify({ v: 2, map }));

    const counts = {};
    // a point only for a naming AFTER the referral was recorded (a referral with no time, from before times were
    // kept, is honoured as it always was)
    for (const [a, namedAt] of namers) { const e = map[a]; if (e && (!e.ts || namedAt > e.ts)) counts[e.r] = (counts[e.r] ?? 0) + 1; }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([wallet, v]) => ({ wallet, v }));
    return { referrers: Object.keys(counts).length, points: Object.values(counts).reduce((a, b) => a + b, 0), counts, top };
  } catch {
    return null;   // never take the stats fold down over referrals
  }
}
