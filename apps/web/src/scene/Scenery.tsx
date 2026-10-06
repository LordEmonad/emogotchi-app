/**
 * Room themes: a Scene item swaps the wall, the floor and the light and adds fixed scenery around the
 * cat. The pieces sit at the edges of the room, behind the cat, so the bowl, the tub and the yarn keep
 * their places in front of everything. Motion is CSS only (bats crossing, a spider swinging, a
 * pumpkin's light flickering, fog drifting, fluorescent panels buzzing) and stops under prefers-reduced-motion.
 *
 * Five themes: the haunted room (item 2, Spooky theme), the Backrooms (item 7), the Western Wall (`kotel`, the Jewish
 * pack's room, item 10), the Majlis (`majlis`, the Habibi pack's room, item 15) and the emo bedroom (`emoroom`, the emo
 * pack's room: drawn and in the /emopack lab, not an item yet).
 */
import { PROPS } from './props';
import { ROOM_ART, type RoomArtName } from './roomArt';
import { WORLD } from './world';

export type SceneName = 'halloween' | 'backrooms' | 'kotel' | 'majlis' | 'emoroom';   // kotel: the Western Wall (the Jewish pack); majlis: the Habibi pack's room; emoroom: the emo pack's bedroom (lab only, /emopack)

const Piece = ({ name, x, bottom, w, ar, className = '', style = {} }: { name: keyof typeof PROPS | RoomArtName; x: number; bottom: number; w: number; ar: number; className?: string; style?: React.CSSProperties }) => {
  const h = w / ar;
  return <div className={`scn ${className}`} style={{ left: x - w / 2, top: bottom - h, width: w, height: h, ...style }} dangerouslySetInnerHTML={{ __html: name in ROOM_ART ? ROOM_ART[name as RoomArtName] : PROPS[name as keyof typeof PROPS] }} />;
};

/** Behind the cat: sky, moon, cobwebs, the tree, the stones and the pumpkins. */
export function SceneryBack({ scene }: { scene: SceneName }) {
  if (scene === 'backrooms') return <BackroomsBack />;
  if (scene === 'kotel') return <KotelBack />;
  if (scene === 'majlis') return <MajlisBack />;
  if (scene === 'emoroom') return <EmoroomBack />;
  if (scene !== 'halloween') return null;
  const F = WORLD.floor;
  return (
    <div className="scenery scenery-back" aria-hidden>
      <Piece name="harvestmoon" x={432} bottom={168} w={126} ar={1} className="scn-moon" />
      <Piece name="cobweb" x={50} bottom={100} w={100} ar={1} className="scn-web" />
      <Piece name="cobweb" x={WORLD.w - 38} bottom={76} w={76} ar={1} className="scn-web scn-web-r" />
      {[0, 1, 2].map((i) => <Piece key={i} name="bat" x={0} bottom={0} w={[54, 40, 32][i]!} ar={90 / 46} className={`scn-bat scn-bat-${i}`} />)}
      {/* the back of the room: everything stands on the far edge of the floor (its curved rim), a step up
          from where the cat walks, so the cat passes in front of it and never seems to tread on it */}
      {/* a raised bank of ground behind the cat's floor: the scenery stands on it, and the ground is
          visible under and behind every piece, so nothing floats */}
      <div className="ground-back" style={{ top: F - 58 }} />
      <Piece name="fence" x={300} bottom={F - 30} w={300} ar={350 / 62} className="scn-fence" />
      <Piece name="deadtree" x={546} bottom={F - 18} w={200} ar={212 / 336} className="scn-tree" />
      <span className="pumpkin-light" style={{ left: 10, top: F - 52 }} />
      <Piece name="tombstone" x={64} bottom={F - 20} w={100} ar={104 / 116} className="scn-stone" />
      <Piece name="pumpkin" x={128} bottom={F - 18} w={74} ar={112 / 100} className="scn-pumpkin scn-pumpkin-a" />
      <Piece name="pumpkin" x={24} bottom={F - 20} w={48} ar={112 / 100} className="scn-pumpkin scn-pumpkin-b" style={{ transform: 'scaleX(-1)' }} />
    </div>
  );
}

/**
 * The Backrooms, behind the cat. The wallpaper and the carpet are CSS; these are the three drawn pieces, each in
 * world coordinates in props.py so their perspective (one vanishing point, mid-wall) lines up: the drop ceiling with
 * its panels along the top, a partition jutting out of the back wall on the left, and on the right the wall ends
 * and the room carries on into a further, dimmer one. The floor the cat walks (x 110..490) stays clear: the
 * partition's foot is at the far left, the opening's carpet meets ours at the wall line.
 */
