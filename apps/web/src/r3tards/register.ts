/**
 * The r3tards character, wired into the rig and the room: its drawing, its own moves, its ways and its css. Whatever shows him imports this first: the lab (/r3tards, dev only) and the mint page (/r3tardgotchi).
 */
import svg from '@emo-pets/pet/r3tards.svg?raw';
import { registerDrawing } from '../pet/Pet';
import { registerOwnMoves } from '../pet/rig';
import { registerOwnWays } from '../scene/director';
import { r3Moves } from './moves';
import { r3Ways } from './ways';
import './r3tards.css';

registerDrawing('r3tards', svg);
registerOwnMoves('r3tards', r3Moves);
registerOwnWays('r3tards', r3Ways);
export default svg;
