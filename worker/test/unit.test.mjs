// Unit tests for the pure parts of the social layer: the writing rules both sides share, and the word filter.
//   cd worker && node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkName, cleanText, charCount, normalizeSocial, normalizeUrl, socialLink, findMentions, segments, linkHref, looksLikePhish, LIMITS } from '../social/rules.js';
import { matchesFilter } from '../social/filter.js';

const U = (cp) => String.fromCodePoint(cp);

test('names: ASCII, 3-20, not reserved, not an address', () => {
  assert.equal(checkName('kitty_01').ok, true);
  assert.equal(checkName('@kitty').name, 'kitty');
  assert.equal(checkName('ab').ok, false);
  assert.equal(checkName('a'.repeat(21)).ok, false);
  assert.equal(checkName('Admin').ok, false);
  assert.equal(checkName('LordEmonad').ok, false);
  assert.equal(checkName('0xdeadbeef').ok, false);
  assert.equal(checkName('___').ok, false);
  for (const bad of ['kit ty', 'kitty!', 'kítty', 'kitty' + U(0x200b), '<script>', 'a"b', "o'neil", 'кошка', 'kit-ty']) assert.equal(checkName(bad).ok, false, bad);
  assert.equal(checkName('Kitty').key, 'kitty');
});

test('cleanText strips bidi, zero-width, controls and zalgo; keeps emoji joins', () => {
  const rlo = U(0x202e), zw = U(0x200b), zwj = U(0x200d), nul = U(0), ls = U(0x2028);
  assert.equal(cleanText(`abc${rlo}gpj.exe`), 'abcgpj.exe');
  assert.equal(cleanText(`pa${zw}ss${nul}word`), 'password');
  assert.equal(cleanText(`one${ls}two`), 'one two');
  assert.equal(cleanText('a\n\nb'), 'a b');
  const family = `👨${zwj}👩${zwj}👧`;
  assert.equal(cleanText(family), family);
  const zalgo = 'e' + [0x301, 0x302, 0x303, 0x304, 0x305].map(U).join('');
  assert.ok(charCount(cleanText(zalgo)) <= 3);
  assert.equal(cleanText('  hi  '), 'hi');
});

test('cleanText multiline keeps at most six lines and one blank line in a row', () => {
  const out = cleanText('1\n\n\n\n2\n3\n4\n5\n6\n7\n8', { multiline: true });
  assert.equal(out.split('\n').length, LIMITS.bioLines);
  assert.ok(!out.includes('\n\n\n'));
});

test('socials normalize from handles and links, reject junk', () => {
  assert.deepEqual(normalizeSocial('x', 'https://x.com/EmonadCoin?s=20'), { ok: true, handle: 'EmonadCoin' });
  assert.deepEqual(normalizeSocial('x', '@LordEmo'), { ok: true, handle: 'LordEmo' });
  assert.deepEqual(normalizeSocial('x', 'twitter.com/foo_bar'), { ok: true, handle: 'foo_bar' });
  assert.equal(normalizeSocial('x', 'https://evil.com/foo').ok, false);
  assert.equal(normalizeSocial('x', 'javascript:alert(1)').ok, false);
  assert.equal(normalizeSocial('x', 'a'.repeat(16)).ok, false);
  assert.deepEqual(normalizeSocial('telegram', 't.me/emonad_chat'), { ok: true, handle: 'emonad_chat' });
  assert.equal(normalizeSocial('telegram', 'abc').ok, false);
  assert.deepEqual(normalizeSocial('discord', 'Some.User'), { ok: true, handle: 'some.user' });
  assert.deepEqual(normalizeSocial('discord', '123456789012345678'), { ok: true, handle: '123456789012345678' });
  assert.equal(normalizeSocial('discord', 'bad..name').ok, false);
  assert.deepEqual(normalizeSocial('farcaster', 'https://warpcast.com/dwr.eth'), { ok: true, handle: 'dwr.eth' });
  assert.deepEqual(normalizeSocial('github', 'github.com/LordEmonad'), { ok: true, handle: 'LordEmonad' });
  assert.equal(normalizeSocial('github', 'bad--name-').ok, false);
  assert.deepEqual(normalizeSocial('website', 'emonad.lol/emo.html?utm=1#x'), { ok: true, handle: 'https://emonad.lol/emo.html' });
  assert.deepEqual(normalizeSocial('x', ''), { ok: true, handle: '' });
  assert.equal(normalizeSocial('myspace', 'tom').ok, false);
});

