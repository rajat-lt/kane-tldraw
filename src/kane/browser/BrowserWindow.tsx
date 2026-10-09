import { Globe, X } from 'lucide-react'
import { memo, useCallback, useRef, useState } from 'react'
import { useKaneApp } from '../KaneAppContext'
import { BrowserSurface } from './BrowserChrome'

/**
 * Popped-out browser — a floating sub-window over the canvas (like Figma's
 * prototype preview window): draggable by its title bar, resizable from the
 * bottom-right corner, dockable back into the split view.
 *
 * The drag never goes through React. Committing a position on every pointermove
 * re-rendered the whole browser surface — sub-topbar, tab strip, iframe — sixty
 * times a second, and `left`/`top` made each of those a full layout pass. The
 * pointer handlers now write straight to the element and state is committed once,
 * on release.
 *
 * Position rides on the `translate` property rather than `transform`, because
 * the `window-in` entrance animates `transform` and would otherwise override the
 * placement for its first 240ms.
 */

const MIN_W = 520
const MIN_H = 400

/**
 * The surface below the title bar takes no props that change while dragging, so
 * it is held still across the position commit.
 */
const StaticSurface = memo(function StaticSurface() {
	return <BrowserSurface variant="window" />
})

export function BrowserWindow() {
	const { setBrowserView, url } = useKaneApp()
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
	const [size, setSize] = useState({ w: 860, h: 620 })
	const winRef = useRef<HTMLDivElement>(null)

	/**
	 * Live drag/resize state. Bounds are read once, at the start of the gesture:
	 * reading `clientWidth` on every move forces a layout the drag doesn't need.
	 */
	const drag = useRef<{
		sx: number
		sy: number
		ox: number
		oy: number
		hostW: number
		hostH: number
		x: number
		y: number
	} | null>(null)
	const resize = useRef<{ sx: number; sy: number; ow: number; oh: number; w: number; h: number } | null>(
		null
	)

	const hostBounds = useCallback(() => {
		const host = winRef.current?.offsetParent as HTMLElement | null
		return host
			? { w: host.clientWidth, h: host.clientHeight }
			: { w: window.innerWidth, h: window.innerHeight }
	}, [])

	const defaultPos = () => {
		const host = winRef.current?.offsetParent as HTMLElement | null
		const w = host ? host.clientWidth : window.innerWidth
		return { x: Math.max(16, w - size.w - 24), y: 20 }
	}
	const effectivePos = pos ?? defaultPos()

	// ---- drag ---------------------------------------------------------------
	function onDragStart(e: React.PointerEvent) {
		if ((e.target as HTMLElement).closest('button')) return
		e.currentTarget.setPointerCapture(e.pointerId)
		const { w, h } = hostBounds()
		drag.current = {
			sx: e.clientX,
			sy: e.clientY,
			ox: effectivePos.x,
			oy: effectivePos.y,
			hostW: w,
			hostH: h,
			x: effectivePos.x,
			y: effectivePos.y,
		}
		winRef.current?.classList.add('is-dragging')
	}

	function onDragMove(e: React.PointerEvent) {
		const d = drag.current
		const el = winRef.current
		if (!d || !el) return
		// keep a grabbable strip of the window on screen in every direction
		d.x = Math.min(Math.max(-size.w + 120, d.ox + e.clientX - d.sx), d.hostW - 120)
		d.y = Math.min(Math.max(0, d.oy + e.clientY - d.sy), d.hostH - 48)
		el.style.translate = `${d.x}px ${d.y}px`
	}

	function onDragEnd(e: React.PointerEvent) {
		const d = drag.current
		drag.current = null
		winRef.current?.classList.remove('is-dragging')
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// the pointer may already be gone
		}
		if (d) setPos({ x: d.x, y: d.y })
	}

	// ---- resize -------------------------------------------------------------
	function onResizeStart(e: React.PointerEvent) {
		e.stopPropagation()
		e.currentTarget.setPointerCapture(e.pointerId)
		resize.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h, w: size.w, h: size.h }
		winRef.current?.classList.add('is-dragging')
	}

	function onResizeMove(e: React.PointerEvent) {
		const r = resize.current
		const el = winRef.current
		if (!r || !el) return
		r.w = Math.max(MIN_W, r.ow + e.clientX - r.sx)
		r.h = Math.max(MIN_H, r.oh + e.clientY - r.sy)
		el.style.width = `${r.w}px`
		el.style.height = `${r.h}px`
	}

	function onResizeEnd(e: React.PointerEvent) {
		const r = resize.current
		resize.current = null
		winRef.current?.classList.remove('is-dragging')
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// the pointer may already be gone
		}
		if (r) setSize({ w: r.w, h: r.h })
	}

	return (
		<div
			ref={winRef}
			className="browser-window"
			style={{
				translate: `${effectivePos.x}px ${effectivePos.y}px`,
				width: size.w,
				height: size.h,
			}}
		>
			<div
				className="browser-window-titlebar"
				onPointerDown={onDragStart}
				onPointerMove={onDragMove}
				onPointerUp={onDragEnd}
				onPointerCancel={onDragEnd}
			>
				<Globe size={13} />
				<span className="browser-window-title">Browser preview — {url.split('/')[0]}</span>
				<span className="browser-window-spacer" />
				<button
					className="icon-btn"
					onClick={() => setBrowserView('closed')}
					aria-label="Close browser window"
				>
					<X size={15} />
				</button>
			</div>
			<StaticSurface />
			<div
				className="browser-window-resize"
				onPointerDown={onResizeStart}
				onPointerMove={onResizeMove}
				onPointerUp={onResizeEnd}
				onPointerCancel={onResizeEnd}
			/>
		</div>
	)
}
