import bowl from '@emo-pets/pet/props/bowl.svg?raw';
import poop from '@emo-pets/pet/props/poop.svg?raw';
import tubBack from '@emo-pets/pet/props/tub-back.svg?raw';
import tubFront from '@emo-pets/pet/props/tub-front.svg?raw';
import yarn from '@emo-pets/pet/props/yarn.svg?raw';
import heart from '@emo-pets/pet/props/heart.svg?raw';
import bubble from '@emo-pets/pet/props/bubble.svg?raw';
import sparkle from '@emo-pets/pet/props/sparkle.svg?raw';
import droplet from '@emo-pets/pet/props/droplet.svg?raw';
import puff from '@emo-pets/pet/props/puff.svg?raw';
import scoop from '@emo-pets/pet/props/scoop.svg?raw';
import sponge from '@emo-pets/pet/props/sponge.svg?raw';
import thought from '@emo-pets/pet/props/thought.svg?raw';
import moon from '@emo-pets/pet/props/moon.svg?raw';
import crumb from '@emo-pets/pet/props/crumb.svg?raw';
import foam from '@emo-pets/pet/props/foam.svg?raw';
import tangle from '@emo-pets/pet/props/tangle.svg?raw';
import sun from '@emo-pets/pet/props/sun.svg?raw';
import coin from '@emo-pets/pet/props/coin.svg?raw';
import flame from '@emo-pets/pet/props/flame.svg?raw';
import grave from '@emo-pets/pet/props/grave.svg?raw';
import emohair from '@emo-pets/pet/props/emohair.svg?raw';
import cobweb from '@emo-pets/pet/props/cobweb.svg?raw';
import pumpkin from '@emo-pets/pet/props/pumpkin.svg?raw';
import tombstone from '@emo-pets/pet/props/tombstone.svg?raw';
import bat from '@emo-pets/pet/props/bat.svg?raw';
// the frog's own actions (frogprops.py)
import camera from '@emo-pets/pet/props/camera.svg?raw';
import clawjaw from '@emo-pets/pet/props/clawjaw.svg?raw';
import fire from '@emo-pets/pet/props/fire.svg?raw';
import pow from '@emo-pets/pet/props/pow.svg?raw';
import whoosh from '@emo-pets/pet/props/whoosh.svg?raw';
// Tung Tung Tung Sahur's own actions (sahurprops.py)
import tung from '@emo-pets/pet/props/tung.svg?raw';
import ring from '@emo-pets/pet/props/ring.svg?raw';
// the dreidel, the Jewish pack's toy: play() spins it instead of the yarn (dreidelprops.py)
import dreidel from '@emo-pets/pet/props/dreidel.svg?raw';
import dreidelbadge from '@emo-pets/pet/props/dreidelbadge.svg?raw';
import gelt from '@emo-pets/pet/props/gelt.svg?raw';
// the darbuka, the Habibi pack's toy: play() drums it instead of the yarn (darbukaprops.py)
import darbuka from '@emo-pets/pet/props/darbuka.svg?raw';
import darbukaripple from '@emo-pets/pet/props/darbukaripple.svg?raw';
import darbukanote from '@emo-pets/pet/props/darbukanote.svg?raw';
// the kapparot hen, the Jewish pack's Pet item (kapparotprops.py)
import hen from '@emo-pets/pet/props/hen.svg?raw';
import feather from '@emo-pets/pet/props/feather.svg?raw';
// the falcon, the Habibi pack's Pet item (falconprops.py): the bird, and the feather it sheds when it rouses
import falcon from '@emo-pets/pet/props/falcon.svg?raw';
import falconfeather from '@emo-pets/pet/props/falconfeather.svg?raw';
// the seal's own actions (sealprops.py): the fish it is fed
import sealfish from '@emo-pets/pet/props/sealfish.svg?raw';

export const fit = (svg: string) => svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');

