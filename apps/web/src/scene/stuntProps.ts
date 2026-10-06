/** The frok's stunt props (props.ts loadStuntProps): a chunk of their own, fetched when a frok's room opens. */
import slaphand from '@emo-pets/pet/props/slaphand.svg?raw';
import clawarm from '@emo-pets/pet/props/clawarm.svg?raw';
import match from '@emo-pets/pet/props/match.svg?raw';
import fireback from '@emo-pets/pet/props/fireback.svg?raw';
import water from '@emo-pets/pet/props/water.svg?raw';
import puddle from '@emo-pets/pet/props/puddle.svg?raw';
import { fit } from './props';

export const STUNT_PROPS = { slaphand: fit(slaphand), clawarm: fit(clawarm), match: fit(match), fireback: fit(fireback), water: fit(water), puddle: fit(puddle) } as const;
