/**
 * The room themes' art (the Backrooms, the Western Wall, the Majlis, the emo bedroom, the haunted room's tree, moon and fence): only the
 * scenery draws it, so it lives with the scenery, a chunk of its own that a room loads when a pet is in a room theme (the
 * mobile pass, 2026-09-29: ~330 KB that every page carried in its main bundle). The pumpkin, the bat, the cobweb and the
 * tombstone stay in PROPS: they are icons too.
 */
import deadtree from '@emo-pets/pet/props/deadtree.svg?raw';
import harvestmoon from '@emo-pets/pet/props/harvestmoon.svg?raw';
import fence from '@emo-pets/pet/props/fence.svg?raw';
import ceiling from '@emo-pets/pet/props/ceiling.svg?raw';
import wallfoot from '@emo-pets/pet/props/wallfoot.svg?raw';
import partition from '@emo-pets/pet/props/partition.svg?raw';
import opening from '@emo-pets/pet/props/opening.svg?raw';
import kotelwall from '@emo-pets/pet/props/kotelwall.svg?raw';
import kotelplaza from '@emo-pets/pet/props/kotelplaza.svg?raw';
import koteldove from '@emo-pets/pet/props/koteldove.svg?raw';
import kotelperch from '@emo-pets/pet/props/kotelperch.svg?raw';
import majlissky from '@emo-pets/pet/props/majlissky.svg?raw';
import majliscloud from '@emo-pets/pet/props/majliscloud.svg?raw';
import majlisbird from '@emo-pets/pet/props/majlisbird.svg?raw';
import majlisjet from '@emo-pets/pet/props/majlisjet.svg?raw';
import majlismist from '@emo-pets/pet/props/majlismist.svg?raw';
import majlisflame from '@emo-pets/pet/props/majlisflame.svg?raw';
import majlislanternfront from '@emo-pets/pet/props/majlislanternfront.svg?raw';
import majlissteam from '@emo-pets/pet/props/majlissteam.svg?raw';
import majlissmoke from '@emo-pets/pet/props/majlissmoke.svg?raw';
import majlisplane from '@emo-pets/pet/props/majlisplane.svg?raw';
import majliswall from '@emo-pets/pet/props/majliswall.svg?raw';
import majlisspecks from '@emo-pets/pet/props/majlisspecks.svg?raw';
import majlisseat from '@emo-pets/pet/props/majlisseat.svg?raw';
import majlisrug from '@emo-pets/pet/props/majlisrug.svg?raw';
import majlislantern from '@emo-pets/pet/props/majlislantern.svg?raw';
import majlistray from '@emo-pets/pet/props/majlistray.svg?raw';
import majlisincense from '@emo-pets/pet/props/majlisincense.svg?raw';
import emoroomout from '@emo-pets/pet/props/emoroomout.svg?raw';
import emoroomoutlit from '@emo-pets/pet/props/emoroomoutlit.svg?raw';
import emoroombeads from '@emo-pets/pet/props/emoroombeads.svg?raw';
import emoroomwall from '@emo-pets/pet/props/emoroomwall.svg?raw';
import emoroombed from '@emo-pets/pet/props/emoroombed.svg?raw';
import emoroomstand from '@emo-pets/pet/props/emoroomstand.svg?raw';
import emoroomlavafront from '@emo-pets/pet/props/emoroomlavafront.svg?raw';
import emoroomdesk from '@emo-pets/pet/props/emoroomdesk.svg?raw';
import emoroomscreen from '@emo-pets/pet/props/emoroomscreen.svg?raw';
import emoroomrug from '@emo-pets/pet/props/emoroomrug.svg?raw';
import emoroomflame from '@emo-pets/pet/props/emoroomflame.svg?raw';
import { fit } from './props';

export const ROOM_ART = {
  deadtree: fit(deadtree), harvestmoon: fit(harvestmoon), fence: fit(fence), ceiling: fit(ceiling), wallfoot: fit(wallfoot), partition: fit(partition), opening: fit(opening), kotelwall: fit(kotelwall), kotelplaza: fit(kotelplaza), koteldove: fit(koteldove), kotelperch: fit(kotelperch), majlissky: fit(majlissky), majliscloud: fit(majliscloud), majlisbird: fit(majlisbird), majlisjet: fit(majlisjet), majlismist: fit(majlismist), majlisflame: fit(majlisflame), majlislanternfront: fit(majlislanternfront), majlissteam: fit(majlissteam), majlissmoke: fit(majlissmoke), majlisplane: fit(majlisplane), majliswall: fit(majliswall), majlisspecks: fit(majlisspecks), majlisseat: fit(majlisseat), majlisrug: fit(majlisrug), majlislantern: fit(majlislantern), majlistray: fit(majlistray), majlisincense: fit(majlisincense),
  // the emo bedroom (the emo pack's room, emoroomprops.py)
  emoroomout: fit(emoroomout), emoroomoutlit: fit(emoroomoutlit), emoroombeads: fit(emoroombeads), emoroomwall: fit(emoroomwall), emoroombed: fit(emoroombed), emoroomstand: fit(emoroomstand), emoroomlavafront: fit(emoroomlavafront), emoroomdesk: fit(emoroomdesk), emoroomscreen: fit(emoroomscreen), emoroomrug: fit(emoroomrug), emoroomflame: fit(emoroomflame),
} as const;
export type RoomArtName = keyof typeof ROOM_ART;
export const ROOM_ASPECT: Record<RoomArtName, number> = {
  deadtree: 212 / 336, harvestmoon: 1, fence: 350 / 62, ceiling: 600 / 88, wallfoot: 600 / 8, partition: 82 / 390, opening: 134 / 282, kotelwall: 600 / 340, kotelplaza: 600 / 98, koteldove: 58 / 30, kotelperch: 46 / 36, majlissky: 220 / 222, majliscloud: 80 / 32, majlisbird: 2, majlisjet: 10 / 60, majlismist: 10, majlisflame: 15 / 23, majlislanternfront: 36 / 158, majlissteam: 12 / 32, majlissmoke: 16 / 68, majlisplane: 52 / 7, majliswall: 600 / 366, majlisspecks: 1, majlisseat: 600 / 100, majlisrug: 600 / 86, majlislantern: 36 / 158, majlistray: 92 / 74, majlisincense: 40 / 54,
  emoroomout: 172 / 152, emoroomoutlit: 172 / 152, emoroombeads: 160 / 140, emoroomwall: 600 / 366, emoroombed: 184 / 148, emoroomstand: 59 / 156, emoroomlavafront: 24 / 47, emoroomdesk: 204 / 204, emoroomscreen: 70 / 53, emoroomrug: 600 / 94, emoroomflame: 10 / 16,
};
