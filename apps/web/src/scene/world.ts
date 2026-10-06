/** World units. The stage is a 600×460 box scaled to fit; everything is placed in these units. */
export const WORLD = { w: 600, h: 460, floor: 400 } as const;
/** The cat's rendered size in world units and where its feet sit inside its own box (svg y=212 of 230). */
export const CAT = { h: 240, w: 240 * (200 / 230), footY: 240 * (212 / 230) } as const;
export const CAT_TOP = WORLD.floor - CAT.footY;
export const WALK_MIN = 110;
export const WALK_MAX = WORLD.w - 110;

/**
 * Slack around the cat inside its host box. The rig animates groups inside the SVG, and a jump paints
 * well above the cat's own box (up to 160 world units going into the tub). Desktop Chrome honours
 * `overflow: visible` on the SVG and paints it anyway; iOS gives `.cathost` its own compositing layer
 * and clips to the box, which cut the top of the cat's head off mid-jump. So the box carries the room
 * the animations actually use. Measured worst case: top 160, bottom 18, left 10, right 50.
 */
export const CAT_PAD = { top: 190, bottom: 30, side: 70 } as const;
export const HOST_TOP = CAT_TOP - CAT_PAD.top;
export const HOST_W = CAT.w + CAT_PAD.side * 2;
export const HOST_H = CAT.h + CAT_PAD.top + CAT_PAD.bottom;

/**
 * How much bigger than the cat's box a character stands in the room. Tung Tung Tung Sahur is a log three times
 * taller than it is wide: at the cat's height he is a toothpick and his face unreadable, so he stands 1.4x (a
 * 336-unit box, his top at y=90 of the 460 room). The rig is untouched by this: the box scales, the svg is the same.
 */
export type PetName = 'cat' | 'frog' | 'sahur' | 'seal' | 'thiccums' | 'r3tards' | 'emonad';   // (emonad's scale is set by his own module, so no production file names him)
export const PET_SCALE: Partial<Record<PetName, number>> = { cat: 1, frog: 1, sahur: 1.4, r3tards: 1.25 };   // (r3tards: a face 116 wide on a stick reads small at 1)   // (a character not listed stands at 1)
/** The character's box in world units: its size, where its feet sit, its top, and the host box with the pad around it. */
export function petBox(character: PetName) {
  const k = PET_SCALE[character] ?? 1;
  const h = CAT.h * k; const w = CAT.w * k; const footY = CAT.footY * k; const top = WORLD.floor - footY;
  return { h, w, footY, top, hostTop: top - CAT_PAD.top, hostW: w + CAT_PAD.side * 2, hostH: h + CAT_PAD.top + CAT_PAD.bottom, S: h / 230 };
}
