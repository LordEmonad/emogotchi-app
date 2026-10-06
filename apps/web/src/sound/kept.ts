// The notes a tune is played from (music.ts renders each once) are kept in this browser between pages, so a tune that
// has been heard before starts from its recordings at once and nothing is rendered again on the next page. They are
// only sound: nothing about the visitor is in here. Every failure (no storage, a private window, a full disk) is the
// same as nothing kept: the notes are rendered again.
//
// Two stores in one small database: `notes` (the samples) and `meta` (when each was last used and how big it is, so
// tidying up never has to read the samples themselves). Notes made by another version of the sound code are thrown
// away (TAG), and the least recently used go when the lot passes CAP.

const DB = 'emogotchi-sound';
const CAP = 64 * 1024 * 1024;

/** Which build of the sound code made a note: this chunk's own hashed file name. Null in development (nothing is kept:
 *  an instrument being worked on must be heard as it is now, not as it was). */
const TAG: string | null = import.meta.env.DEV ? null : (() => {
  try { return new URL(import.meta.url).pathname.split('/').pop() ?? null; } catch { return null; }
})();

type Meta = { tag: string; at: number; bytes: number };
export type KeptNote = { rate: number; ch: Float32Array[] };
/** As stored: 16 bits a sample (half the room of what a context plays from), each note scaled to use all sixteen. */
type Stored = { rate: number; peak: number; ch: Int16Array[] };
const pack = (n: KeptNote): Stored => {
  let peak = 1e-9;
  for (const c of n.ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]!); if (a > peak) peak = a; }
  const k = 32767 / peak;
  return { rate: n.rate, peak, ch: n.ch.map((c) => { const o = new Int16Array(c.length); for (let i = 0; i < c.length; i++) o[i] = Math.round(c[i]! * k); return o; }) };
};
const sound = (v: unknown): v is Stored => { const s = v as Stored | undefined; return !!s && typeof s.rate === 'number' && typeof s.peak === 'number' && Array.isArray(s.ch) && s.ch.length > 0 && s.ch.every((c) => c instanceof Int16Array && c.length > 0); };

let opened: Promise<IDBDatabase | null> | null = null;
let tidied = false;
function open(): Promise<IDBDatabase | null> {
  if (!TAG || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return (opened ??= new Promise<IDBDatabase | null>((res) => {
    // an open that never answers (it happens) must not leave a tune waiting for ever: after a while, nothing is kept
    const late = setTimeout(() => res(null), 3000);
    const got = (d: IDBDatabase | null) => { clearTimeout(late); res(d); };
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('notes'); rq.result.createObjectStore('meta'); };
      rq.onsuccess = () => {
        const d = rq.result;
        // a connection the browser takes away (a phone putting the page to sleep) is opened again the next time
        d.onversionchange = () => { d.close(); opened = null; };
        d.onclose = () => { opened = null; };
        got(d);
        if (!tidied) { tidied = true; setTimeout(() => void tidy(), 4000); }
      };
      rq.onerror = () => got(null);
      rq.onblocked = () => got(null);
    } catch { got(null); }
  }));
}
/** A connection that throws on use is dead: forget it, so the next use opens another. */
const dead = () => { opened = null; };
const done = (tx: IDBTransaction) => new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res(); });

/** One stored note written into the channels of a buffer the caller made (rate, channels and length as `shape` says). */
export type StoredNote = Stored;
export const shapeOf = (s: Stored) => ({ rate: s.rate, channels: s.ch.length, length: s.ch[0]!.length });
export function unpackInto(s: Stored, ch: number, into: Float32Array) {
  const k = s.peak / 32767, from = s.ch[ch]!;
  for (let i = 0; i < from.length; i++) into[i] = from[i]! * k;
}

/** The kept notes among `keys`, by key, as they are stored (the caller unpacks them a few at a time). */
export async function keptNotes(keys: string[]): Promise<Map<string, StoredNote>> {
  const found = new Map<string, StoredNote>();
  const d = await open();
  if (!d || !keys.length) return found;
  try {
    const tx = d.transaction('notes', 'readonly'); const st = tx.objectStore('notes');
    const got = new Map<string, Stored>();
    for (const k of keys) { const rq = st.get(`${TAG}|${k}`); rq.onsuccess = () => { if (sound(rq.result)) got.set(k, rq.result); }; }
    await done(tx);
    for (const [k, v] of got) found.set(k, v);
    if (got.size) {
      // used now: they are the last to go
      const tx2 = d.transaction('meta', 'readwrite'); const m = tx2.objectStore('meta'); const at = Date.now();
      for (const [k, v] of got) m.put({ tag: TAG!, at, bytes: v.ch.reduce((n, c) => n + c.byteLength, 0) } satisfies Meta, `${TAG}|${k}`);
      await done(tx2);
    }
  } catch { dead(); }
  return found;
}

/** Keep one note. */
export async function keepNote(k: string, note: KeptNote) {
  const d = await open();
  if (!d) return;
  try {
    const packed = pack(note);
    const tx = d.transaction(['notes', 'meta'], 'readwrite');
    tx.objectStore('notes').put(packed, `${TAG}|${k}`);
    tx.objectStore('meta').put({ tag: TAG!, at: Date.now(), bytes: packed.ch.reduce((n, c) => n + c.byteLength, 0) } satisfies Meta, `${TAG}|${k}`);
    await done(tx);
  } catch { dead(); }
}

/** Throw away what another version made, and the least recently used past the cap. */
export async function tidy() {
  const d = await open();
  if (!d) return;
  try {
    const rows: { key: IDBValidKey; m: Meta }[] = [];
    const tx = d.transaction('meta', 'readonly');
    const cur = tx.objectStore('meta').openCursor();
    cur.onsuccess = () => { const c = cur.result; if (c) { rows.push({ key: c.key, m: c.value as Meta }); c.continue(); } };
    await done(tx);
    const out: IDBValidKey[] = [];
    let total = 0;
    const mine = rows.filter((r) => { if (r.m.tag !== TAG) { out.push(r.key); return false; } total += r.m.bytes; return true; }).sort((a, b) => a.m.at - b.m.at);
    for (const r of mine) { if (total <= CAP) break; out.push(r.key); total -= r.m.bytes; }
    if (!out.length) return;
    const tx2 = d.transaction(['notes', 'meta'], 'readwrite');
    for (const k of out) { tx2.objectStore('notes').delete(k); tx2.objectStore('meta').delete(k); }
    await done(tx2);
  } catch { dead(); }
}