test('website URLs: https only, no credentials, no IPs, look-alikes shown in punycode', () => {
  assert.equal(normalizeUrl('http://example.com'), null);
  assert.equal(normalizeUrl('https://user:pass@example.com'), null);
  assert.equal(normalizeUrl('https://127.0.0.1/x'), null);
  assert.equal(normalizeUrl('https://localhost'), null);
  assert.equal(normalizeUrl('https://example.com:8443/'), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('data:text/html,<script>'), null);
  assert.match(normalizeUrl('https://еmonad.lol'), /^https:\/\/xn--/);
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com');
});

test('socialLink builds only known-platform links', () => {
  assert.equal(socialLink('x', 'foo').href, 'https://x.com/foo');
  assert.equal(socialLink('discord', 'some.user').href, null);
  assert.equal(socialLink('website', 'https://example.com/a').label, 'example.com/a');
});

test('mentions: up to five, lowercased, not inside words or emails', () => {
  assert.deepEqual(findMentions('hi @Kitty and @bob_1, @kitty again'), ['kitty', 'bob_1']);
  assert.deepEqual(findMentions('mail me at a@b.com'), []);
  assert.deepEqual(findMentions('@a @ab'), []);
  assert.equal(findMentions('@aaa @bbb @ccc @ddd @eee @fff').length, 5);
  assert.deepEqual(findMentions('@' + 'x'.repeat(21)), []);
});

test('segments: links are inert pieces, dangerous schemes get no href, mentions only when known', () => {
  const s = segments('go to https://evil.xyz/claim, or www.a.com now! javascript:alert(1) and @kitty and @nobody', { kitty: '0xabc' });
  const kinds = s.map((x) => x.kind);
  assert.ok(kinds.includes('link') && kinds.includes('mention'));
  const links = s.filter((x) => x.kind === 'link');
  assert.equal(links[0].v, 'https://evil.xyz/claim');
  assert.equal(links[0].href, 'https://evil.xyz/claim');
  assert.equal(links[1].href, 'https://www.a.com/');
  const js = links.find((x) => x.v.startsWith('javascript'));
  assert.equal(js.href, null);
  assert.equal(s.filter((x) => x.kind === 'mention').length, 1);
  assert.equal(s.map((x) => x.v).join(''), 'go to https://evil.xyz/claim, or www.a.com now! javascript:alert(1) and @kitty and @nobody');
  assert.equal(segments('claim at monad-airdrop.claims today')[1].kind, 'link');
  assert.equal(linkHref('data:text/html,x'), null);
});

test('phishing flag', () => {
  assert.ok(looksLikePhish('send me your seed phrase'));
  assert.ok(looksLikePhish('DM your private key'));
  assert.ok(!looksLikePhish('I planted a seed today'));
});

const rot13 = (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); });
test('filter: CSAM terms through disguises; everything else passes', () => {
  for (const bad of ['pu1yq c0ea', 'P U V Y Q C B E A', 'ybyvpba', 'crqbcuvyr', 'c3q0'].map(rot13)) assert.ok(matchesFilter(bad), bad);
  // since 2026-09-27 only CSAM is refused: slurs, swearing and edgy slogans pass. The inputs are in ROT13 so the
  // words do not sit in the file (the filter keeps its own list the same way).
  for (const ok of ['lbh ergneq', 'e3gneqf', 'uggcf://e3gneqf.klm', 'snttbg', 'xlf', 'urvy uvgyre', '14/88', 'encr', 'Avtre', 'favttre', 'ergneqnag', 'tencr', 'Fphagubecr', 'fuvg shpx qnza', 'ybyyvcbc', 'crqvngevpvna', 'fcrrqb'].map(rot13)) assert.ok(!matchesFilter(ok), ok);
});

// ------------------------------------------------------------------ uploaded pictures (social/pics.js)
import { sniff, webpChunks, cleanWebp, toB64, fromB64 } from '../social/pics.js';

