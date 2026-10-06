/**
 * Which animations belong to which pet, kept as they are made. Emotown pauses a pet the moment it leaves the screen and
 * resumes it when it comes back; asking the browser (`el.getAnimations({ subtree: true })`) for a 500-node drawing's
 * animations costs about 2 ms a pet (measured 2026-09-26: 770 ms of a 4 s pan), so instead every `animate()` on an
 * element inside a pet's pocket is noted against that pocket as it happens, and dropped when it finishes or is
 * cancelled. A finished hold that fills forward is still, so it needs no pausing and is not kept.
 *
 * The hook is installed once, when Emotown's code loads (it is its own page), and only watches elements in a `.pocket`.
 */
const live = new WeakMap<Element, Set<Animation>>();
let installed = false;

export function installAnimationRegistry() {
  if (installed || typeof Element === 'undefined') return;
  installed = true;
  const original = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const pocket = this.closest('.pocket');
    // Inside a pet's drawing, keep every animation on the main thread. Chrome composites transform and opacity
    // animations on SVG elements, which gives every pupil, lid, eye and "z" of every pet a compositing layer of its
    // own: 1,095 layers on the street (measured 2026-09-26), all on the compositor thread that native scrolling runs
    // on, which then dropped a fifth of a swipe's frames. A custom property in a keyframe is not compositable, so the
    // animation stays on the main thread (a repaint of that pet), and the compositor stays free to scroll.
    if (pocket && this instanceof SVGElement && Array.isArray(keyframes)) keyframes = keyframes.map((k) => ({ ...k, '--m': '0' }));
    const a = original.call(this, keyframes, options);
    if (pocket) {
      let set = live.get(pocket); if (!set) { set = new Set(); live.set(pocket, set); }
      set.add(a);
      const drop = () => set!.delete(a);
      a.addEventListener('finish', drop); a.addEventListener('cancel', drop); a.addEventListener('remove', drop);
    }
    return a;
  };
}

/** a pet's animations that are still running (or paused mid-run) */
export const animationsOf = (pocket: Element): Animation[] => [...(live.get(pocket) ?? [])];
