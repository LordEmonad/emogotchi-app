// The build the trailer is filmed from: the site's own Vite config, with one file changed as it is compiled (nothing
// in apps/web is edited). sound/cue.ts is made to (1) count as audible under a test driver, so the rooms make their
// sounds while they are filmed, and (2) write every cue and every stop into window.__sfx with the page's clock, which
// is what tools/trailer/lib.mjs saves beside a take's frames and render.mjs mixes into the film.
//   cd apps/web && NODE_ENV=development npx vite build --config ../../tools/trailer/build-config.mjs --mode development --outDir ../../trailer/dist --emptyOutDir
import base from '../../apps/web/vite.config.ts';

const tap = {
  name: 'trailer-sound-tap',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/src\/sound\/cue\.ts$/.test(id.split('?')[0])) return null;
    const a = /export const audible = \(\) => [^\n]*\n/;
    // (cue() as it is now: a try round the sink, so a sound can never throw into what asked for it)
    const b = /export function cue\(name: string, o\?: CueOpts\): Stop \{\n(?:\s*\/\/[^\n]*\n)*\s*try \{ return sink \? sink\.cue\(name, o\) : NOOP; \} catch \{ return NOOP; \}\n\}/;
    if (!a.test(code) || !b.test(code)) throw new Error('tools/trailer/build-config.mjs: sound/cue.ts has changed shape; update the two patterns');
    return code
      .replace(a, 'export const audible = () => true;\n')
      .replace(b, `export function cue(name: string, o?: CueOpts): Stop {
  const log: unknown[] = ((window as unknown as { __sfx?: unknown[] }).__sfx ??= []);
  const id = log.length;
  log.push({ id, name, o: o ? { ...o } : {}, t: performance.now() });
  const stop = sink ? sink.cue(name, o) : NOOP;
  return (fadeMs?: number) => { log.push({ stop: id, fade: fadeMs ?? 120, t: performance.now() }); stop(fadeMs); };
}`);
  },
};

export default async (env) => {
  const cfg = typeof base === 'function' ? await base(env) : base;
  return { ...cfg, plugins: [tap, ...(cfg.plugins ?? [])] };
};
