import { FocusEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Kane's own tooltip — the dark pill the right bar has always used, made
 * reusable so nothing has to fall back to the browser's native `title`.
 *
 * Native tooltips can't be styled, sit in the OS layer rather than the app's,
 * come in with the platform's own delay, and are invisible to a screenshot of a
 * demo. This renders in the page, matches the rest of the chrome, and is
 * announced through `role="tooltip"` with the control describing itself.
 *
 * It renders into `document.body`, not next to the control. A tip positioned as
 * a sibling is clipped by any ancestor with `overflow: hidden` — which is how
 * the three tips at the right end of the browser sub-topbar lost their last
 * words to the 44px between that bar's edge and the pane's. A tip must be
 * readable whole or it isn't a tip, and the only way to guarantee that is to
 * take it out of every clipping box on the page.
 */

/** How long the pointer has to rest before the tip appears. */
const OPEN_DELAY_MS = 380

/**
 * A tip that opens within this long of another one closing skips both the wait
 * and the entrance. Moving along a row of controls, each label is there as soon
 * as the pointer is; the first wait only exists to stop accidental tips.
 * Radix's tooltip uses the same window (`skipDelayDuration`).
 */
const SKIP_DELAY_MS = 300

/** When a tip last closed. Shared by every tip on the page. */
let lastTipClosedAt = -Infinity

/** Clear space to keep between a tip and the edge of the window. */
const EDGE_MARGIN = 8

/** Distance between the control and its tip. */
const GAP_PX = 8

export type TipSide = 'top' | 'bottom' | 'left' | 'right'

function clamp(value: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(value, Math.max(lo, hi)))
}

/**
 * Whether a tip is showing and whether it skips its entrance, plus the handlers
 * its trigger needs. Every tooltip in the app opens through this, so they all
 * wait, and stop waiting, the same way.
 */
export function useTipOpen() {
	const [open, setOpen] = useState(false)
	/** Open without the entrance: a neighbour of an open tip, or keyboard focus. */
	const [instant, setInstant] = useState(false)
	const timer = useRef(0)

	useEffect(() => () => window.clearTimeout(timer.current), [])

	const show = (viaKeyboard: boolean) => {
		window.clearTimeout(timer.current)
		if (performance.now() - lastTipClosedAt < SKIP_DELAY_MS) {
			setInstant(true)
			setOpen(true)
			return
		}
		timer.current = window.setTimeout(() => {
			// a keystroke summoned it, so it doesn't animate in
			setInstant(viaKeyboard)
			setOpen(true)
		}, OPEN_DELAY_MS)
	}
	const hide = () => {
		window.clearTimeout(timer.current)
		if (open) lastTipClosedAt = performance.now()
		setOpen(false)
	}

	return {
		open,
		instant,
		triggerProps: {
			onMouseEnter: () => show(false),
			onMouseLeave: hide,
			// Keyboard users get the same hint when the control takes focus. Only
			// keyboard focus, though: a click focuses the button too, and that
			// would bring back the tip the click has just put away.
			onFocusCapture: (e: FocusEvent) => {
				if ((e.target as Element).matches(':focus-visible')) show(true)
			},
			onBlurCapture: hide,
			// a tip left hanging over whatever the click just opened reads as a bug
			onPointerDown: hide,
		},
	}
}

export function Tip({
	label,
	side = 'bottom',
	/** Let a long explanation wrap instead of running off the edge. */
	wrap = false,
	className,
	children,
}: {
	label: ReactNode
	side?: TipSide
	wrap?: boolean
	className?: string
	children: ReactNode
}) {
	const { open, instant, triggerProps } = useTipOpen()
	const anchorRef = useRef<HTMLSpanElement>(null)
	const tipRef = useRef<HTMLSpanElement>(null)
	/** Viewport coordinates, once the tip has been measured. */
	const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

	/**
	 * Placed from both boxes rather than from CSS offsets: the tip's own size
	 * decides whether it fits on the chosen side, and it is only known once it
	 * has been laid out. A layout effect runs before paint, so the first painted
	 * frame is already in the right place.
	 */
	useLayoutEffect(() => {
		if (!open) {
			setPos(null)
			return
		}
		const anchor = anchorRef.current
		const tip = tipRef.current
		if (!anchor || !tip) return
		const a = anchor.getBoundingClientRect()
		const t = tip.getBoundingClientRect()

		let left: number
		let top: number
		if (side === 'left' || side === 'right') {
			left = side === 'left' ? a.left - t.width - GAP_PX : a.right + GAP_PX
			top = a.top + a.height / 2 - t.height / 2
		} else {
			left = a.left + a.width / 2 - t.width / 2
			top = side === 'top' ? a.top - t.height - GAP_PX : a.bottom + GAP_PX
		}

		setPos({
			left: clamp(left, EDGE_MARGIN, window.innerWidth - t.width - EDGE_MARGIN),
			top: clamp(top, EDGE_MARGIN, window.innerHeight - t.height - EDGE_MARGIN),
		})
	}, [open, side, label, wrap])

	if (!label) return <>{children}</>

	return (
		<span ref={anchorRef} className={`tip-anchor ${className ?? ''}`} {...triggerProps}>
			{children}
			{open &&
				createPortal(
					<span
						ref={tipRef}
						className={`tooltip tooltip_fixed ${wrap ? 'tooltip_wrap' : ''}`}
						role="tooltip"
						// the side decides which edge it grows from; see .tooltip_fixed
						data-side={side}
						data-instant={instant || undefined}
						// hidden for the one frame it takes to measure, never at 0,0
						style={
							pos
								? { left: pos.left, top: pos.top }
								: { left: 0, top: 0, visibility: 'hidden' }
						}
					>
						{label}
					</span>,
					document.body
				)}
		</span>
	)
}
