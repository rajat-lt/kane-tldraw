import { useRef } from 'react'
import { useEditor, useValue } from 'tldraw'

/**
 * Minimap — bottom-right, carried over from the previous Kane build:
 * translucent panel showing card/frame rectangles and a draggable viewport
 * rectangle that pans the tldraw camera.
 */

const MM_W = 180
const MM_H = 120
const PAD = 240

export function KaneMinimap() {
	const editor = useEditor()
	const drag = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null)

	const items = useValue(
		'minimap items',
		() =>
			editor
				.getCurrentPageShapes()
				.filter((s) => s.type === 'node' || s.type === 'frame')
				.map((s) => {
					const b = editor.getShapePageBounds(s.id)
					return b
						? { x: b.x, y: b.y, w: b.w, h: b.h, kind: s.type as 'node' | 'frame' }
						: null
				})
				.filter((b): b is NonNullable<typeof b> => b !== null),
		[editor]
	)

	const viewport = useValue('minimap viewport', () => editor.getViewportPageBounds(), [editor])
	const camera = useValue('minimap camera', () => editor.getCamera(), [editor])

	// World = union of content and viewport, padded.
	let minX = viewport.x
	let minY = viewport.y
	let maxX = viewport.x + viewport.w
	let maxY = viewport.y + viewport.h
	for (const it of items) {
		minX = Math.min(minX, it.x)
		minY = Math.min(minY, it.y)
		maxX = Math.max(maxX, it.x + it.w)
		maxY = Math.max(maxY, it.y + it.h)
	}
	minX -= PAD
	minY -= PAD
	maxX += PAD
	maxY += PAD

	const scale = Math.min(MM_W / (maxX - minX), MM_H / (maxY - minY))
	const offX = (MM_W - (maxX - minX) * scale) / 2
	const offY = (MM_H - (maxY - minY) * scale) / 2
	const toMM = (x: number, y: number) => ({
		x: offX + (x - minX) * scale,
		y: offY + (y - minY) * scale,
	})

	const vr = toMM(viewport.x, viewport.y)

	function onRectDown(e: React.PointerEvent) {
		e.stopPropagation()
		e.currentTarget.setPointerCapture(e.pointerId)
		drag.current = { sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y }
	}
	function onRectMove(e: React.PointerEvent) {
		if (!drag.current) return
		const dWorldX = (e.clientX - drag.current.sx) / scale
		const dWorldY = (e.clientY - drag.current.sy) / scale
		editor.setCamera({
			x: drag.current.cx - dWorldX,
			y: drag.current.cy - dWorldY,
			z: camera.z,
		})
	}
	function onRectUp(e: React.PointerEvent) {
		drag.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
	}

	function onBackgroundClick(e: React.MouseEvent<HTMLDivElement>) {
		const rect = e.currentTarget.getBoundingClientRect()
		const mx = e.clientX - rect.left
		const my = e.clientY - rect.top
		const pageX = minX + (mx - offX) / scale
		const pageY = minY + (my - offY) / scale
		editor.centerOnPoint({ x: pageX, y: pageY }, { animation: { duration: 180 } })
	}

	return (
		<div className="kane-minimap" onClick={onBackgroundClick}>
			{items.map((it, i) => {
				const p = toMM(it.x, it.y)
				return (
					<div
						key={i}
						className={`kane-minimap-node ${it.kind === 'frame' ? 'kane-minimap-frame' : ''}`}
						style={{
							left: p.x,
							top: p.y,
							width: Math.max(3, it.w * scale),
							height: Math.max(2, it.h * scale),
						}}
					/>
				)
			})}
			<div
				className="kane-minimap-view"
				style={{
					left: vr.x,
					top: vr.y,
					width: viewport.w * scale,
					height: viewport.h * scale,
				}}
				onPointerDown={onRectDown}
				onPointerMove={onRectMove}
				onPointerUp={onRectUp}
				onClick={(e) => e.stopPropagation()}
			/>
		</div>
	)
}
