/**
 * Thiccums, wired into the rig and the room: his drawing, his moves (the bouncy butt), his ways and his css. His lab
 * (/thiccums/lab, dev only) imports it; on the site it is his drawing's loader (Pet.tsx), so a page fetches it only when it
 * shows him (the mobile pass, 2026-09-29: it was fetched for every page, 150 KB gzipped). Only in a build with his switch on
 * (__THICCUMS__, vite.config.ts): a build without him carries none of it. His page styles are site.css (main.tsx).
 */
import svg from '@emo-pets/pet/thiccums.svg?raw';
import { registerDrawing } from '../pet/Pet';
import { registerOwnMoves } from '../pet/rig';
import { registerOwnWays } from '../scene/director';
import { thiccMoves } from './moves';
import { thiccWays } from './ways';
import './thiccums.css';

registerDrawing('thiccums', svg);
registerOwnMoves('thiccums', thiccMoves);
registerOwnWays('thiccums', thiccWays);
// the drawing, for Pet.tsx's loader (it is registered above already, with his moves and ways)
export default svg;
