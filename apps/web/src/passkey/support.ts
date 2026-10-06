/**
 * Passkey accounts: is the feature on, and can this device do it?
 *
 * The feature is behind a flag until the operator has tried it on production: `?passkey=1` turns it on for this
 * browser (and `?passkey=0` off again), `VITE_PASSKEY=on` turns it on for everyone. Nothing here loads mera.
 *
 * A passkey account needs the WebAuthn PRF extension, and whether that works is decided by WHERE the passkey is saved
 * (iCloud Keychain, Google Password Manager, 1Password, a security key), which a page cannot see in advance. So this
 * file only sorts devices into three honest tiers, and the real answer comes from the first ceremony.
 */
const FLAG = 'emogotchi.passkey.on';

/**
 * `VITE_PASSKEY=on` offers it to everyone; `VITE_PASSKEY=link` offers it only to a browser that has been sent
 * `?passkey=1` (remembered, and `?passkey=0` forgets it); anything else, including unset, and the feature does not
 * exist. The build gate matters: without it `?passkey=1` would be a link anyone could post, and a stranger could walk
 * ordinary visitors into making real, unrecoverable-if-lost accounts on a feature the operator had not yet tried.
 */
export function passkeyEnabled(): boolean {
  const env = import.meta.env.VITE_PASSKEY as string | undefined;
  if (env === 'on') return true;
  if (env !== 'link' || typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(location.search).get('passkey');
    if (q === '1') localStorage.setItem(FLAG, '1');
    if (q === '0') localStorage.removeItem(FLAG);
    return localStorage.getItem(FLAG) === '1';
  } catch { return false; }
}

/** good: offer it plainly. maybe: offer it with a warning. no: do not offer it, and say why if asked. */
export type PasskeyTier = 'good' | 'maybe' | 'no';
export type PasskeySupport = { tier: PasskeyTier; why: string };

const UA = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);

export function passkeySupport(): PasskeySupport {
  if (typeof window === 'undefined' || !window.isSecureContext || typeof window.PublicKeyCredential === 'undefined') {
    return { tier: 'no', why: 'This browser cannot make passkeys.' };
  }
  const ua = UA();
  const ios = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  // A wallet app's own browser is a webview. Passkeys often DO work in one now, but not always, and whether the
  // place the passkey is saved supports PRF is something no page can see in advance. It used to be hidden here on
  // the reasoning that anybody in a wallet app already has a wallet — but offering all three routes everywhere is
  // the operator's call, and the honest way to do that is to offer it with the caveat rather than to hide it.
  if ((ios || android) && typeof (window as unknown as { ethereum?: unknown }).ethereum !== 'undefined') {
    return { tier: 'maybe', why: 'You are in a wallet app’s browser, where passkeys sometimes do not work. If it fails, use the wallet you are already in, or open this page in Safari or Chrome.' };
  }
  if (ios) {
    const m = /OS (\d+)[._]/.exec(ua);
    if (m && Number(m[1]) < 18) return { tier: 'no', why: 'Passkey accounts need iOS 18 or newer.' };
    return { tier: 'good', why: '' };
  }
  if (android) return { tier: 'good', why: '' };
  if (/Macintosh/.test(ua)) return { tier: 'good', why: 'Needs macOS 15 or newer, with the passkey saved to iCloud Keychain, Google Password Manager or 1Password.' };
  return { tier: 'maybe', why: 'On this computer it only works if the passkey is saved to Google Password Manager, 1Password or a security key (or Windows 11 25H2 and newer). A passkey saved to the browser profile alone will not work. If it fails, use your phone.' };
}

/** The browser's own word on the PRF extension, where it offers one. `false` is final; `true` only means "maybe". */
export async function clientRefusesPrf(): Promise<boolean> {
  try {
    const caps = await (window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.();
    return !!caps && caps['extension:prf'] === false;
  } catch { return false; }
}

/**
 * The WebAuthn relying party id, which binds every account FOREVER: a passkey made under one rpId cannot be used under
 * another, so changing this orphans every account made before it. It is **this exact host**, and it must stay that way.
 *
 * Why not the registrable domain `emonad.lol`, which would let one account follow the visitor across Emonad sites:
 * because with this design the passkey is not a login, it IS the private key. The salt (account.ts) is mera's published
 * constant and the derivation is plain BIP-39/BIP-44, both public on purpose so the 24 words import into any wallet. So
 * any page that can run a ceremony under the rpId does not merely get a signature — it gets the key, in full, forever.
 * Set to `emonad.lol`, every page ever served anywhere under that domain would be able to take it, including ones with
 * third-party script on them, and any future subdomain or a dangling DNS record. Pinned to this host, the blast radius
 * is this host alone. WebAuthn can widen an rpId later (Related Origin Requests) but can never narrow one, so the safe
 * direction is the narrow one, chosen first.
 */
export function rpId(): string {
  return location.hostname;
}
