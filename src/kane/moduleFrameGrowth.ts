import { Box, Editor, TLFrameShape, TLShapeId } from 'tldraw'
import { FRAME_PADDING } from './graphOps'

/**
 * A module frame grows to keep its cards inside it.
 *
 * A card gets taller when a run opens its Screenshot panel, or when its fields
 * grow, and a frame clips whatever hangs past its edge. Without this, every
 * run of a module cut the cards' new panels off at the frame's bottom.
 *
 * It only ever grows, to the right and down: a frame never shrinks or moves on
 * its own, so nothing the user arranged shifts. Fit module (the frame's
 * context menu) still tightens it on request.
 */
export function installModuleFrameGrowth(editor: Editor) {
	let pending = new Set<TLShapeId>()

	editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
		if (source === 'remote') return
		if (next.type !== 'node') return
		if (prev.props === next.props && prev.x === next.x && prev.y === next.y) return
		const parent = editor.getShape(next.parentId as TLShapeId)
		if (parent?.type === 'frame') pending.add(parent.id)
	})

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pending.size === 0) return
		const frames = pending
		pending = new Set()
		for (const id of frames) growFrameToFit(editor, id)
	})

	// Canvases saved before this existed can already be clipping cards whose
	// panels a run opened; make room once on load, outside the undo history.
	editor.run(
		() => {
			for (const shape of editor.getCurrentPageShapes()) {
				if (shape.type === 'frame') growFrameToFit(editor, shape.id)
			}
		},
		{ history: 'ignore' }
	)
}

function growFrameToFit(editor: Editor, frameId: TLShapeId) {
	const frame = editor.getShape<TLFrameShape>(frameId)
	if (!frame || frame.type !== 'frame') return

	// The cards' boxes in the frame's own space (a child's x and y are already
	// relative to its parent; the geometry includes any open panel).
	let content: Box | null = null
	for (const childId of editor.getSortedChildIdsForParent(frameId)) {
		const child = editor.getShape(childId)
		if (!child || child.type !== 'node') continue
		const { bounds } = editor.getShapeGeometry(child)
		const box = new Box(child.x + bounds.x, child.y + bounds.y, bounds.w, bounds.h)
		content = content ? content.union(box) : box
	}
	if (!content) return

	const w = Math.max(frame.props.w, content.maxX + FRAME_PADDING)
	const h = Math.max(frame.props.h, content.maxY + FRAME_PADDING)
	if (w === frame.props.w && h === frame.props.h) return
	editor.updateShape<TLFrameShape>({ id: frameId, type: 'frame', props: { w, h } })
}