/** A RIFF WebP from [fourcc, bytes] chunks, built the way the format says. */
function riff(chunks) {
  const parts = [];
  for (const [id, data] of chunks) {
    const head = new Uint8Array(8); head.set([...id].map((c) => c.charCodeAt(0))); new DataView(head.buffer).setUint32(4, data.length, true);
    parts.push(head, data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0));
  }
  const body = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + body);
  out.set([0x52, 0x49, 0x46, 0x46]); new DataView(out.buffer).setUint32(4, 4 + body, true); out.set([0x57, 0x45, 0x42, 0x50], 8);
  let o = 12; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const bytes = (n, v = 7) => new Uint8Array(n).fill(v);
const enc = (s) => new TextEncoder().encode(s);

test('pictures: the kind of file comes from its bytes, never its name', () => {
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniff(riff([['VP8 ', bytes(10)]])), 'image/webp');
  for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<html><script>alert(1)</script>', 'GIF89a......', '%PDF-1.7', '']) assert.equal(sniff(enc(bad)), null, bad);
});

test('pictures: a WebP is kept only as a still picture, with nothing riding along', () => {
  // metadata chunks go, VP8X keeps only its alpha flag
  const vp8x = new Uint8Array(10); vp8x[0] = 0x10 | 0x20 | 0x08 | 0x04;   // alpha + ICC + EXIF + XMP
  const withMeta = riff([['VP8X', vp8x], ['ICCP', bytes(40)], ['ALPH', bytes(9)], ['VP8 ', bytes(33)], ['EXIF', enc('GPS 51.5N 0.1W')], ['XMP ', enc('<x:xmpmeta/>')]]);
  const c = cleanWebp(withMeta);
  assert.ok(c.bytes);
  const ids = webpChunks(c.bytes).map((x) => x.id);
  assert.deepEqual(ids, ['VP8X', 'ALPH', 'VP8 ']);
  assert.equal(webpChunks(c.bytes)[0].data[0], 0x10);
  assert.ok(!new TextDecoder().decode(c.bytes).includes('GPS'));
  // a plain lossy or lossless picture passes untouched
  const plain = riff([['VP8L', bytes(21)]]);
  assert.deepEqual([...cleanWebp(plain).bytes], [...plain]);
  // refused: animation, two pictures, none, a lying length, a truncated chunk, something else in the envelope
  assert.equal(cleanWebp(riff([['VP8X', bytes(10, 0)], ['ANIM', bytes(6)], ['ANMF', bytes(30)]])).error, 'animated');
  assert.equal(cleanWebp(riff([['VP8 ', bytes(9)], ['VP8L', bytes(9)]])).error, 'not one picture');
  assert.equal(cleanWebp(riff([['EXIF', bytes(9)]])).error, 'not one picture');
  const lying = riff([['VP8 ', bytes(10)]]); new DataView(lying.buffer).setUint32(4, 9999, true);
  assert.equal(cleanWebp(lying).error, 'not a WebP');
  const cut = riff([['VP8 ', bytes(40)]]).subarray(0, 30); const fixed = new Uint8Array(cut); new DataView(fixed.buffer).setUint32(4, fixed.length - 8, true);
  assert.equal(cleanWebp(fixed).error, 'not a WebP');
  assert.equal(cleanWebp(enc('<svg onload=alert(1)>')).error, 'not a WebP');
});

test('pictures: base64 both ways, at the sizes pictures come in', () => {
  const b = new Uint8Array(300_001); for (let i = 0; i < b.length; i++) b[i] = (i * 31) & 255;
  assert.deepEqual(fromB64(toB64(b)), b);
});

