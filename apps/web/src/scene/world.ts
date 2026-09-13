/** World units. The stage is a 600×460 box scaled to fit; everything is placed in these units. */
export const WORLD = { w: 600, h: 460, floor: 400 } as const;
/** The cat's rendered size in world units and where its feet sit inside its own box (svg y=212 of 230). */
export const CAT = { h: 240, w: 240 * (200 / 230), footY: 240 * (212 / 230) } as const;
export const CAT_TOP = WORLD.floor - CAT.footY;
export const WALK_MIN = 110;
export const WALK_MAX = WORLD.w - 110;