function BackroomsBack() {
  return (
    <div className="scenery scenery-back" aria-hidden>
      <Piece name="ceiling" x={300} bottom={88} w={600} ar={600 / 88} className="scn-ceiling" />
      <Piece name="wallfoot" x={300} bottom={370} w={600} ar={600 / 8} className="scn-wallfoot" />
      <Piece name="partition" x={61} bottom={420} w={82} ar={82 / 390} className="scn-partition" />
      <Piece name="opening" x={533} bottom={366} w={134} ar={134 / 282} className="scn-opening" />
    </div>
  );
}

/**
 * The Western Wall (the Jewish pack's room), behind the pet: the Wall across the whole room with its prayer notes and
 * plants (kotelwall.svg, props from kotelprops.py in world coordinates), a dove roosting in a niche of the upper courses
 * and another on the top, a pair flying across the sky now and then, and the plaza's paving (kotelplaza.svg) over the
 * CSS floor. At night two light layers go over the Wall: the dark coming down from the sky and the floodlights' warm
 * gold from below (stage.css). The floor the pet walks (x 110..490) holds nothing.
 */
function KotelBack() {
  return (
    <div className="scenery scenery-back" aria-hidden>
      <Piece name="kotelwall" x={300} bottom={370} w={600} ar={600 / 340} className="scn-kotelwall" />
      <span className="kotel-dusk" />
      <span className="kotel-flood" />
      <Piece name="kotelperch" x={105} bottom={113.5} w={30} ar={46 / 36} className="scn-perch scn-perch-a" />
      <Piece name="kotelperch" x={452} bottom={62} w={27} ar={46 / 36} className="scn-perch scn-perch-b" style={{ transform: 'scaleX(-1)' }} />
      <Piece name="koteldove" x={0} bottom={0} w={38} ar={58 / 30} className="scn-dove scn-dove-0" />
      <Piece name="koteldove" x={0} bottom={0} w={32} ar={58 / 30} className="scn-dove scn-dove-1" />
      <Piece name="kotelplaza" x={300} bottom={460} w={600} ar={600 / 98} className="scn-kotelplaza" />
    </div>
  );
}

/**
 * The Majlis (the Habibi pack's room), behind the pet, back to front: clouds drifting behind the towers (day), the view
 * through the one big arched window (Dubai in depth: the sail-shaped hotel on the sea, the torus, the twisting tower, the
 * tallest tower with the lake and its fountain at its foot, majlissky.svg), birds and a plane passing, then the back
 * wall with the window cut through it (it hides whatever passes outside the window's opening), the dappled light moving
 * on the mashrabiya screens (day), the carpet and the rug, the Al Sadu seating (after them: its tassels hang over the carpet's edge), the sunlight on them (day), the coffee
 * with its steam and the incense with its smoke at the edges of the floor, and in front the two lanterns swaying on their
 * chains with their glow. Each lantern's glow holds its light pattern on the plaster (majlisspecks.svg, the right one
 * mirrored), and the glow and that lantern's flame run on the same irregular flicker, so they move together. Everything
 * is from majlisprops.py, in world coordinates; every motion is CSS (stage.css) on small elements, and the floor the
 * pet walks (x 110..490) holds nothing but the rug.
 */
/** A drawing in a box at world (left, top), w x h: for the Majlis's moving parts, each on an element of its own. */
const Box = ({ name, left, top, w, h, className = '', style = {}, children }: { name?: keyof typeof PROPS | RoomArtName; left: number; top: number; w: number; h: number; className?: string; style?: React.CSSProperties; children?: React.ReactNode }) =>
  name ? <span className={`scn ${className}`} style={{ left, top, width: w, height: h, ...style }} dangerouslySetInnerHTML={{ __html: name in ROOM_ART ? ROOM_ART[name as RoomArtName] : PROPS[name as keyof typeof PROPS] }} />
    : <span className={`scn ${className}`} style={{ left, top, width: w, height: h, ...style }}>{children}</span>;
