/**
 * The only message a passkey account will sign: Emotown's Sign-In with Ethereum message, for THIS site, THIS account,
 * THIS chain, written moments ago. Anything else (another site's sign-in, an "approve" in disguise, a message dressed
 * up with extra lines) is refused before any sheet opens.
 *
 * The check is strict on purpose: the message is parsed, every field is checked, and then it is rebuilt from those
 * fields in EIP-4361's own layout and must come out byte for byte the same. So there is no room for a second URI line,
 * a trailing paragraph, a lookalike domain, or an invisible character: what the sheet shows is exactly what is signed.
 */
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { SIWE_STATEMENT } from '../social/rules';

const MAX_AGE_MS = 15 * 60_000;
const MAX_SKEW_MS = 2 * 60_000;

export type SiweCheck = { ok: true; nonce: string; expires: Date } | { ok: false; why: string };

export function checkSiwe(text: string, account: string, chainId: number, now = Date.now()): SiweCheck {
  if (text.length > 2000) return { ok: false, why: 'too long' };
  let f: ReturnType<typeof parseSiweMessage>;
  try { f = parseSiweMessage(text); } catch { return { ok: false, why: 'not a sign-in message' }; }
  if (f.domain !== location.host) return { ok: false, why: 'for another site' };
  if (!f.address || f.address.toLowerCase() !== account.toLowerCase()) return { ok: false, why: 'for another account' };
  if (f.statement !== SIWE_STATEMENT) return { ok: false, why: 'not Emotown\'s sign-in' };
  let uri: URL;
  try { uri = new URL(f.uri ?? ''); } catch { return { ok: false, why: 'no address' }; }
  if (uri.origin !== location.origin || f.uri !== location.origin) return { ok: false, why: 'for another site' };
  if (f.version !== '1' || f.chainId !== chainId) return { ok: false, why: 'for another network' };
  if (!f.nonce || !/^[A-Za-z0-9]{8,64}$/.test(f.nonce)) return { ok: false, why: 'no nonce' };
  if (f.notBefore || f.requestId || f.resources?.length || f.scheme) return { ok: false, why: 'extra fields' };
  const issued = f.issuedAt?.getTime() ?? NaN; const expires = f.expirationTime?.getTime() ?? NaN;
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return { ok: false, why: 'no dates' };
  if (issued > now + MAX_SKEW_MS || now - issued > MAX_AGE_MS) return { ok: false, why: 'stale' };
  if (expires <= now || expires - issued > MAX_AGE_MS) return { ok: false, why: 'bad expiry' };
  // rebuilt from the parsed fields: it must be the very same text
  const again = createSiweMessage({ domain: f.domain, address: f.address, statement: f.statement, uri: f.uri, version: '1', chainId: f.chainId, nonce: f.nonce, issuedAt: f.issuedAt!, expirationTime: f.expirationTime! });
  if (again !== text) return { ok: false, why: 'not in the standard form' };
  return { ok: true, nonce: f.nonce, expires: f.expirationTime! };
}