import { cleanJpeg } from '../social/pics.js';
test('pictures: a JPEG keeps only what draws it (no EXIF, XMP, ICC or comments)', () => {
  const seg = (m, body) => { const b = Buffer.from(body); const h = Buffer.from([0xff, m, (b.length + 2) >> 8, (b.length + 2) & 255]); return Buffer.concat([h, b]); };
  const jpg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
    seg(0xe1, 'Exif\0\0GPS-SECRET 51.5N'),
    seg(0xe2, 'ICC_PROFILE\0junk'),
    seg(0xfe, 'a comment'),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
  const out = Buffer.from(cleanJpeg(new Uint8Array(jpg)));
  assert.ok(out.includes('JFIF'));
  for (const gone of ['Exif', 'GPS-SECRET', 'ICC_PROFILE', 'a comment']) assert.ok(!out.includes(gone), gone);
  assert.deepEqual([...out.subarray(-7)], [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9], 'the scan is kept to the end');
  assert.equal(cleanJpeg(new Uint8Array(Buffer.from('<svg onload=alert(1)>'))), null);
  assert.equal(cleanJpeg(new Uint8Array(jpg.subarray(0, jpg.length - 2))), null, 'cut short');
});

// ------------------------------------------------------------------ the security review's fixes (2026-09-27)
import { ipKeyOf } from '../social/http.js';
import { checkName as checkName2 } from '../social/rules.js';