const CORE = {
  bowl: fit(bowl), poop: fit(poop), tubBack: fit(tubBack), tubFront: fit(tubFront), yarn: fit(yarn), heart: fit(heart),
  bubble: fit(bubble), sparkle: fit(sparkle), droplet: fit(droplet), puff: fit(puff), scoop: fit(scoop), sponge: fit(sponge),
  thought: fit(thought), moon: fit(moon), crumb: fit(crumb), foam: fit(foam), tangle: fit(tangle), sun: fit(sun), coin: fit(coin), flame: fit(flame), grave: fit(grave),
  cobweb: fit(cobweb), pumpkin: fit(pumpkin), tombstone: fit(tombstone), bat: fit(bat),   camera: fit(camera), clawjaw: fit(clawjaw), fire: fit(fire), pow: fit(pow), whoosh: fit(whoosh), emohair: fit(emohair),
  tung: fit(tung), ring: fit(ring),
  dreidel: fit(dreidel), dreidelbadge: fit(dreidelbadge), gelt: fit(gelt),
  darbuka: fit(darbuka), darbukaripple: fit(darbukaripple), darbukanote: fit(darbukanote),
  hen: fit(hen), feather: fit(feather),
  falcon: fit(falcon), falconfeather: fit(falconfeather),
  sealfish: fit(sealfish),
        } as const;
/** The frok's big stunt props (the slap's arm, the claw's pole, the match, the fire behind him, the gush, the puddle): only
 *  his slap, squeeze and burn draw them, so they are a chunk of their own (stuntProps.ts), fetched when a frok's room
 *  opens (the director) and waited for by those three actions (the mobile pass, 2026-09-29). Until then they are absent here. */
export type PropName = keyof typeof CORE | keyof typeof import('./stuntProps').STUNT_PROPS | keyof typeof import('./emoProps').EMO_PROPS;
export const PROPS = CORE as unknown as Record<PropName, string>;
let stunts: Promise<void> | null = null;
export const loadStuntProps = (): Promise<void> => (stunts ??= import('./stuntProps').then((m) => { Object.assign(PROPS, m.STUNT_PROPS); }, () => { stunts = null; }));
/** The emo pack's props (emoProps.ts): fetched by the guitar and the selfie, which wait for them. */
let emo: Promise<typeof import('./emoProps')> | null = null;
export const loadEmoProps = () => (emo ??= import('./emoProps').then((m) => { Object.assign(PROPS, m.EMO_PROPS); return m; }, (e) => { emo = null; throw e; }));

/** Native aspect (w/h) of each prop file. */
export const ASPECT: Record<PropName, number> = {
  bowl: 120 / 74, poop: 80 / 72, tubBack: 300 / 140, tubFront: 300 / 140, yarn: 72 / 74, heart: 1, bubble: 1, sparkle: 1,
  droplet: 20 / 30, puff: 88 / 62, scoop: 1, sponge: 64 / 40, thought: 130 / 100, moon: 1, crumb: 14 / 12, foam: 76 / 44, tangle: 200 / 230, sun: 1, coin: 1, flame: 1, grave: 80 / 86,
  cobweb: 1, pumpkin: 112 / 100, tombstone: 104 / 116, bat: 90 / 46,   camera: 100 / 70, slaphand: 1400 / 260, clawarm: 1300 / 260, clawjaw: 400 / 260, match: 24 / 84, fire: 150 / 160, fireback: 200 / 220, water: 146 / 480, pow: 1, whoosh: 100 / 60, puddle: 120 / 28, emohair: 130 / 124,
  tung: 200 / 130, ring: 120 / 40,
  dreidel: 180 / 104, dreidelbadge: 1, gelt: 1,
  darbuka: 70 / 104, darbukaripple: 64 / 20, darbukanote: 40 / 44,
  hen: 1, feather: 22 / 26,
  falcon: 140 / 150, falconfeather: 22 / 26,
  sealfish: 100 / 56,
  emoguitar: 162 / 76, emoguitarnote: 32 / 40, emophone: 40 / 76, emoflash: 1,
        };
