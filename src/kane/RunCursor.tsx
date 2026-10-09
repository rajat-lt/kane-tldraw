import { GripVertical, Play, Square } from 'lucide-react'
import { useRef } from 'react'
import { Editor, TLShapeId, useEditor, useQuickReactor, useValue } from 'tldraw'
import { executionState, startExecution, stopExecution } from '../execution/executionState'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { EditorAtom } from '../utils'
import { isInWorkflow } from './workflowRules'
import { kaneToast } from './uiState'

/**
 * The run cursor — a Figma-prototype-style label docked to the top-left edge
 * of a card. It marks where a run starts: press its play button to run from
 * that card, or drag it onto another card to move the starting point. While a
 * workflow is running it follows the card currently being executed.
 */

export const runCursorState = new EditorAtom<{ shapeId: TLShapeId | null }>(
	'run cursor',
	() => ({ shapeId: null })
)

function isNodeShape(editor: Editor, id: TLShapeId): boolean {
	const shape = editor.getShape(id)
	return !!shape && editor.isShapeOfType<NodeShape>(shape, 'node')
}

/**
 * The card the Run label is currently sitting on: the user's choice if it is
 * still part of a workflow, otherwise the first workflow card with no incoming
 * connection. Shared with the topbar's "Run steps" button so both start from
 * exactly the same place.
 */
export function getRunCursorTarget(editor: Editor): TLShapeId | null {
	const chosen = runCursorState.get(editor).shapeId
	if (chosen && isNodeShape(editor, chosen) && isInWorkflow(editor, chosen)) return chosen
	const starting = editor
		.getCurrentPageShapes()
		.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
		.filter((s) => getNodePortConnections(editor, s).length > 0)
		.find((s) => !getNodePortConnections(editor, s).some((c) => c.terminal === 'end'))
	return starting?.id ?? null
}

/** Pin the run cursor to a specific card (used by the card context menu). */
export function setRunCursorTo(editor: ReturnType<typeof useEditor>, id: TLShapeId) {
	runCursorState.set(editor, { shapeId: id })
}

export function RunCursor() {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	const drag = useRef<{ pointerId: number; moved: boolean } | null>(null)

	// Cards that aren't connected to anything can't hold the Run label.
	const attachedId = useValue('run cursor attached', () => getRunCursorTarget(editor), [editor])

	const runningId = useValue(
		'run cursor running id',
		() => executionState.get(editor).runningGraph?.currentExecuting.get() ?? null,
		[editor]
	)
	const isRunning = useValue(
		'run cursor is running',
		() => executionState.get(editor).runningGraph !== null,
		[editor]
	)

	const targetId = (isRunning ? (runningId ?? attachedId) : attachedId) ?? null

	// Track the card's top-left corner in viewport space.
	useQuickReactor(
		'run cursor position',
		() => {
			const el = ref.current
			if (!el) return
			if (drag.current?.moved) return // while dragging, the pointer drives position
			if (!targetId) {
				el.style.display = 'none'
				return
			}
			const bounds = editor.getShapePageBounds(targetId)
			if (!bounds) {
				el.style.display = 'none'
				return
			}
			el.style.display = 'flex'
			const point = editor.pageToViewport({ x: bounds.x, y: bounds.y })
			el.style.transform = `translate(${point.x}px, ${point.y - 34}px)`
			el.dataset.moving = editor.getCameraState() === 'moving' ? 'true' : 'false'
		},
		[editor, targetId]
	)

	function onPointerDown(e: React.PointerEvent) {
		editor.markEventAsHandled(e)
		if (isRunning) return
		if ((e.target as HTMLElement).closest('.RunCursor-play')) return
		e.stopPropagation()
		e.preventDefault()
		drag.current = { pointerId: e.pointerId, moved: false }

		const onMove = (ev: PointerEvent) => {
			if (!drag.current || !ref.current) return
			drag.current.moved = true
			const host = ref.current.offsetParent as HTMLElement | null
			const rect = host?.getBoundingClientRect()
			const x = ev.clientX - (rect?.left ?? 0)
			const y = ev.clientY - (rect?.top ?? 0)
			ref.current.style.transform = `translate(${x - 40}px, ${y - 14}px)`
			ref.current.classList.add('RunCursor_dragging')
		}
		const onUp = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			const wasDragged = drag.current?.moved
			drag.current = null
			ref.current?.classList.remove('RunCursor_dragging')
			if (!wasDragged) return
			const pagePoint = editor.screenToPage({ x: ev.clientX, y: ev.clientY })
			const hit = editor.getShapeAtPoint(pagePoint, { hitInside: true, margin: 8 })
			let dropId = hit && editor.isShapeOfType<NodeShape>(hit, 'node') ? hit.id : null
			if (dropId && !isInWorkflow(editor, dropId)) {
				kaneToast('The Run label can only sit on a card that’s part of the workflow', 'error')
				dropId = null
			}
			if (dropId) {
				runCursorState.set(editor, { shapeId: dropId })
			}
			// reposition onto the (possibly new) attached card
			const el = ref.current
			const snapTo = dropId ?? targetId
			if (el && snapTo) {
				const bounds = editor.getShapePageBounds(snapTo)
				if (bounds) {
					const point = editor.pageToViewport({ x: bounds.x, y: bounds.y })
					el.style.transform = `translate(${point.x}px, ${point.y - 34}px)`
				}
			}
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	function onPlayClick() {
		if (isRunning) {
			stopExecution(editor)
			return
		}
		if (!attachedId) return
		startExecution(editor, new Set([attachedId]))
	}

	return (
		<div
			ref={ref}
			className={`RunCursor ${isRunning ? 'RunCursor_running' : ''}`}
			onPointerDown={onPointerDown}
		>
			<span className="RunCursor-grip">
				<GripVertical size={12} />
			</span>
			<button
				className="RunCursor-play"
				title={isRunning ? 'Stop the run' : 'Run from this card'}
				onPointerDown={(e) => {
					editor.markEventAsHandled(e)
					e.stopPropagation()
				}}
				onClick={onPlayClick}
			>
				{isRunning ? (
					<Square size={10} fill="currentColor" />
				) : (
					/* A triangle's centroid sits left of its bounding-box centre — for
					   lucide's Play (6,3 → 20,12 → 6,21) that's 1.33 of 24 units, so
					   0.6px at this size puts it optically centred in the circle. */
					<Play size={11} fill="currentColor" style={{ marginLeft: 0.6 }} />
				)}
			</button>
			<span className="RunCursor-label">{isRunning ? 'Running…' : 'Run'}</span>
		</div>
	)
}