/** The fountain's jets, two groups (the tall middle, and the lower ones either side) rising from the lake (base line y 257) in front of the tall tower: [x, height]. */
const JETS: [number, number][][] = [[[330, 52], [342, 58], [354, 50]], [[306, 29], [318, 38], [366, 43], [378, 36], [390, 32]]];
/** The tall tower's outline (majlisprops.py, BURJ_OUTLINE), in its box at world (336, 68), 32 x 183: its LED sweep is clipped to it. */
const BURJ = "M0 183 L0 170 L1 170 L1 154 L1 136 L3.5 136 L3.5 120 L3.5 103 L6 103 L6 89 L6 75 L8.5 75 L8.5 63 L8.5 53 L10.8 53 L10.8 44 L10.8 36 L12.6 36 L12.6 29 L12.6 23 L13.8 23 L13.8 17 L14.4 17 L15.5 4 L16 0 L16.5 4 L17.6 17 L18.6 17 L18.6 23 L18.6 29 L20.2 29 L20.2 36 L20.2 44 L22.2 44 L22.2 53 L22.2 63 L24.5 63 L24.5 75 L24.5 89 L27 89 L27 103 L27 120 L29.5 120 L29.5 136 L29.5 154 L32 154 L32 170 L32 183 Z";
/** Lights in the city that twinkle at night, and the beacon on the spire: [x, y, r]. */
const TWINKLES: [number, number, number][] = [[383, 158, 1.3], [301, 146, 1.2], [378, 199, 1.1], [213, 164, 1.1]];
/** The three gulls flying together, in the flock's 60 x 26 box: [left, top, width] (each 2:1, the body two thirds down). */
const FLOCK: [number, number, number][] = [[35.2, 2.6, 23.5], [18.7, 10.3, 20], [3.3, 0.9, 16.9]];

function Gull({ left, top, w, k, className = '' }: { left: number; top: number; w: number; k: number; className?: string }) {
  return <span className={`scn mj-gull ${className}`} style={{ left, top, width: w, height: w / 2 }}><Box name="majlisbird" left={0} top={0} w={w} h={w / 2} className={`mj-flap mj-flap-${k}`} /></span>;
}

function MajlisLantern({ x, side }: { x: number; side: 'l' | 'r' }) {
  const K = 1.25;   // the lanterns' scale (majlisprops.py LANTERN_K): their cap tops at y 108, the chains from the ceiling's moulding
  return (
    <span className={`scn scn-mjlantern scn-mjlantern-${side}`} style={{ left: x - 18 * K, top: 18, width: 36 * K, height: 158 * K }}>
      <Box name="majlislantern" left={0} top={0} w={36 * K} h={158 * K} />
      <Box name="majlisflame" left={10.5 * K} top={101 * K} w={15 * K} h={23 * K} className="mj-flame" />
      <Box name="majlislanternfront" left={0} top={0} w={36 * K} h={158 * K} />
    </span>
  );
}

function MajlisBack() {
  return (
    <div className="scenery scenery-back" aria-hidden>
      {[0, 1].map((i) => <Piece key={i} name="majliscloud" x={140} bottom={[112, 150][i]!} w={[80, 50][i]!} ar={80 / 32} className={`mj-cloud mj-cloud-${i}`} />)}
      <Piece name="majlissky" x={300} bottom={276} w={220} ar={220 / 222} className="scn-mjsky" />
      {/* the fountain: each group of jets is one element that rises and sways (transform-origin on the lake) */}
      {JETS.map((g, i) => (
        <span key={i} className={`scn mj-jets mj-jets-${i}`} style={{ left: 296, top: 190, width: 108, height: 67 }}>
          {g.map(([x, h]) => <Box key={x} name="majlisjet" left={x - 296 - 3.25} top={67 - h} w={6.5} h={h} />)}
        </span>
      ))}
      <Box name="majlismist" left={300} top={248} w={100} h={10} className="mj-mist" />
      <span className="scn mj-led" style={{ left: 336, top: 68, width: 32, height: 183, clipPath: `path('${BURJ}')` }}><span className="mj-ledband" /></span>
      {TWINKLES.map(([x, y, r], i) => <span key={i} className={`scn mj-tw mj-tw-${i}`} style={{ left: x - r, top: y - r, width: 2 * r, height: 2 * r }} />)}
      <span className="scn mj-beacon" style={{ left: 350.1, top: 67.1, width: 3.8, height: 3.8 }} />
      <span className="scn mj-plane" style={{ left: 135, top: 74, width: 30, height: 30 * 7 / 52 }}>
        <Box name="majlisplane" left={0} top={0} w={30} h={30 * 7 / 52} /><span className="scn mj-planeblink" style={{ left: 23.6, top: 1.35, width: 1.3, height: 1.3 }} />
      </span>
      <span className="scn mj-bird mj-flock" style={{ left: 116, top: 110, width: 60, height: 26 }}>
        {FLOCK.map(([l, t, w], k) => <Gull key={k} left={l} top={t} w={w} k={k} />)}
      </span>
      <span className="scn mj-bird mj-bird-near" style={{ left: 441.5, top: 149.5, width: 25, height: 12.5 }}><Gull left={0} top={0} w={25} k={1} /></span>
      <span className="scn mj-bird mj-bird-far" style={{ left: 143, top: 103, width: 14, height: 7 }}><Gull left={0} top={0} w={14} k={2} className="mj-gliding" /></span>
      <Piece name="majliswall" x={300} bottom={366} w={600} ar={600 / 366} className="scn-mjwall" />
      <span className="mj-dapple mj-dapple-l"><span className="mj-dapple-in" /></span>
      <span className="mj-dapple mj-dapple-r"><span className="mj-dapple-in" /></span>
      <Piece name="majlisrug" x={300} bottom={460} w={600} ar={600 / 86} className="scn-mjrug" />
      <Piece name="majlisseat" x={300} bottom={386} w={600} ar={600 / 100} className="scn-mjseat" />
      <span className="mj-sun" />
      <Piece name="majlistray" x={550} bottom={399} w={112} ar={92 / 74} className="scn-mjtray" />
      <Box name="majlissteam" left={511.4} top={293.3} w={13.8} h={36.8} className="mj-steam" />
      <Piece name="majlisincense" x={50} bottom={394} w={46} ar={40 / 54} className="scn-mjincense" />
      {[-2.4, 1.4].map((dx, k) => <Box key={k} name="majlissmoke" left={50 + dx - 6.7} top={264.9} w={17.9} h={76.2} className={`mj-smoke mj-smoke-${k}`} />)}
      {(['l', 'r'] as const).map((k) => (
        <span key={k} className={`mj-glow mj-glow-${k}`}><span className="mj-flick"><span className="mj-specks" dangerouslySetInnerHTML={{ __html: ROOM_ART.majlisspecks }} /></span></span>
      ))}
      <MajlisLantern x={153} side="l" />
      <MajlisLantern x={447} side="r" />
    </div>
  );
}

