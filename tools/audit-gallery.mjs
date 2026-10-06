// The gallery's facts against the chain: every published list (/api/cats: dead, never died, revived) and every trait a
// card shows (alive, never died, revived N×, deaths, the counters) checked against each pet's own `state()`, read
// straight from the contract. Revived pets all, Sahurs and froks all, a random sample of the 82k cats.
//   node tools/audit-gallery.mjs [sample=300]   (reads mainnet and the live Worker; writes nothing)
import { createPublicClient, http, defineChain } from 'viem';
const { emogotchiAbi, inversegotchiAbi, sahuragotchiAbi } = await import(process.env.ABI ?? '../pfp-moments/audit/abi.mjs');
const chain = defineChain({ id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } } });
const pc = createPublicClient({ chain, transport: http('https://rpc.monad.xyz', { batch: false }) });
const PETS = {
  cat: { addr: '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', abi: emogotchiAbi },
  frok: { addr: '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', abi: inversegotchiAbi },
  sahur: { addr: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7', abi: sahuragotchiAbi },
  // Thiccums' state() is Sahur's (one stunt count), the r3tard's is the cat's (no stunt)
  thiccums: { addr: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec', abi: sahuragotchiAbi },
  r3tards: { addr: '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e', abi: emogotchiAbi },
};
const SAMPLE = Number(process.argv[2] ?? 300);
const expand = (runs) => (runs ?? []).flatMap(([hi, lo]) => Array.from({ length: hi - lo + 1 }, (_, i) => hi - i));
const listOf = (j, k) => (Array.isArray(j[k]) ? j[k] : expand(j[k + 'Runs']));
const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a.slice(0, n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function states(p, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const res = await pc.multicall({ multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11', contracts: slice.map((id) => ({ address: p.addr, abi: p.abi, functionName: 'state', args: [BigInt(id)] })), allowFailure: true });
    res.forEach((r, k) => { if (r.status === 'success') out.set(slice[k], r.result); });
    await sleep(120);
  }
  return out;
}
let problems = 0; const bad = (...a) => { problems++; console.log('  MISMATCH', ...a); };
for (const [pet, p] of Object.entries(PETS)) {
  let j = null;
  for (let t = 0; t < 6 && !j?.starvation; t++) { if (t) { console.log(`  (the index answered ${JSON.stringify(j).slice(0, 120)}; retrying)`); await sleep(15000); } j = await (await fetch(`https://emogotchi.emonad.lol/api/cats${pet === 'cat' ? '' : '?pet=' + pet}`)).json().catch(() => null); }
  if (!j?.starvation) { bad(pet, 'the index is not answering'); continue; }
  const died = new Set(listOf(j, 'died')), never = new Set(listOf(j, 'neverDied')), revived = new Set(listOf(j, 'revived'));
  const supply = Number(await pc.readContract({ address: p.addr, abi: p.abi, functionName: 'totalSupply' }));
  console.log(`${pet}: supply ${supply} | index: dead ${died.size}, never died ${never.size}, revived ${revived.size}, total ${j.starvation?.total} (as of ${j.generatedAt})`);
  const all = Array.from({ length: supply }, (_, i) => i + 1);
  const ids = supply <= 1000 ? all : [...new Set([...revived, ...pick([...never], SAMPLE / 3), ...pick([...died], SAMPLE / 3), ...pick(all, SAMPLE / 3)])];
  const st = await states(p, ids);
  let checked = 0, unindexed = 0;
  for (const id of ids) {
    const v = st.get(id); if (!v) { bad(pet, id, 'state() failed'); continue; }
    checked++;
    const alive = v.alive, deaths = Number(v.deaths), revives = Number(v.revives);
    const inIndex = died.has(id) || never.has(id) || !(j.starvation?.total && id > j.starvation.total);
    if (!inIndex) { unindexed++; continue; }   // minted after the index's mint list was cached: not a wrong fact, a late one
    // the lists
    if (died.has(id) && alive) bad(pet, id, 'on the dead list but alive on chain');
    if (!died.has(id) && !alive) bad(pet, id, 'dead on chain but not on the dead list');
    if (never.has(id) && (!alive || revives > 0)) bad(pet, id, `on the never-died list but alive=${alive} revives=${revives}`);
    if (!never.has(id) && alive && revives === 0 && !died.has(id)) bad(pet, id, 'alive and never revived on chain but not on the never-died list');
    if (revived.has(id) !== (revives > 0)) bad(pet, id, `revived list says ${revived.has(id)} but revives=${revives} on chain`);
    // the card's own traits, which read state() directly: the chip rules must agree with the lists
    const chipNever = alive && deaths === 0;
    if (chipNever !== never.has(id)) bad(pet, id, `card chip "never died" = ${chipNever} (alive=${alive} deaths=${deaths} revives=${revives}) but the list says ${never.has(id)}`);
    if (revives > deaths) bad(pet, id, `revives ${revives} > recorded deaths ${deaths}`);
  }
  console.log(`  checked ${checked} pets${unindexed ? `, ${unindexed} minted after the index's mint cache` : ''}`);
}
console.log(problems ? `${problems} MISMATCHES` : 'ALL CONSISTENT');
