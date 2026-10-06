/** The emo pack's props (props.ts loadEmoProps; DEV only until they are items: /emopack): the guitar the pets strum, the
 *  note it sends up, the selfie's flip phone and its flash (emoprops.py). A chunk of their own, fetched by the guitar and
 *  the selfie themselves, so nothing of them rides in the main bundle. */
import emoguitar from '@emo-pets/pet/props/emoguitar.svg?raw';
import emoguitarnote from '@emo-pets/pet/props/emoguitarnote.svg?raw';
import emophone from '@emo-pets/pet/props/emophone.svg?raw';
import emoflash from '@emo-pets/pet/props/emoflash.svg?raw';
import { fit } from './props';

export const EMO_PROPS = { emoguitar: fit(emoguitar), emoguitarnote: fit(emoguitarnote), emophone: fit(emophone), emoflash: fit(emoflash) } as const;
/** The raw drawings, for the ones drawn INTO a pet's own svg (the held guitar, the held phone): their inner markup. */
export const EMO_RAW = { emoguitar, emophone } as const;
