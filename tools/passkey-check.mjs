// Headless end-to-end check of the passkey account (apps/web/src/passkey), against a LOCAL FORK, never mainnet.
// Chrome's DevTools virtual authenticator answers the WebAuthn PRF extension, so no phone is needed; anvil stands in
// for Monad so the account can be funded and a cat handed to it.
//
//   ~/.foundry/bin/anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8546 --silent &
//   (cd apps/web && VITE_RPC_URL=http://127.0.0.1:8546 VITE_PASSKEY=on npx vite --port 5188 --strictPort) &
//   OUT=<dir for screenshots> node tools/passkey-check.mjs
//
// The PRF secret of a virtual authenticator lives and dies with the browser launch, so every run makes a new,
// worthless account. The recovery phrase it reads is checked in memory and never written anywhere.
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPublicClient, createTestClient, encodeFunctionData, http, parseAbi, parseEther, stringToHex, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { mnemonicToAccount } from 'viem/accounts';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://localhost:5188';
const RPC = process.env.RPC ?? 'http://127.0.0.1:8546';
const ROOT = new URL('..', import.meta.url).pathname;
const env = Object.fromEntries(readFileSync(`${decodeURIComponent(ROOT)}apps/web/.env.local`, 'utf8').split('\n').filter((l) => /^VITE_\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const CAT = env.VITE_CONTRACT_ADDRESS, FROK = env.VITE_INVERSE_ADDRESS, ITEMS = env.VITE_ITEMS_ADDRESS;
const chain = { id: 143, name: 'Monad', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pc = createPublicClient({ chain, transport: http(RPC) });
const tc = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
const nft = parseAbi(['function ownerOf(uint256) view returns (address)', 'function balanceOf(address) view returns (uint256)', 'function transferFrom(address,address,uint256)', 'function approve(address,uint256)', 'function setApprovalForAll(address,bool)', 'function feed(uint256) payable', 'function pet(uint256,uint256)', 'function mint()']);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; log(ok ? '  PASS' : '  FAIL', name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 0. the constants that can never change
{
  const src = readFileSync(`${decodeURIComponent(ROOT)}apps/web/src/passkey/account.ts`, 'utf8');
  const salt = /PRF_SALT: Hex = '0x([0-9a-f]{64})'/.exec(src)?.[1];
  check('PRF salt is sha256("mera.prf.salt.v1")', salt === createHash('sha256').update('mera.prf.salt.v1').digest('hex'));
  check("derivation path is m/44'/60'/0'/0/0", src.includes(`DERIVATION_PATH = "m/44'/60'/0'/0/0"`));
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const errors = [];
async function newPage({ prf = true, fakeMetaMask = false, fresh = false } = {}) {
  // fresh: its own storage, as a different visitor would have
  const page = await (fresh ? await browser.createBrowserContext() : browser).newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|api\/(cats|stats|starvation)/.test(m.text())) errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 240)}`));
  const cdp = await page.createCDPSession();
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: prf } });
  if (fakeMetaMask) {
    await page.evaluateOnNewDocument(() => {
      const subs = {}; const calls = [];
      window.__mm = { calls, emit: (ev, v) => (subs[ev] ?? []).forEach((f) => f(v)) };
      window.ethereum = { isMetaMask: true, on: (ev, f) => { (subs[ev] ??= []).push(f); }, removeListener() {}, async request({ method }) { calls.push(method); if (method === 'eth_chainId') return '0x8f'; if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x2222222222222222222222222222222222222222']; return null; } };
    });
  }
  return { page, cdp, authenticatorId };
}
const shot = async (page, name) => { await sleep(420); await page.screenshot({ path: `${OUT}/passkey-${name}.png` }); };
// A REAL click, dispatched through the browser's input pipeline. It has to be: the confirm buttons refuse a
// synthetic event (`pressed()` in Sheets.tsx), which is what stops a script on the page from signing by itself.
// A test that clicked with el.click() would be testing a door the product deliberately does not have.
const clickText = async (page, sel, text, timeout = 15000) => {
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.innerText.includes(t) && !e.disabled && e.offsetParent !== null), { timeout }, sel, text);
  for (const h of await page.$$(sel)) {
    if (await h.evaluate((e, t) => e.innerText.includes(t) && !e.disabled && e.offsetParent !== null, text)) { await h.click(); return; }
  }
  throw new Error(`nothing clickable matching ${sel} / "${text}"`);
};
const sheetText = (page) => page.evaluate(() => [...document.querySelectorAll('.pk-back')].filter((e) => e.style.display !== 'none').map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' || '));
const waitSheet = (page, text, timeout = 20000) => page.waitForFunction((t) => [...document.querySelectorAll('.pk-back')].some((e) => e.style.display !== 'none' && e.innerText.includes(t)), { timeout }, text);
const noSheet = (page) => page.evaluate(() => document.querySelectorAll('.pk-back').length === 0);
const numbersIn = (page) => page.waitForFunction(() => { const v = [...document.querySelectorAll('.pk-back')].find((e) => e.style.display !== 'none'); const cells = v ? [...v.querySelectorAll('.pk-row > span:last-child')] : []; return cells.length > 0 && cells.every((c) => c.innerText.trim() !== '…'); }, { timeout: 20000 });
const confirmTx = async (page, label = 'Confirm') => { await page.waitForFunction(() => { const b = [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.offsetParent !== null); return b && !b.disabled; }, { timeout: 20000 }); await clickText(page, '.pk-back .btn-pink', label); };

try {
  // ---- 1. create an account from the connect sheet
  log('1. create');
  const { page } = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clickText(page, 'button', 'Connect wallet');
  await page.waitForSelector('.wallet-opt');
  await shot(page, '01-connect');
  check('with no wallet installed, WalletConnect leads and the passkey follows', /WalletConnect/.test(await page.$eval('.wallet-list .wallet-opt', (e) => e.innerText)));
  await clickText(page, '.wallet-opt', 'Passkey account');
  await waitSheet(page, 'Create an account');
  await shot(page, '02-onboard');
  await clickText(page, '.pk-back .wallet-opt', 'Create an account');
  await waitSheet(page, 'Back it up after');
  const gated = await page.evaluate(() => [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.innerText.includes('Create with passkey')).disabled);
  check('create is disabled until the box is ticked', gated === true);
  await shot(page, '03-warn');
  await page.click('.pk-back .pk-check input');
  await clickText(page, '.pk-back .btn-pink', 'Create with passkey');
  await waitSheet(page, 'Your account is ready');
  const address = await page.$eval('.pk-back .pk-addr', (e) => e.innerText.trim());
  check('an address came back', /^0x[0-9a-fA-F]{40}$/.test(address), address);
  await shot(page, '04-made');

  const stored = await page.evaluate(() => ({ rec: JSON.parse(localStorage.getItem('emogotchi.passkey') ?? 'null'), all: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) }));
  check('the record is public data only', !!stored.rec && Object.keys(stored.rec).sort().join() === 'address,createdAt,credentialId,transports,v', Object.keys(stored.rec ?? {}).join());
  check('no 32-byte secret anywhere in storage', !/(0x)?[0-9a-f]{64}/i.test(stored.all));
  await clickText(page, '.pk-back .btn-pink', 'Done');
  await page.waitForSelector('.wallet-chip', { timeout: 15000 });
  check('header shows the account as a passkey wallet', (await page.$eval('.wallet-chip', (e) => e.textContent)).includes('passkey'));
  check('connect sheet closed', (await page.$('.modal-back')) === null);
  await shot(page, '05-connected');

  // ---- 2. fund it, hand it a cat
  await tc.setBalance({ address, value: parseEther('50') });
  // any living cat will do: take one from whoever holds it (this is a fork; nothing here touches mainnet)
  const gameAbi = JSON.parse(readFileSync(`${decodeURIComponent(ROOT)}contracts/out/Emogotchi.sol/Emogotchi.json`, 'utf8')).abi;
  let catId = null; let holder = null;
  // since the Great Starvation (2026-09-24) nearly every low-numbered cat is dead: look among the crowned first (a crown
  // is only ever worn by a living cat), then fall back to the old scan
  const crowned = await pc.readContract({ address: CAT, abi: gameAbi, functionName: 'crownList' }).catch(() => []);
  // crownList() returns four parallel arrays (ids, scores, streaks, alive), not a list of cats: read it as the ids array
  // (it was mapped as cats, which only ever tried the first crowned id plus three numbers that were not ids)
  const crownIds = Array.isArray(crowned?.[0]) ? crowned[0] : [];
  const ids = [...crownIds.map((x) => BigInt(x)), ...Array.from({ length: 35 }, (_, i) => BigInt(i + 5))];
  for (const id of ids) { const s = await pc.readContract({ address: CAT, abi: gameAbi, functionName: 'state', args: [id] }); if (s.alive && !s.asleep && Number(s.energy) > 5) { catId = id; holder = s.owner; break; } }   // with energy left: a cat at 0 falls asleep by itself mid-test
  if (catId === null) throw new Error('no living cat found to lend the test');
  await tc.impersonateAccount({ address: holder });
  await tc.setBalance({ address: holder, value: parseEther('100') });
  const { createWalletClient } = await import('viem');
  const op = createWalletClient({ chain, transport: http(RPC), account: holder });
  await op.sendTransaction({ to: CAT, data: encodeFunctionData({ abi: nft, functionName: 'transferFrom', args: [holder, address, catId] }) });
  check(`cat #${catId} handed to the account`, (await pc.readContract({ address: CAT, abi: nft, functionName: 'ownerOf', args: [catId] })).toLowerCase() === address.toLowerCase());

  // ---- 3. mint a frok after a reload: restored, locked, so the free mint asks for the passkey once
  log('3. mint (restored + locked)');
  await page.goto(`${BASE}/mint`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.wallet-chip', { timeout: 15000 });
  check('a reload restores the account', (await page.$eval('.wallet-chip', (e) => e.innerText)).toLowerCase().includes(address.slice(2, 6).toLowerCase()));
  await clickText(page, '.mint-btn', 'Mint inversebrah');
  await waitSheet(page, 'Mint an inversebrah');
  await numbersIn(page);
  await shot(page, '06-mint-confirm');
  check('locked account asks for the passkey', (await sheetText(page)).includes('Confirm with passkey'));
  await confirmTx(page, 'Confirm with passkey');
  await page.waitForFunction(() => /yours/i.test(document.querySelector('.mint-btn')?.innerText ?? ''), { timeout: 60000 });
  check('frok minted on chain', (await pc.readContract({ address: FROK, abi: nft, functionName: 'balanceOf', args: [address] })) === 1n);

  // ---- 4. home: a paid feed shows the sheet with the money on it; cancel sends nothing
  log('4. paid care');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.cat-tab', { timeout: 30000 });
  await page.evaluate((id) => [...document.querySelectorAll('.cat-tab')].find((e) => e.innerText.includes(`#${id}`) && !e.classList.contains('is-frok')).click(), String(catId));
  await sleep(800);
  const nonce0 = await pc.getTransactionCount({ address });
  await clickText(page, 'button', 'Feed');
  await waitSheet(page, `Feed Emogotchi #${catId}`);
  await numbersIn(page);
  const feedSheet = await sheetText(page);
  check('the sheet states the amount', /Amount 1 MON/.test(feedSheet), feedSheet.slice(0, 200));
  check('the sheet says 80%, and nothing more', feedSheet.includes('80% of it buys EMO and burns it') && !/20%|10%|treasury|team/i.test(feedSheet));
  await shot(page, '07-feed-confirm');
  await clickText(page, '.pk-back .btn-ghost', 'Cancel');
  await sleep(1500);
  check('cancel sends nothing', (await pc.getTransactionCount({ address })) === nonce0 && await noSheet(page));
  await sleep(1500);
  const bal0 = await pc.getBalance({ address });
  await clickText(page, 'button', 'Feed');
  await waitSheet(page, `Feed Emogotchi #${catId}`);
  await confirmTx(page, 'Confirm');
  await page.waitForFunction(() => document.querySelectorAll('.pk-back').length === 0, { timeout: 20000 });
  for (let i = 0; i < 40 && (await pc.getTransactionCount({ address })) === nonce0; i++) await sleep(500);
  const bal1 = await pc.getBalance({ address });
  check('the feed went out and cost 1 MON + gas', (await pc.getTransactionCount({ address })) === nonce0 + 1 && bal0 - bal1 >= parseEther('1') && bal0 - bal1 < parseEther('1.2'), `${Number(bal0 - bal1) / 1e18} MON`);
  await sleep(9000); // let the eating animation finish and the buttons come back

  // ---- 4b. the site's Send sheet with a passkey account (2026-09-27): the passkey's confirm must come up ON TOP of it
  // (both sat at z-index 60 and the Send sheet, added later to the page, covered the Confirm: the security review)
  log('4b. Send sheet + passkey');
  const friend2 = '0x' + [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await clickText(page, 'button', 'Send this cat');
  await page.waitForSelector('.send .send-input', { timeout: 15000 });
  await page.type('.send .send-input', friend2);
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('.send .pk-actions .btn-pink')].find((e) => e.offsetParent !== null); return b && !b.disabled && b.innerText.includes('Continue'); }, { timeout: 60000 });
  await clickText(page, '.send .pk-actions .btn-pink', 'Continue');
  await page.waitForSelector('.send-tick input', { timeout: 15000 });
  await page.click('.send-tick input');
  const nonceSend = await pc.getTransactionCount({ address });
  await clickText(page, '.send .pk-actions .btn-pink', 'Send');
  await waitSheet(page, `Send Emogotchi #${catId}`);
  await numbersIn(page);
  const onTop = await page.evaluate(() => { const b = [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.offsetParent !== null); if (!b) return false; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && b.contains(hit); });
  check('the passkey confirm is on top of the Send sheet, where a press lands on it', onTop);
  const sendSheet = await sheetText(page);
  check('and it names the pet and the whole recipient', sendSheet.toLowerCase().includes(friend2) && sendSheet.includes(`Send Emogotchi #${catId}`), sendSheet.slice(0, 160));
  await shot(page, '07b-send-confirm');
  await confirmTx(page, 'Confirm');
  await page.waitForSelector('.send-done', { timeout: 60000 });
  check('the cat went to them, one transaction', (await pc.readContract({ address: CAT, abi: nft, functionName: 'ownerOf', args: [catId] })).toLowerCase() === friend2 && (await pc.getTransactionCount({ address })) === nonceSend + 1);
  await clickText(page, '.send .pk-actions .btn-pink', 'Done');
  // and back again (the rest of this run uses the cat)
  await tc.impersonateAccount({ address: friend2 });
  await tc.setBalance({ address: friend2, value: parseEther('1') });
  { const { createWalletClient } = await import('viem'); await createWalletClient({ chain, transport: http(RPC), account: friend2 }).sendTransaction({ to: CAT, data: encodeFunctionData({ abi: nft, functionName: 'transferFrom', args: [friend2, address, catId] }) }); }
  for (let i = 0; i < 20 && (await pc.readContract({ address: CAT, abi: nft, functionName: 'ownerOf', args: [catId] })).toLowerCase() !== address.toLowerCase(); i++) await sleep(500);

  // ---- 5. a harmless free call goes through with no sheet while unlocked (the frok's care)
  log('5. silent call');
  await page.evaluate(() => document.querySelector('.cat-tab.is-frok').click());
  await sleep(1200);
  const nonce1 = await pc.getTransactionCount({ address });
  await clickText(page, 'button', 'Feed');
  let sawSheet = false;
  for (let i = 0; i < 40 && (await pc.getTransactionCount({ address })) === nonce1; i++) { if (!(await noSheet(page))) sawSheet = true; await sleep(250); }
  check('free frok care signs without a sheet', (await pc.getTransactionCount({ address })) === nonce1 + 1 && !sawSheet);
  await sleep(9000);

  // ---- 6. the account screen
  log('6. account screen');
  await page.click('.wallet-chip');
  await clickText(page, '.wallet-pop button', 'Account');
  await waitSheet(page, 'Send MON, pets or items');
  await sleep(400);
  await shot(page, '08-account-receive');
  check('balance is shown', /\d/.test(await page.$eval('.pk-balance', (e) => e.innerText)));
  // send MON
  const friend = '0x00000000000000000000000000000000000A11cE';
  const friendBefore = await pc.getBalance({ address: friend });
  await clickText(page, '.pk-tabs button', 'Send MON');
  await page.type('.pk-pane .pk-field input[placeholder="0x…"]', friend);
  await page.type('.pk-pane .pk-amount input', '1.5');
  await shot(page, '09-send');
  await clickText(page, '.pk-pane .btn-pink', 'Review');
  await waitSheet(page, 'Send 1.5 MON');
  await numbersIn(page);
  await shot(page, '10-send-confirm');
  await confirmTx(page, 'Confirm');
  await waitSheet(page, 'Sent.');
  check('1.5 MON arrived', (await pc.getBalance({ address: friend })) - friendBefore === parseEther('1.5'));
  // send a pet (the frok) and see the transfer warning
  await clickText(page, '.pk-tabs button', 'Send a pet');
  await page.waitForSelector('.pk-pane select', { timeout: 20000 });
  const frokOption = await page.$eval('.pk-pane select', (s) => [...s.options].find((o) => o.value.startsWith('frok:')).value);
  await page.select('.pk-pane select', frokOption);
  await page.type('.pk-pane .pk-field input[placeholder="0x…"]', friend);
  await clickText(page, '.pk-pane .btn-pink', 'Review');
  await waitSheet(page, 'Send inversebrah #');
  await shot(page, '11-pet-confirm');
  check('a pet transfer is never silent and says it leaves for good', (await sheetText(page)).includes('leave this account for good'));
  await confirmTx(page, 'Confirm');
  await waitSheet(page, 'is on its way');
  check('the frok moved', (await pc.readContract({ address: FROK, abi: nft, functionName: 'ownerOf', args: [BigInt(frokOption.split(':')[1])] })).toLowerCase() === friend.toLowerCase());
  // a contract as the recipient needs the box ticked
  await clickText(page, '.pk-tabs button', 'Send MON');
  await page.type('.pk-pane .pk-field input[placeholder="0x…"]', ITEMS);
  await page.waitForFunction(() => document.querySelector('.pk-pane .pk-check')?.innerText.includes('contract'), { timeout: 15000 });
  check('sending to a contract asks twice', true);
  // the recovery phrase opens the same address in any wallet
  await clickText(page, '.pk-tabs button', 'Recovery phrase');
  await shot(page, '12-backup-warn');
  await clickText(page, '.pk-pane .btn-pink', 'Show with passkey');
  await page.waitForSelector('.pk-words li', { timeout: 20000 });
  const words = await page.$$eval('.pk-words li', (ls) => ls.map((l) => l.lastChild.textContent.trim()));
  check('24 words', words.length === 24);
  check('the phrase imports to the SAME address (BIP-39 / m/44\'/60\'/0\'/0/0)', mnemonicToAccount(words.join(' ')).address.toLowerCase() === address.toLowerCase());
  await clickText(page, '.pk-pane .btn-pink', 'Hide');
  check('hide removes the words from the page', (await page.$('.pk-words')) === null && !(await page.content()).includes(words[3] + '</li>'));
  // lock
  await clickText(page, '.pk-tabs button', 'Settings');
  await shot(page, '13-settings');
  await clickText(page, '.pk-setting .btn', 'Lock now');
  await page.waitForFunction(() => document.querySelector('.pk-lock')?.dataset.on === 'no', { timeout: 5000 });
  check('lock now locks', true);
  await page.click('.pk-back .modal-x');

  // ---- 7. what the provider refuses, and what describeTx calls dangerous (through the app's own modules)
  log('7. refusals and the allowlist');
  const calls = {
    approve: encodeFunctionData({ abi: nft, functionName: 'approve', args: [friend, catId] }),
    approveAll: encodeFunctionData({ abi: nft, functionName: 'setApprovalForAll', args: [friend, true] }),
    transfer: encodeFunctionData({ abi: nft, functionName: 'transferFrom', args: [address, friend, catId] }),
    feed: encodeFunctionData({ abi: nft, functionName: 'feed', args: [catId] }),
    pet: encodeFunctionData({ abi: nft, functionName: 'pet', args: [catId, 1n] }),
    mint: encodeFunctionData({ abi: nft, functionName: 'mint' }),
  };
  const r = await page.evaluate(async (c, CAT, FROK, friend, address) => {
    const { describeTx } = await import('/src/passkey/describe.ts');
    const { passkeyProvider } = await import('/src/passkey/provider.ts');
    const d = (to, data, value = 0n) => { const s = describeTx({ to, data, value }); return { silent: s.silent, risk: s.risk, danger: !!s.danger, title: s.title }; };
    const refused = async (method, params) => { try { await passkeyProvider.request({ method, params }); return 'ALLOWED'; } catch (e) { return e.code ?? String(e.message); } };
    return {
      approve: d(CAT, c.approve), approveAll: d(CAT, c.approveAll), transfer: d(CAT, c.transfer), feedPaid: d(CAT, c.feed, 10n ** 18n), feedFreeOnCat: d(CAT, c.feed),
      pet: d(CAT, c.pet), petWithValue: d(CAT, c.pet, 1n), frokFeed: d(FROK, c.feed), frokMint: d(FROK, c.mint), frokTransfer: d(FROK, c.transfer),
      stranger: d(friend, c.approve), strangerPlain: d(friend, undefined, 5n), deploy: describeTx({ to: null, data: '0x6000', value: 0n }).danger === true,
      ethSign: await refused('eth_sign', [address, '0x' + '11'.repeat(32)]), typed: await refused('eth_signTypedData_v4', [address, '{}']), signTx: await refused('eth_signTransaction', [{}]),
      otherFrom: await refused('eth_sendTransaction', [{ from: friend, to: friend, value: '0x1' }]), wrongChain: await refused('wallet_switchEthereumChain', [{ chainId: '0x1' }]),
      chainId: await passkeyProvider.request({ method: 'eth_chainId' }), block: typeof (await passkeyProvider.request({ method: 'eth_blockNumber' })),
    };
  }, calls, CAT, FROK, friend, address);
  check('approve: asks, flagged dangerous', !r.approve.silent && r.approve.danger && r.approve.risk === 'approval', JSON.stringify(r.approve));
  check('setApprovalForAll to a stranger: asks, flagged dangerous', !r.approveAll.silent && r.approveAll.danger);
  check('transferFrom: asks', !r.transfer.silent && r.transfer.risk === 'transfer' && !r.frokTransfer.silent);
  check('paid feed: asks', !r.feedPaid.silent && r.feedPaid.risk === 'spend');
  check('a cat feed is never silent even at zero value', !r.feedFreeOnCat.silent);
  check('pet (gas only) is silent; with value attached it is not', r.pet.silent && !r.petWithValue.silent);
  check('frok feed and mint are silent', r.frokFeed.silent && r.frokMint.silent);
  check('an unknown contract is dangerous, a plain send asks', r.stranger.danger && !r.stranger.silent && !r.strangerPlain.silent && r.deploy);
  check('eth_sign, typed data and raw signing are refused', r.ethSign === 4200 && r.typed === 4200 && r.signTx === 4200, JSON.stringify([r.ethSign, r.typed, r.signTx]));
  check('a transaction from another address is refused', r.otherFrom === 4100);
  check('another chain is refused; reads pass through', r.wrongChain === 4902 && r.chainId === '0x8f' && r.block === 'string');

  // the sheet for something this site never asks for, seen as a person would see it, on a phone and on a desktop.
  // The request is left running inside the page and its answer polled, so no page promise is left dangling here.
  await page.evaluate(async (CAT, data, from) => {
    const { passkeyProvider } = await import('/src/passkey/provider.ts');
    window.__danger = 'pending';
    passkeyProvider.request({ method: 'eth_sendTransaction', params: [{ from, to: CAT, data }] })
      .then(() => { window.__danger = 'ALLOWED'; }, (e) => { window.__danger = e.code ?? e.message; });
  }, CAT, calls.approveAll, address);
  await waitSheet(page, 'Check this carefully');
  await numbersIn(page);
  await shot(page, '17-danger');
  const dangerText = await sheetText(page);
  const gatedOnTick = await page.evaluate(() => [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.offsetParent !== null).disabled);
  check('a stranger-approval sheet warns and gates on a tick', dangerText.includes('This site never asks for this') && gatedOnTick === true, dangerText.slice(0, 160));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shot(page, '18-danger-desktop');
  await clickText(page, '.pk-back .btn-ghost', 'Cancel');
  await page.waitForFunction(() => window.__danger !== 'pending', { timeout: 10000 });
  check('cancelling a dangerous call rejects it as 4001', (await page.evaluate(() => window.__danger)) === 4001);
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // a script on the page must not be able to sign by itself, even with the account unlocked
  log('7b. a synthetic click cannot sign');
  await page.evaluate(async (CAT, data, from) => {
    const { passkeyProvider } = await import('/src/passkey/provider.ts');
    window.__synth = 'pending';
    passkeyProvider.request({ method: 'eth_sendTransaction', params: [{ from, to: CAT, data }] })
      .then(() => { window.__synth = 'SIGNED'; }, (e) => { window.__synth = e.code ?? e.message; });
  }, CAT, calls.transfer, address);
  await waitSheet(page, 'Send Emogotchi');
  const nonceS = await pc.getTransactionCount({ address });
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { const b = [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.offsetParent !== null); if (b) { b.disabled = false; b.click(); } }); await sleep(250); }
  check('a scripted click on Confirm signs nothing', (await page.evaluate(() => window.__synth)) === 'pending' && (await pc.getTransactionCount({ address })) === nonceS);
  await clickText(page, '.pk-back .btn-ghost', 'Cancel');
  await page.waitForFunction(() => window.__synth !== 'pending', { timeout: 10000 });

  // ---- 7c. message signing is ONE message: Emotown's sign-in, for this site, this account, this chain, now
  log('7c. personal_sign: only the Emotown sign-in');
  const STATEMENT = /SIWE_STATEMENT = '([^']+)'/.exec(readFileSync(`${decodeURIComponent(ROOT)}worker/social/rules.js`, 'utf8'))[1];
  const host = new URL(BASE).host, origin = new URL(BASE).origin;
  const siwe = (o = {}) => createSiweMessage({ domain: host, address, statement: STATEMENT, uri: origin, version: '1', chainId: 143, nonce: 'abcdEFGH12345678', issuedAt: new Date(), expirationTime: new Date(Date.now() + 10 * 60_000), ...o });
  const good = siwe();
  const signs = await page.evaluate(async (tries, address) => {
    const { passkeyProvider } = await import('/src/passkey/provider.ts');
    const out = {};
    for (const [k, text] of Object.entries(tries)) {
      try { await passkeyProvider.request({ method: 'personal_sign', params: [text, address] }); out[k] = 'SIGNED'; } catch (e) { out[k] = e.code ?? String(e.message); }
    }
    return out;
  }, {
    plain: stringToHex('hello, please sign'),
    otherSite: stringToHex(siwe({ domain: 'evil.example', uri: 'https://evil.example' })),
    otherAccount: stringToHex(siwe({ address: friend })),
    otherChain: stringToHex(siwe({ chainId: 1 })),
    otherStatement: stringToHex(siwe({ statement: 'Sign in to something else.' })),
    stale: stringToHex(siwe({ issuedAt: new Date(Date.now() - 20 * 60_000), expirationTime: new Date(Date.now() - 10 * 60_000) })),
    extraLine: stringToHex(good + '\nResources:\n- https://evil.example/approve-all'),
    hidden: stringToHex(good.replace('Sign in to', 'Sign in to\u202e')),
  }, address);
  check('any other message is refused before a sheet opens (plain text, other site, account, chain, statement, stale, extra lines, hidden characters)',
    Object.values(signs).every((v) => v === 4200 || v === 4100) && await noSheet(page), JSON.stringify(signs));
  await page.evaluate(async (hex, address) => {
    const { passkeyProvider } = await import('/src/passkey/provider.ts');
    window.__siwe = 'pending';
    passkeyProvider.request({ method: 'personal_sign', params: [hex, address] }).then((s) => { window.__siwe = s; }, (e) => { window.__siwe = e.code ?? e.message; });
  }, stringToHex(good), address);
  await waitSheet(page, 'Sign in to Emotown');
  const siweSheet = await sheetText(page);
  check('the sign-in sheet shows the whole message', siweSheet.includes(STATEMENT) && siweSheet.includes('Nonce: abcdEFGH12345678') && siweSheet.includes(`URI: ${origin}`), siweSheet.slice(0, 160));
  await shot(page, '19-siwe');
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { const b = [...document.querySelectorAll('.pk-back .btn-pink')].find((e) => e.offsetParent !== null); if (b) { b.disabled = false; b.click(); } }); await sleep(200); }
  check('a scripted click on Sign in signs nothing', (await page.evaluate(() => window.__siwe)) === 'pending');
  await clickText(page, '.pk-back .btn-pink', 'Sign in');
  await page.waitForFunction(() => window.__siwe !== 'pending', { timeout: 20000 });
  const sig = await page.evaluate(() => window.__siwe);
  check('a real press signs, and the signature is this account\'s', typeof sig === 'string' && await verifyMessage({ address, message: good, signature: sig }), String(sig).slice(0, 20));

  // ---- 8. disconnect keeps it remembered; forget + "I already have one" returns the same account
  log('8. disconnect, forget, sign in again');
  await page.click('.wallet-chip');
  await clickText(page, '.wallet-pop button', 'Disconnect');
  await clickText(page, 'button', 'Connect wallet');
  await page.waitForSelector('.wallet-opt');
  const listText = await page.$eval('.modal .wallet-list', (e) => e.innerText.replace(/\s+/g, ' ').trim());
  check('the connect sheet remembers the account', listText.toLowerCase().includes(address.slice(0, 6).toLowerCase()), listText.slice(0, 200));
  await shot(page, '14-remembered');
  await clickText(page, '.wallet-other', 'Use a different');
  await page.waitForFunction(() => !document.querySelector('.wallet-other'), { timeout: 5000 });
  check('forgetting clears the record', (await page.evaluate(() => localStorage.getItem('emogotchi.passkey'))) === null);
  await clickText(page, '.wallet-opt', 'Passkey account');
  await clickText(page, '.pk-back .wallet-opt', 'I already have one');
  await page.waitForSelector('.wallet-chip', { timeout: 20000 });
  check('signing in with the same passkey opens the SAME address', (await page.evaluate(() => JSON.parse(localStorage.getItem('emogotchi.passkey')).address)).toLowerCase() === address.toLowerCase());

  // ---- 8b. the other pages that connect a wallet keep their own copy of the connect code: they must
  // recognise a remembered passkey account and read the chain through it, with no sheet and no crash
  log('8b. claim and shop');
  await page.goto(`${BASE}/claim`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.wallet-chip', { timeout: 20000 });
  // (loading is where the page starts: since the pages load as their own chunks it can still be there when the card appears)
  await page.waitForFunction(() => { const st = document.querySelector('.claim-card')?.dataset.status; return st && st !== 'loading' && st !== 'checking' && st !== 'idle'; }, { timeout: 45000 }).catch(() => {});
  const claimStatus = await page.$eval('.claim-card', (e) => e.dataset.status).catch(() => null);
  check('the claim page reads the passkey account on chain', ['not-listed', 'open', 'claimed'].includes(String(claimStatus)), String(claimStatus));
  await shot(page, '19-claim');
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.wallet-chip', { timeout: 20000 });
  // the shop's cards, or (the grid, ShopGrid.tsx) its tiles
  await page.waitForSelector('.item-card, .st-tile:not(.is-skel)', { timeout: 45000 }).catch(() => {});
  const items = await page.$$eval('.item-card, .st-tile:not(.is-skel)', (es) => es.length).catch(() => 0);
  check('the shop lists items for the passkey account', items > 0, `${items} items`);
  await shot(page, '20-shop');
  check('neither page opened a sheet of its own', await noSheet(page));

  // ---- 9. a passkey that cannot do PRF is refused in words, and nothing is remembered
  log('9. no PRF');
  const bad = await newPage({ prf: false, fresh: true });
  await bad.page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clickText(bad.page, 'button', 'Connect wallet');
  await clickText(bad.page, '.wallet-opt', 'Passkey account');
  await clickText(bad.page, '.pk-back .wallet-opt', 'Create an account');
  await bad.page.click('.pk-back .pk-check input');
  await clickText(bad.page, '.pk-back .btn-pink', 'Create with passkey');
  await bad.page.waitForSelector('.pk-back .modal-err', { timeout: 20000 });
  const badMsg = await bad.page.$eval('.pk-back .modal-err', (e) => e.innerText);
  check('no-PRF passkey: a clear message, nothing remembered', /cannot hold an account/.test(badMsg) && (await bad.page.evaluate(() => localStorage.getItem('emogotchi.passkey'))) === null, badMsg.slice(0, 80));
  await shot(bad.page, '15-no-prf');
  await bad.page.close();

  // ---- 10. with MetaMask installed beside it: its events never reach a passkey session, and it is never revoked
  log('10. beside an injected wallet');
  const mm = await newPage({ fakeMetaMask: true, fresh: true });
  await mm.page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clickText(mm.page, 'button', 'Connect wallet');
  await mm.page.waitForSelector('.wallet-opt');
  await shot(mm.page, '16-with-metamask');
  // nothing was taken away: the browser wallet and WalletConnect are still there, and the wallet already
  // installed comes first, with the passkey account under it
  const opts = await mm.page.$$eval('.wallet-list .wallet-opt', (es) => es.map((e) => e.innerText.split('\n')[0].trim()));
  check('every option is still offered, in most-likely order', opts.length === 3 && /Browser wallet/.test(opts[0]) && /WalletConnect/.test(opts[1]) && /Passkey account/.test(opts[2]), opts.join(' | '));
  await clickText(mm.page, '.wallet-opt', 'Passkey account');
  await clickText(mm.page, '.pk-back .wallet-opt', 'Create an account');
  await mm.page.click('.pk-back .pk-check input');
  await clickText(mm.page, '.pk-back .btn-pink', 'Create with passkey');
  await waitSheet(mm.page, 'Your account is ready');
  const addr2 = await mm.page.$eval('.pk-back .pk-addr', (e) => e.innerText.trim());
  await clickText(mm.page, '.pk-back .btn-pink', 'Done');
  await mm.page.waitForSelector('.wallet-chip');
  await mm.page.evaluate(() => { window.__mm.emit('accountsChanged', ['0x3333333333333333333333333333333333333333']); window.__mm.emit('chainChanged', '0x1'); });
  await sleep(600);
  const chip = await mm.page.$eval('.wallet-chip', (e) => e.innerText);
  check('MetaMask switching accounts does not touch the passkey session', chip.toLowerCase().includes(addr2.slice(2, 6).toLowerCase()), chip.replace(/\s+/g, ' '));
  await mm.page.click('.wallet-chip');
  await clickText(mm.page, '.wallet-pop button', 'Disconnect');
  await sleep(600);
  check('disconnecting a passkey never revokes MetaMask', !(await mm.page.evaluate(() => window.__mm.calls)).includes('wallet_revokePermissions'));
  await mm.page.close();

  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  failed++;
  log('  FAIL (threw)', String(e?.stack ?? e).slice(0, 600));
  for (const p of await browser.pages()) { try { await p.screenshot({ path: `${OUT}/passkey-zz-failure-${Math.random().toString(36).slice(2, 6)}.png` }); } catch { /* closed */ } }
  if (errors.length) log('  console:', errors.slice(0, 6).join(' | '));
} finally {
  await browser.close();
}
log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