/**
 * The emo bedroom (the emo pack's room), behind the pet, back to front: the houses across the street, grey in the rain
 * (their lit windows and the streetlamp at night), the rain falling past the window and running down the glass, the wall
 * with the window cut through it, its posters, curtains and the fairy lights' wire, the bulbs' glows (each twinkling on a
 * clock of its own), the window's grey daylight on the wall and the floor, the checked rug, the bed, the nightstand with
 * the lava lamp (its wax rising and sinking in the glass, the glass drawn over it), and the desk with the old monitor
 * (the profile page on its screen, the light it throws) and the skull with its candle. The pieces are from
 * emoroomprops.py, in world coordinates; everything that moves is an element of its own (stage.css), never animated
 * inside a drawing. The floor the pet walks (x 110..490) holds nothing but the rug.
 */
/** The fairy lights: each bulb's middle [x, y] and its colour (0 and 2 warm white, 1 pink, 3 lavender), from emoroomprops.py. */
const ER_LIGHTS: [number, number, number][] = [[-2.9, 31.8, 0], [20.9, 45.9, 1], [45.6, 55.5, 2], [69.3, 58.7, 3], [97.8, 54.7, 0], [120.6, 44.8, 1], [142.4, 36.6, 2], [165.1, 49.2, 3], [191.8, 57.1, 0], [216, 59.6, 1], [242.4, 55.9, 2], [265.6, 46.6, 3], [291.2, 33.2, 0], [308.9, 33.2, 1], [334.3, 46.6, 2], [356.5, 55.8, 3], [383.5, 59.6, 0], [408.3, 57.1, 1], [435.6, 49.1, 2], [458.1, 36.6, 3], [481, 44.6, 0], [502.6, 54.8, 1], [529.3, 58.8, 2], [556.5, 55.5, 3], [580.9, 45.9, 0], [603.3, 31.7, 1]];
/** The lava lamp's glass (emoroomprops.py, LAVA) in its box at world (181, 258), 20 x 43: the wax moves inside it. */
const ER_GLASS = 'polygon(4.2px 42.4px, 3.8px 41.1px, 3.2px 39.4px, 2.5px 37.4px, 1.8px 35.2px, 1.3px 32.8px, 1px 30.4px, 0.9px 27.8px, 1px 24.9px, 1.3px 21.9px, 1.6px 18.9px, 2px 16px, 2.4px 13.4px, 2.9px 10.8px, 3.6px 8.2px, 4.4px 5.8px, 5.1px 3.6px, 5.7px 1.7px, 6.2px 0.4px, 14.6px 0.4px, 15px 1.7px, 15.7px 3.6px, 16.4px 5.8px, 17.2px 8.2px, 17.8px 10.8px, 18.4px 13.4px, 18.8px 16px, 19.2px 18.9px, 19.5px 21.9px, 19.8px 24.9px, 19.8px 27.8px, 19.8px 30.4px, 19.5px 32.8px, 18.9px 35.2px, 18.3px 37.4px, 17.6px 39.4px, 17px 41.1px, 16.6px 42.4px)';
/** Drops running down the glass, in the glass's own box (160 x 140): [left, where it starts, its length, seconds a run, seconds in]. */
const ER_RUNS: [number, number, number, number, number][] = [[17, -14, 15, 7.4, -1.2], [47, 24, 11, 9.8, -6.1], [71, -20, 19, 6.3, -3.3], [104, 6, 13, 11.6, -8.8], [131, -8, 17, 8.3, -4.7], [151, 30, 10, 10.4, -2.2]];
/** The bulbs twinkle out of step: a clock and a starting point each, and one of three irregular patterns (stage.css). */
const erTwinkle = (i: number): React.CSSProperties => ({ animationName: `er-tw-${'abc'[(i * 7) % 3]}`, animationDuration: `${(2.6 + ((i * 37) % 50) / 10).toFixed(1)}s`, animationDelay: `${(-((i * 53) % 70) / 10).toFixed(1)}s` });

