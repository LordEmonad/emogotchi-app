import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address, Collection } from '@emo-pets/chain';
import { NFT_STATES, NFT_STATE_LABEL, NFT_STATE_RULE, type NftState } from './NftArt';
import { chainCfg, chainClient } from '../game/chain';
import { PETS, knownPets, petParam } from '../pets';

/**
 * /nft: the wallet images, read from the art contract. Every picture here is the string `image(mood, crowned)`
 * returned when the page loaded, which is exactly what tokenURI hands a wallet or a marketplace; nothing is
 * drawn by the site. Each one can be saved as the SVG itself or as a 1024px PNG, and links to the call on chain.
 * Every pet this build has a contract for is here (each has its own art contract); `?pet=` picks one, as on /pets.
 */
type Images = Partial<Record<string, string>>;   // `${mood}${crown ? '-crown' : ''}` → the SVG text
const keyOf = (s: NftState, crown: boolean) => `${s}${crown ? '-crown' : ''}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const svgUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/** Rasterise the on-chain SVG at its own 1024 px and hand the browser a PNG to save. */
async function savePng(svg: string, name: string): Promise<void> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('could not decode the SVG')); img.src = url; });
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    c.getContext('2d')!.drawImage(img, 0, 0, 1024, 1024);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('could not encode the PNG');
    download(URL.createObjectURL(blob), `${name}.png`);
  } finally { URL.revokeObjectURL(url); }
}
function download(href: string, filename: string) {
  const a = document.createElement('a'); a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

export function NftPreview() {
  const pets = knownPets();
  const [col, setColState] = useState<Collection>(() => petParam(new URLSearchParams(location.search).get('pet')));
  const setCol = (c: Collection) => {
    setColState(c);
    const q = new URLSearchParams(location.search);
    if (c === 'cat') q.delete('pet'); else q.set('pet', PETS[c].api);
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  };
  const [crown, setCrown] = useState(false);
  const [art, setArt] = useState<Partial<Record<Collection, Address>>>({});
  const [images, setImages] = useState<Partial<Record<Collection, Images>>>({});
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const meta = PETS[col];
  const contractName = meta.brand;

  // ---- read the 18 images of the active collection, once per collection, straight from the art contract
  const started = useRef(new Set<Collection>());
  useEffect(() => {
    const client = chainClient;
    if (!client || started.current.has(col)) return;
    started.current.add(col);
    setError(null);
    (async () => {
      const a = await client.artAddress(col);
      setArt((m) => ({ ...m, [col]: a }));
      await Promise.all(NFT_STATES.flatMap((s) => [false, true].map(async (c) => {
        const svg = await client.artImage(s, c, col);
        setImages((m) => ({ ...m, [col]: { ...(m[col] ?? {}), [keyOf(s, c)]: svg } }));
      })));
    })().catch((e) => { started.current.delete(col); setError((e as Error).message || 'The art contract did not answer.'); });
  }, [col, tries]);

  const have = images[col] ?? {};
  const loaded = useMemo(() => NFT_STATES.filter((s) => have[keyOf(s, crown)]).length, [have, crown]);
  const artAddr = art[col];
  const explorer = chainCfg?.explorer ?? null;
  const contractLink = artAddr && explorer ? `${explorer}/address/${artAddr}#readContract` : null;
  const sourceLink = artAddr && explorer ? `${explorer}/address/${artAddr}#code` : null;

  return (
    <main className="nftpage">
      <div className="nft-intro">
        <h1>The art, from the contract</h1>
        <p>
          The picture in a wallet or on a marketplace is composed on chain: the art contract holds the drawing and a patch for each mood, and <code>tokenURI</code> picks the one that matches the pet's live state. Nine moods, and a crowned version of each for the hundred best-kept pets of each kind. Every image on this page was fetched from that contract when the page loaded, by calling <code>image(mood, crowned)</code>; nothing here is drawn by the site. Save one and use it as a pfp.
        </p>
        <div className="nft-controls">
          {pets.length > 1 && (
            <div className="pet-switch" role="tablist" aria-label="Which pets">
              {pets.map((c) => <button key={c} role="tab" aria-selected={col === c} className={`chip-btn ${col === c ? 'is-on' : ''}`} onClick={() => setCol(c)}>{PETS[c].label}</button>)}
            </div>
          )}
          <label className="nft-toggle"><input type="checkbox" checked={crown} onChange={(e) => setCrown(e.target.checked)} /> <span>Wears the crown</span></label>
        </div>
      </div>
      {!chainClient && <p className="nft-note">This build has no contract address, so there is nothing to read.</p>}
      {error && <p className="nft-note claim-err">Could not read the art contract: {error} <button className="chip-btn" onClick={() => setTries((t) => t + 1)}>Try again</button></p>}
      <div className="nft-grid" aria-busy={loaded < NFT_STATES.length}>
        {NFT_STATES.map((s, mood) => {
          const svg = have[keyOf(s, crown)];
          const name = `${meta.api}-${keyOf(s, crown)}`;
          return (
            <figure key={s} className="nft-card nft-card-chain">
              {svg
                ? <img className="nft-img" src={svgUrl(svg)} alt={`${NFT_STATE_LABEL[s]}${crown ? ', crowned' : ''}`} width={1024} height={1024} />
                : <div className="nft-img nft-img-wait" aria-hidden="true" />}
              <figcaption>
                <span className="nft-card-title">{NFT_STATE_LABEL[s]}</span>
                <span className="nft-card-rule">{NFT_STATE_RULE[s]}</span>
                <span className="nft-card-actions">
                  <button className="chip-btn" disabled={!svg} onClick={() => svg && void savePng(svg, name).catch((e) => setError((e as Error).message))}>Save PNG</button>
                  <a className="chip-btn" aria-disabled={!svg} href={svg ? svgUrl(svg) : undefined} download={`${name}.svg`}>SVG</a>
                  {contractLink && <a className="chip-btn" href={contractLink} target="_blank" rel="noreferrer" title={`image(${mood}, ${crown}) on ${artAddr}`}>On chain ↗</a>}
                </span>
                <code className="nft-card-call">image({mood}, {String(crown)})</code>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p className="nft-note">
        {artAddr
          ? <>Art contract <a href={sourceLink ?? undefined} target="_blank" rel="noreferrer"><code>{short(artAddr)}</code></a>{sourceLink ? ', verified source. ' : '. '}The wallet image is <code>tokenURI</code> on the {contractName} contract; the meters, the name, the day and the whole record ship with it as attributes.</>
          : loaded === 0 && !error ? 'Reading the art contract…' : null}
      </p>
      <footer className="foot"><a href="/">← Back to Emogotchi</a></footer>
    </main>
  );
}
