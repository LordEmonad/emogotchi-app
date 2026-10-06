/**
 * Profile banners: Emotown's own streets, drawn by the town itself (tools/social-banners.mjs screenshots the live town
 * with nobody on it, at night, and the park in each season by day). No uploads: a banner is one of these names.
 */
import type { BannerId } from './rules';

export const BANNER_LABEL: Record<BannerId, string> = {
  hall: 'Town hall', diner: 'Emo Diner', baths: 'The bathhouse', park: 'The park', shop: 'The item shop', inn: 'Sleepy Inn',
  furnace: 'The furnace', haunted: 'The haunted house', backrooms: 'The Backrooms', graveyard: 'The graveyard',
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
};
export const BANNER_SRC = (id: BannerId | string) => `/social/banners/${id}.webp`;
