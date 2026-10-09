import { useEffect, useRef } from 'react'
import { gsap, prefersReducedMotion, SplitText } from '../lib/gsap'

/**
 * Per-word blur-in reveal for the agent's narration lines, using GSAP
 * SplitText (free since GSAP 3.13).
 *
 * SplitText rewrites the element's DOM into per-word spans, so the instance
 * must be reverted on unmount — otherwise React would later try to reconcile
 * children it never created.
 */
export function BlurInText({ text, className }: { text: string; className?: string }) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current
		if (!el || prefersReducedMotion()) return

		// Write the text in by hand before splitting. SplitText replaces this
		// element's children with per-word spans, which leaves React holding a
		// text node that is no longer in the document — so when `text` changes,
		// React's update lands on nothing, and the cleanup below then reverts the
		// element to the *previous* words. Without this line the line would show
		// one objective forever.
		el.textContent = text

		// Split synchronously: useEffect already runs after the DOM is
		// committed, and deferring to rAF would mean the words never appear at
		// all in a backgrounded tab, where rAF is throttled.
		const split = new SplitText(el, { type: 'words', wordsClass: 'blur-word' })
		const tween = gsap.fromTo(
			split.words,
			{ opacity: 0, filter: 'blur(6px)', y: 4 },
			{ opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.035 }
		)

		return () => {
			tween.kill()
			split.revert()
		}
	}, [text])

	return (
		<div ref={ref} className={className}>
			{text}
		</div>
	)
}
