import { AnnotationPopupCSS, getElementClasses, identifyElement } from 'agentation'
import { GripVertical } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createShapeId } from 'tldraw'
import { createNodeShape } from '../graphOps'
import { useKaneApp } from '../KaneAppContext'

/**
 * The Inspector's popup: what was picked, and what you want done with it.
 *
 * Agentation supplies the popup itself — the element header, the collapsible
 * properties list and the prompt textarea — plus the element-identification
 * helpers. Its bundled toolbar is deliberately not mounted: this app already has
 * its own chrome, and the toolbar's activate-then-click flow duplicates the
 * Inspector button. Importing `AnnotationPopupCSS` and the helpers directly
 * takes the behaviour without the UI.
 *
 * The picked element lives inside the mock page's iframe. That iframe is
 * `srcdoc`, so it shares this document's origin and the helpers can be run
 * against the real element rather than a description of it — the page marks the
 * pick with `data-kane-picked` and this looks it up.
 */

export interface ElementPick {
	text: string
	/** Whether the element owns text of its own, so type properties mean something. */
	hasText: boolean
	label: string
	tag: string
	role: string
	selector: string
	xpath: string
	classes: string
	fontFamily: string
	fontSize: string
	fontWeight: string
	lineHeight: string
	letterSpacing: string
	color: string
	background: string
	textAlign: string
	textTransform: string
	display: string
	width: number
	height: number
	rect: { x: number; y: number; w: number; h: number }
}

/**
 * Turn a CSS colour into the hex most people expect to read. A fully
 * transparent colour is reported as such rather than as #000000 — every
 * unstyled background is rgba(0,0,0,0), and calling that "black" is a lie.
 */
function toHex(color: string) {
	const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
	if (!m) return color
	if (m[4] !== undefined && Number(m[4]) === 0) return 'transparent'
	const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
	return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}

/**
 * Room to keep between the popup and the edges of the viewport it sits in, and
 * the popup's own measured size. Agentation's popup is `position: fixed` and
 * centres itself horizontally on the `left` it is given, so the coordinates
 * below are viewport coordinates of the element's centre — not offsets inside
 * the browser pane.
 */
const EDGE = 12
const POPUP_W = 280

/** The drag grip in the popup's top-right corner, and its inset from both edges. */
const GRIP_SIZE_PX = 20
const GRIP_INSET_PX = 6
/**
 * A first guess at the height, used only to decide whether the popup goes above
 * or below the element. The properties list opens by default and its length
 * depends on the element, so the real height is measured after mount and the
 * position corrected — see the layout effect below.
 */
const POPUP_H = 300

