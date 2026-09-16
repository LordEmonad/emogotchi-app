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