function EmoroomBack() {
  return (
    <div className="scenery scenery-back" aria-hidden>
      <Box name="emoroomout" left={214} top={66} w={172} h={152} className="er-out" />
      <Box name="emoroomoutlit" left={214} top={66} w={172} h={152} className="er-outlit" />
      <span className="scn er-glass" style={{ left: 220, top: 72, width: 160, height: 140 }}>
        <span className="er-lamp" />
        <span className="er-fall"><span className="er-fall-in" /></span>
        <Box name="emoroombeads" left={0} top={0} w={160} h={140} className="er-beads" />
        {ER_RUNS.map(([x, y, h, dur, at], i) => <span key={i} className="er-run" style={{ left: x, top: y, height: h, animationDuration: `${dur}s`, animationDelay: `${at}s` }} />)}
      </span>
      <Box name="emoroomwall" left={0} top={0} w={600} h={366} className="scn-erwall" />
      <span className="er-winlight" />
      <span className="er-wash" />
      <span className="er-lights">{ER_LIGHTS.map(([x, y, c], i) => <span key={i} className={`er-bulb er-bulb-${c}`} style={{ left: x - 9, top: y - 9, ...erTwinkle(i) }} />)}</span>
      <Box name="emoroomrug" left={0} top={366} w={600} h={94} className="scn-errug" />
      <span className="er-shaft" />
      <Box name="emoroombed" left={-2} top={252} w={184} h={148} className="scn-erbed" />
      <Box name="emoroomstand" left={161} top={244} w={59} h={156} className="scn-erstand" />
      <span className="scn er-lava" style={{ left: 181, top: 258, width: 20, height: 43, clipPath: ER_GLASS }}>
        <span className="er-pool" />
        {[0, 1, 2, 3].map((k) => <span key={k} className={`er-blob er-blob-${k}`} />)}
      </span>
      <Box name="emoroomlavafront" left={179} top={256} w={24} h={47} />
      <span className="er-lavaglow" />
      <Box name="emoroomdesk" left={396} top={196} w={204} h={204} className="scn-erdesk" />
      <Box name="emoroomscreen" left={454} top={221} w={70} h={53} className="er-screen" />
      <span className="scn er-scanbox" style={{ left: 454, top: 221, width: 70, height: 53 }}><span className="er-scan" /></span>
      <span className="er-crtglow" />
      <span className="er-candleglow" />
      <Box name="emoroomflame" left={567} top={234.7} w={10} h={16} className="er-flame" />
    </div>
  );
}

/** In front of the cat: ground fog, low, so the cat's feet blur into it and nothing else is hidden. */
export function SceneryFront({ scene }: { scene: SceneName }) {
  if (scene === 'kotel') return <div className="scenery scenery-front" aria-hidden><span className="kotel-vignette" /></div>;
  if (scene === 'majlis') return <div className="scenery scenery-front" aria-hidden><span className="mj-vignette" /></div>;
  if (scene === 'emoroom') return <div className="scenery scenery-front" aria-hidden><span className="er-vignette" /></div>;
  if (scene === 'backrooms') {
    // the light falls off toward the edges of the frame: a soft vignette, nothing over the cat itself
    return <div className="scenery scenery-front" aria-hidden><span className="br-vignette" /></div>;
  }
  if (scene !== 'halloween') return null;
  return (
    <div className="scenery scenery-front" aria-hidden>
      <span className="fog fog-a" /><span className="fog fog-b" /><span className="fog fog-c" />
    </div>
  );
}