export function InspectorPopup({
	pick,
	iframeRef,
	hostRef,
	onClose,
}: {
	pick: ElementPick
	/** Refs rather than elements: read at layout time, never captured stale. */
	iframeRef: React.RefObject<HTMLIFrameElement | null>
	hostRef: React.RefObject<HTMLElement | null>
	onClose: () => void
}) {
	const { editor, pushToast } = useKaneApp()

	/**
	 * Agentation's own read of the element, taken from the live node inside the
	 * iframe. Falls back to what the page reported if the element has since gone.
	 */
	const identity = useMemo(() => {
		const el = iframeRef.current?.contentDocument?.querySelector(
			'[data-kane-picked]'
		) as HTMLElement | null
		if (!el) return { name: pick.label || pick.tag, path: pick.selector, classes: pick.classes }
		const { name, path } = identifyElement(el)
		// For anything without text of its own — a toggle, a swatch, an icon —
		// agentation falls back to the bare tag name, which makes for a card
		// called "span". The page's own label (aria-label, placeholder, alt)
		// says what the thing actually is, so it wins in that case.
		const bare = name.trim().toLowerCase() === pick.tag
		return {
			name: bare && pick.label ? pick.label : name,
			path,
			classes: getElementClasses(el) || pick.classes,
		}
		// the pick changes whenever a new element is chosen, which is the only
		// time this needs recomputing
	}, [pick, iframeRef])

	/**
	 * The properties agentation renders in its collapsible section. Type metrics
	 * are only included for elements that actually own text — font size on a
	 * layout wrapper describes nothing.
	 */
	const computedStyles = useMemo(() => {
		const base: Record<string, string> = {
			element: pick.tag + (pick.role ? ` [role=${pick.role}]` : ''),
			size: `${pick.width} × ${pick.height}`,
			display: pick.display,
			background: toHex(pick.background),
		}
		if (pick.classes) base.class = pick.classes
		if (pick.hasText) {
			Object.assign(base, {
				font: pick.fontFamily,
				'font-size': pick.fontSize,
				'font-weight': pick.fontWeight,
				'line-height': pick.lineHeight,
				'letter-spacing': pick.letterSpacing,
				'text-align': pick.textAlign,
				'text-transform': pick.textTransform,
				color: toHex(pick.color),
			})
		}
		base.xpath = pick.xpath
		return base
	}, [pick])

	/** Anchor the popup under the element, kept inside the browser viewport. */
	const anchor = useMemo(() => {
		const frame = iframeRef.current?.getBoundingClientRect()
		const box = hostRef.current?.getBoundingClientRect()
		if (!frame || !box) return { left: 0, top: 0 }
		const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

		// `left` is where the popup's centre goes, because it translates itself
		// back by half its width
		const half = POPUP_W / 2
		const left = clamp(
			frame.left + pick.rect.x + pick.rect.w / 2,
			box.left + half + EDGE,
			box.right - half - EDGE
		)

		// under the element, or above it when the bottom of the pane is closer
		let top = frame.top + pick.rect.y + pick.rect.h + 10
		if (top + POPUP_H > box.bottom - EDGE) {
			top = frame.top + pick.rect.y - POPUP_H - 10
		}
		// A pane shorter than the popup has no position that satisfies both
		// edges; keeping it under the element and inside the window beats
		// pinning it to a top edge it will overflow anyway.
		const lo = box.top + EDGE
		const hi = box.bottom - POPUP_H - EDGE
		if (hi < lo) return { left, top: clamp(top, EDGE, window.innerHeight - POPUP_H - EDGE) }
		return { left, top: clamp(top, lo, hi) }
	}, [pick, iframeRef, hostRef])

	/**
	 * Where the popup has been dragged to, if anywhere.
	 *
	 * The popup lands over the element it describes, which is exactly the thing
	 * it then covers — so it can be moved out of the way. Only `left`/`top` are
	 * written, never `transform`: the popup's own enter and shake animations own
	 * that property, and a drag written into it would be wiped by the next
	 * keyframe.
	 */
	const [moved, setMoved] = useState<{ left: number; top: number } | null>(null)
	const style = moved ?? anchor

	const hostElRef = useRef<HTMLDivElement>(null)

	/**
	 * Two things happen as a pick arrives.
	 *
	 * Agentation's popup opens its properties list collapsed and offers no prop
	 * to change that, so its header toggle is clicked once — a real click on the
	 * library's own control, so the section animates open the way it would if you
	 * had opened it, and the toggle keeps working afterwards.
	 *
	 * That makes the popup much taller than the estimate the anchor was placed
	 * with, so once the section has finished opening the popup is measured and
	 * nudged up if it now hangs out of the pane. Measuring beats guessing: the
	 * height depends on how many properties the element turned out to have.
	 */
	useLayoutEffect(() => {
		// a new pick is a new subject, so it goes back over its own element
		setMoved(null)
		const toggle = hostElRef.current?.querySelector<HTMLButtonElement>(
			'[data-annotation-popup] button'
		)
		toggle?.click()

		const id = window.setTimeout(() => {
			const box = hostElRef.current?.querySelector<HTMLElement>('[data-annotation-popup]')
			const pane = hostRef.current?.getBoundingClientRect()
			if (!box || !pane) return
			const rect = box.getBoundingClientRect()
			const below = rect.bottom - (pane.bottom - EDGE)
			if (below <= 0) return
			const room = rect.top - (pane.top + EDGE)
			const shift = Math.min(below, Math.max(0, room))
			if (shift > 0) setMoved({ left: anchor.left, top: anchor.top - shift })
		}, 340)
		return () => window.clearTimeout(id)
	}, [pick, anchor, hostRef])

	/**
	 * The drag handle, and only the drag handle.
	 *
	 * Making the whole popup a handle cost the thing it exists for: the
	 * properties are there to be read, selected and pasted into a locator, and a
	 * pointer-down anywhere that might turn into a drag never lets a selection
	 * start. So the popup is ordinary text again and one small grip moves it.
	 *
	 * `preventDefault` on the grip stops the drag itself from selecting the text
	 * it passes over.
	 */
	const startDrag = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault()
			e.stopPropagation()
			const from = { x: e.clientX, y: e.clientY, left: style.left, top: style.top }
			const onMove = (ev: PointerEvent) => {
				setMoved({
					left: from.left + (ev.clientX - from.x),
					top: from.top + (ev.clientY - from.y),
				})
			}
			const onUp = () => {
				window.removeEventListener('pointermove', onMove)
				window.removeEventListener('pointerup', onUp)
				window.removeEventListener('pointercancel', onUp)
			}
			window.addEventListener('pointermove', onMove)
			window.addEventListener('pointerup', onUp)
			window.addEventListener('pointercancel', onUp)
		},
		[style]
	)

	/** Turn the prompt into a card carrying the element it was written against. */
	const addCard = (text: string) => {
		const prompt = text.trim()
		if (!prompt || !editor) return
		createNodeShape(editor, createShapeId(), editor.getViewportPageBounds().center, {
			type: 'ai',
			prompt,
			element: identity.name,
			xpath: pick.xpath,
			selector: identity.path || pick.selector,
			lastResult: null,
		} as never)
		pushToast(`AI step added for “${identity.name}”`, 'success')
		onClose()
	}

	return (
		<div className="inspector-popup-host" ref={hostElRef}>
			{/* The popup is `position: fixed`, centred on `style.left` and starting
			    at `style.top` — so the grip's place in the top-right corner is
			    arithmetic, not a measurement that could be taken mid-animation. */}
			<span
				className="inspector-grip"
				role="button"
				tabIndex={0}
				aria-label="Drag to move this panel"
				title="Drag to move"
				style={{
					left: style.left + POPUP_W / 2 - GRIP_INSET_PX - GRIP_SIZE_PX,
					top: style.top + GRIP_INSET_PX,
					width: GRIP_SIZE_PX,
					height: GRIP_SIZE_PX,
				}}
				onPointerDown={startDrag}
			>
				<GripVertical size={14} />
			</span>
			<AnnotationPopupCSS
				element={identity.name}
				selectedText={pick.hasText ? pick.text.slice(0, 160) : undefined}
				placeholder="What should this step do with this element?"
				submitLabel="Add card"
				computedStyles={computedStyles}
				accentColor="#0a69da"
				lightMode
				style={style}
				onSubmit={addCard}
				onCancel={onClose}
			/>
		</div>
	)
}
