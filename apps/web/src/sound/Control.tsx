// The sound control, for the pages: these are all a page needs to import. In a build without sound (`__SOUND__` off)
// both render nothing and the control's code is not in the build at all.
import { lazy, Suspense } from 'react';
import { audible } from './cue';

const Pill = __SOUND__ ? lazy(() => import('./SoundPill').then((m) => ({ default: m.SoundPill }))) : null;
const Row = __SOUND__ ? lazy(() => import('./SoundPill').then((m) => ({ default: m.SoundRow }))) : null;

/** The speaker and its mixer. `side`/`drop`: which way the mixer opens. */
export function SoundControl(p: { side?: 'left' | 'right'; drop?: 'down' | 'up'; className?: string }) {
  return Pill && audible() ? <Suspense fallback={null}><Pill {...p} /></Suspense> : null;
}
/** The on/off switch as a line of a menu. */
export function SoundMenuRow() {
  return Row && audible() ? <Suspense fallback={null}><Row /></Suspense> : null;
}
