/**
 * Emonad (the $EMO mascot) as an Emogotchi pet, wired into the rig and the room: his drawing, his own moves, his ways in
 * the room, his css and his size. Whatever shows him imports this first: his lab (/emonadgotchi, dev only), and through
 * Pet.tsx's loader (dev only) any Stage that is given him.
 */
import svg from '@emo-pets/pet/emonadgotchi.svg?raw';
import { registerDrawing } from '../pet/Pet';
import { registerOwnMoves } from '../pet/rig';
import { registerOwnWays } from '../scene/director';
import { PET_SCALE } from '../scene/world';
import { egMoves } from './moves';
import { egWays } from './ways';
import './emonadgotchi.css';

// He is a tall figure whose face is a tenth of his height: he stands 1.35x the cat's box (about Sahur's height, his hair's
// top near y 130 of the 460 room), set here so no production file names him.
PET_SCALE.emonad = 1.35;
registerDrawing('emonad', svg);
registerOwnMoves('emonad', egMoves);
registerOwnWays('emonad', egWays);
export default svg;
