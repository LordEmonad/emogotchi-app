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
import cobweb from '@emo-pets/pet/props/cobweb.svg?raw';
import pumpkin from '@emo-pets/pet/props/pumpkin.svg?raw';
import tombstone from '@emo-pets/pet/props/tombstone.svg?raw';
import deadtree from '@emo-pets/pet/props/deadtree.svg?raw';
import bat from '@emo-pets/pet/props/bat.svg?raw';
import harvestmoon from '@emo-pets/pet/props/harvestmoon.svg?raw';
import fence from '@emo-pets/pet/props/fence.svg?raw';

const fit = (svg: string) => svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');

export const PROPS = {
  bowl: fit(bowl), poop: fit(poop), tubBack: fit(tubBack), tubFront: fit(tubFront), yarn: fit(yarn), heart: fit(heart),
  bubble: fit(bubble), sparkle: fit(sparkle), droplet: fit(droplet), puff: fit(puff), scoop: fit(scoop), sponge: fit(sponge),
  thought: fit(thought), moon: fit(moon), crumb: fit(crumb), foam: fit(foam), tangle: fit(tangle), sun: fit(sun), coin: fit(coin), flame: fit(flame), grave: fit(grave),
  cobweb: fit(cobweb), pumpkin: fit(pumpkin), tombstone: fit(tombstone), deadtree: fit(deadtree), bat: fit(bat), harvestmoon: fit(harvestmoon), fence: fit(fence),
} as const;
export type PropName = keyof typeof PROPS;

/** Native aspect (w/h) of each prop file. */
export const ASPECT: Record<PropName, number> = {
  bowl: 120 / 74, poop: 80 / 72, tubBack: 300 / 140, tubFront: 300 / 140, yarn: 72 / 74, heart: 1, bubble: 1, sparkle: 1,
  droplet: 20 / 30, puff: 88 / 62, scoop: 1, sponge: 64 / 40, thought: 130 / 100, moon: 1, crumb: 14 / 12, foam: 76 / 44, tangle: 200 / 230, sun: 1, coin: 1, flame: 1, grave: 80 / 86,
  cobweb: 1, pumpkin: 112 / 100, tombstone: 104 / 116, deadtree: 212 / 336, bat: 90 / 46, harvestmoon: 1, fence: 350 / 62,
};
