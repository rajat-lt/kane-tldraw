import { Copy, Layers, Maximize2, Pencil, Play, Settings, Square, Trash2 } from 'lucide-react'
import {
	Box,
	fitFrameToContent,
	TldrawUiContextualToolbar,
	TldrawUiToolbarButton,
	TLFrameShape,
	track,
	useEditor,
} from 'tldraw'
import { executionState, startExecution, stopExecution } from '../execution/executionState'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { CardBaseFields } from '../nodes/types/cardBase'
import { updateNode } from '../nodes/types/shared'

/**
 * Contextual toolbar — appears above the selected card.
 *
 * It holds the things done *to* a card: duplicate it, delete it, open its
 * settings. Running the step and handing it back to the AI are things the card
 * itself does, and they live in its header now; the per-type controls that used
 * to be here (click type, iteration count, add-else-if) are on the cards, where
 * they can be read without selecting anything.
 */

export const KaneContextualToolbar = track(function KaneContextualToolbar() {
	const editor = useEditor()
	const showToolbar = editor.isIn('select.idle')
	const only = editor.getOnlySelectedShape()
	if (!showToolbar || !only) return null

	const isNode = editor.isShapeOfType<NodeShape>(only, 'node')
	const isFrame = editor.isShapeOfType<TLFrameShape>(only, 'frame')
	if (!isNode && !isFrame) return null

	const getSelectionBounds = () => {
		const fullBounds = editor.getSelectionRotatedScreenBounds()
		if (!fullBounds) return undefined
		return new Box(fullBounds.x, fullBounds.y, fullBounds.width, 0)
	}

	return (
		<TldrawUiContextualToolbar getSelectionBounds={getSelectionBounds} label="Card actions">
			{isNode ? <NodeControls shape={only as NodeShape} /> : null}
			{isFrame ? <ModuleControls shape={only as TLFrameShape} /> : null}
		</TldrawUiContextualToolbar>
	)
})

function NodeControls({ shape }: { shape: NodeShape }) {
	const editor = useEditor()
	const node = shape.props.node as CardBaseFields
	const settingsOpen = node.panel === 'settings'

	return (
		<>
			<TldrawUiToolbarButton
				type="icon"
				title={settingsOpen ? 'Hide settings' : 'Settings'}
				isActive={settingsOpen}
				onClick={() =>
					updateNode(
						editor,
						shape,
						(n) =>
							({
								...(n as object),
								// toggling off closes the panel entirely, rather than
								// dropping back to a tab the card may not have
								panel: settingsOpen ? null : 'settings',
							}) as never,
						false
					)
				}
			>
				<Settings size={14} />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="icon"
				title="Duplicate"
				onClick={() => {
					editor.markHistoryStoppingPoint('duplicate card')
					editor.duplicateShapes([shape.id])
				}}
			>
				<Copy size={14} />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="icon"
				title="Delete card"
				onClick={() => {
					editor.markHistoryStoppingPoint('delete card')
					editor.deleteShapes([shape.id])
				}}
			>
				<Trash2 size={14} />
			</TldrawUiToolbarButton>
		</>
	)
}

function ModuleControls({ shape }: { shape: TLFrameShape }) {
	const editor = useEditor()
	const isRunning = executionState.get(editor).runningGraph !== null

	const runModule = () => {
		if (isRunning) {
			stopExecution(editor)
			return
		}
		const children = editor
			.getSortedChildIdsForParent(shape.id)
			.map((id) => editor.getShape(id))
			.filter((s): s is NodeShape => !!s && editor.isShapeOfType<NodeShape>(s, 'node'))
		const starting = children.filter(
			(s) => !getNodePortConnections(editor, s).some((c) => c.terminal === 'end')
		)
		if (starting.length === 0) return
		startExecution(editor, new Set(starting.map((s) => s.id)))
	}

	return (
		<>
			<span className="ctxbar-module-name">
				<Layers size={13} />
				{shape.props.name || 'Module'}
			</span>
			<TldrawUiToolbarButton
				type="icon"
				title={isRunning ? 'Stop run' : 'Run module'}
				onClick={runModule}
			>
				{isRunning ? <Square size={14} /> : <Play size={14} />}
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="icon"
				title="Rename module"
				onClick={() => editor.setEditingShape(shape.id)}
			>
				<Pencil size={14} />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="icon"
				title="Fit to content"
				onClick={() => fitFrameToContent(editor, shape.id, { padding: 40 })}
			>
				<Maximize2 size={14} />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="icon"
				title="Delete module (keeps cards)"
				onClick={() => {
					editor.markHistoryStoppingPoint('remove module frame')
					const children = editor.getSortedChildIdsForParent(shape.id)
					editor.reparentShapes(children, editor.getCurrentPageId())
					editor.deleteShapes([shape.id])
				}}
			>
				<Trash2 size={14} />
			</TldrawUiToolbarButton>
		</>
	)
}
