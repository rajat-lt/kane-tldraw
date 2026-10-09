import { gsap } from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { SplitText } from 'gsap/SplitText'

/**
 * Single GSAP registration point.
 *
 * DrawSVGPlugin, MotionPathPlugin and SplitText were "Club GreenSock" plugins
 * until GSAP 3.13 — they now ship in the public npm package, so no private
 * registry or license key is needed.
 *
 * Import from here (never from 'gsap' directly) so plugins are guaranteed to
 * be registered before any tween runs.
 */
gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin, SplitText)

/** True when the user has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export { DrawSVGPlugin, gsap, MotionPathPlugin, SplitText }