test('rate-limit keys: an IPv6 /64 is one key however it is written; IPv4-mapped is the IPv4', () => {
  const k = ipKeyOf('2001:db8::1:2:3:4');
  for (const ip of ['2001:db8::5:2:3:4', '2001:db8:0:0:9:9:9:9', '2001:0DB8:0000:0000:ffff:1:2:3']) assert.equal(ipKeyOf(ip), k, ip);
  assert.notEqual(ipKeyOf('2001:db8:0:1::1'), k);
  assert.equal(ipKeyOf('2001:db8:0:1::1', 48), ipKeyOf('2001:db8:0:ffff::1', 48));
  assert.equal(ipKeyOf('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(ipKeyOf('1.2.3.4'), '1.2.3.4');
});

test('names: reserved words and their look-alikes are refused, ordinary names are not', () => {
  for (const bad of ['admin', 'lordemo_', 'emotown_mod', 'official_admin', 'emotown2', 'Mod_Squad', 'support_team']) assert.equal(checkName2(bad).ok, false, bad);
  for (const ok of ['modest', 'lord', 'alice_e2e', 'r3tards', 'emo_fan', 'admiral', 'supporter']) assert.equal(checkName2(ok).ok, true, ok);
});

// ------------------------------------------------------------------ GIFs, replies (2026-09-28)
import { cleanGif, gifUrl, emojiOnly, replyQuote } from '../social/rules.js';
import { shapeGif, normQuery } from '../social/gifs.js';

test('a GIF is only ever an image on KLIPY\'s CDN', () => {
  const ok = { id: 'abc_1-2', url: 'https://static.klipy.com/ii/abc/tiny.gif', still: 'https://static.klipy.com/ii/abc/tiny.jpg', w: 220, h: 124 };
  assert.deepEqual(cleanGif(ok), ok);
  for (const url of ['http://static.klipy.com/a.gif', 'https://static.klipy.com.evil.io/a.gif', 'https://evil.io/static.klipy.com/a.gif', 'https://static.klipy.com/a.gif?x=1', 'https://static.klipy.com/a.gif#x', 'https://u:p@static.klipy.com/a.gif', 'https://static.klipy.com:8443/a.gif', 'javascript:alert(1)', 'data:image/gif;base64,R0lGOD', 'https://static.klipy.com/a"onerror=x.gif', '//static.klipy.com/a.gif', 'x'.repeat(500)]) {
    assert.equal(gifUrl(url), null, url);
    assert.equal(cleanGif({ ...ok, url }), null, url);
  }
  assert.equal(cleanGif({ ...ok, id: '<script>' }), null);
  assert.equal(cleanGif({ ...ok, still: 'https://evil.io/x.jpg' }).still, null, 'a bad still is dropped, the GIF stays');
  assert.deepEqual([cleanGif({ ...ok, w: -5, h: 'x' }).w, cleanGif({ ...ok, w: 99999 }).w], [200, 2000]);
  assert.equal(cleanGif('https://static.klipy.com/a.gif'), null);
  assert.equal(cleanGif(null), null);
});

test('KLIPY results are shaped to what a message needs; anything off the CDN is dropped', () => {
  const r = { id: 'k1', content_description: 'cat\u0007 dance', media_formats: { gif: { url: 'https://static.klipy.com/ii/k1/big.gif', dims: [498, 280] }, tinygif: { url: 'https://static.klipy.com/ii/k1/tiny.gif', dims: [220, 124] }, tinygifpreview: { url: 'https://static.klipy.com/ii/k1/tiny.png', dims: [220, 124] } } };
  assert.deepEqual(shapeGif(r), { id: 'k1', url: 'https://static.klipy.com/ii/k1/tiny.gif', still: 'https://static.klipy.com/ii/k1/tiny.png', w: 220, h: 124, title: 'cat dance' });
  assert.equal(shapeGif({ id: 'k2', media_formats: { tinygif: { url: 'https://cdn.evil.io/x.gif' } } }), null);
  assert.equal(shapeGif({ id: 'k3' }), null);
  assert.equal(shapeGif(null), null);
});

test('GIF searches are keyed so case, spacing and invisible characters do not make a new one', () => {
  assert.equal(normQuery('  Dancing\u200b   CATS '), 'dancing cats');
  assert.equal(normQuery('x'.repeat(80)).length, 50);
  assert.equal(normQuery(undefined), '');
});

test('emoji-only messages; a reply quotes the start of what it answers', () => {
  for (const s of ['\u{1F525}', '❤\uFE0F❤\uFE0F', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', ' \u{1F602} \u{1F602} ']) assert.equal(emojiOnly(s), true, s);
  for (const s of ['hi \u{1F525}', '123', '#', '', '\u{1F525}'.repeat(30)]) assert.equal(emojiOnly(s), false, s);
  const q = replyQuote(7, '0xabc', null, 'y'.repeat(300), '{"id":"g"}');
  assert.equal([...q.t].length, 120); assert.equal(q.g, 1); assert.equal(q.n, null);
});


// ------------------------------------------------------------------ reactions (2026-09-28)
import { cleanEmoji, REACTION_PRESETS } from '../social/rules.js';
test('a reaction is exactly one emoji', () => {
  const cp = (...c) => String.fromCodePoint(...c);
  const one = [cp(0x2764, 0xFE0F), cp(0x1F602), cp(0x1F44D, 0x1F3FD), cp(0x1F1FA, 0x1F1F8), cp(0x31, 0xFE0F, 0x20E3), [0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467].map((c) => cp(c)).join(''), cp(0x1F3F3, 0xFE0F, 0x200D, 0x1F308)];
  for (const e of one) assert.equal(cleanEmoji(e), e, [...e].map((c) => c.codePointAt(0).toString(16)).join(' '));
  for (const bad of ['a', '1', '12', '#', cp(0x1F602) + cp(0x1F602), 'hi ' + cp(0x1F602), '', ' ', '<b>', cp(0x200D), cp(0xFE0F), cp(0x1F3FD), null, 42, 'x'.repeat(40)]) assert.equal(cleanEmoji(bad), null, String(bad));
  assert.equal(cleanEmoji(' ' + cp(0x1F525) + ' '), cp(0x1F525), 'spaces round it are dropped');
  assert.equal(REACTION_PRESETS.length, 7);
  for (const e of REACTION_PRESETS) assert.equal(cleanEmoji(e), e);
});


// ------------------------------------------------------------------ roles (2026-09-28)
import { checkRoleName, ROLE_COLORS, ROLE_LIMITS } from '../social/rules.js';
test('a role is a short cleaned name; its colour is one of the list', () => {
  assert.deepEqual(checkRoleName('  OG   frens '), { ok: true, name: 'OG frens', key: 'og frens' });
  assert.equal(checkRoleName('Degen ' + String.fromCodePoint(0x1F438)).ok, true, 'an emoji in the name is fine');
  assert.equal(checkRoleName('x'.repeat(ROLE_LIMITS.name)).ok, true);
  for (const bad of ['', '   ', 'x'.repeat(ROLE_LIMITS.name + 1), null, 42, U(0x200b) + U(0x202e)]) assert.equal(checkRoleName(bad).ok, false, String(bad));
  assert.equal(checkRoleName('a' + U(0x202e) + 'b').name, 'ab', 'bidi overrides are taken out');
  assert.equal(checkRoleName('two\nlines').name, 'two lines');
  assert.equal(new Set(ROLE_COLORS).size, 8);
});
