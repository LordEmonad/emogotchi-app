/**
 * Room themes: a Scene item swaps the wall, the floor and the light and adds fixed scenery around the
 * cat. The pieces sit at the edges of the room, behind the cat, so the bowl, the tub and the yarn keep
 * their places in front of everything. Motion is CSS only (bats crossing, a spider swinging, a
 * pumpkin's light flickering, fog drifting) and stops under prefers-reduced-motion.
 */
import { PROPS } from './props';
import { WORLD } from './world';

export type SceneName = 'halloween';

const Piece = ({ name, x, bottom, w, ar, className = '', style = {} }: { name: keyof typeof PROPS; x: number; bottom: number; w: number; ar: number; className?: string; style?: React.CSSProperties }) => {
  const h = w / ar;
  return <div className={`scn ${className}`} style={{ left: x - w / 2, top: bottom - h, width: w, height: h, ...style }} dangerouslySetInnerHTML={{ __html: PROPS[name] }} />;
};

/** Behind the cat: sky, moon, cobwebs, the tree, the stones and the pumpkins. */
export function SceneryBack({ scene }: { scene: SceneName }) {
  if (scene !== 'halloween') return null;
  const F = WORLD.floor;
  return (
    <div className="scenery scenery-back" aria-hidden>
      <Piece name="harvestmoon" x={432} bottom={168} w={126} ar={1} className="scn-moon" />
      <Piece name="cobweb" x={50} bottom={100} w={100} ar={1} className="scn-web" />
      <Piece name="cobweb" x={556} bottom={76} w={76} ar={1} className="scn-web scn-web-r" />
      {[0, 1, 2].map((i) => <Piece key={i} name="bat" x={0} bottom={0} w={[54, 40, 32][i]!} ar={90 / 46} className={`scn-bat scn-bat-${i}`} />)}
      <Piece name="fence" x={300} bottom={F - 6} w={330} ar={350 / 62} className="scn-fence" />
      <Piece name="deadtree" x={540} bottom={F + 8} w={222} ar={212 / 336} className="scn-tree" />
      <span className="pumpkin-light" style={{ left: 20, top: F - 30 }} />
      <Piece name="tombstone" x={70} bottom={F + 4} w={112} ar={104 / 116} className="scn-stone" />
      <Piece name="pumpkin" x={136} bottom={F + 8} w={86} ar={112 / 100} className="scn-pumpkin scn-pumpkin-a" />
      <Piece name="pumpkin" x={28} bottom={F + 6} w={56} ar={112 / 100} className="scn-pumpkin scn-pumpkin-b" style={{ transform: 'scaleX(-1)' }} />
    </div>
  );
}

/** In front of the cat: ground fog, low, so the cat's feet blur into it and nothing else is hidden. */
export function SceneryFront({ scene }: { scene: SceneName }) {
  if (scene !== 'halloween') return null;
  return (
    <div className="scenery scenery-front" aria-hidden>
      <span className="fog fog-a" /><span className="fog fog-b" /><span className="fog fog-c" />
    </div>
  );
}
