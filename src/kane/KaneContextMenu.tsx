import {
	ArrangeMenuSubmenu,
	ClipboardMenuGroup,
	DefaultContextMenu,
	EditMenuSubmenu,
	ReorderMenuSubmenu,
	SelectAllMenuItem,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TLFrameShape,
	TLUiContextMenuProps,
	fitFrameToContent,
	useEditor,
	useValue,
} from 'tldraw'
import { startExecution } from '../execution/executionState'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { renameState } from './uiState'
import { ClickNode } from '../nodes/types/ClickNode'
import {
	addElseIfBlock,
	canAddElseIf,
	IfElseNode,
	removeElseIfBlock,
} from '../nodes/types/IfElseNode'
import { InputNode } from '../nodes/types/InputNode'
import { toggleConditionMode, updateNode } from '../nodes/types/shared'
import { WhileNode } from '../nodes/types/WhileNode'
import { setRunCursorTo } from './RunCursor'

/**
 * Custom context menu (the browser's native menu is disabled on the canvas):
 * right-clicking a card shows the operations for that specific card; frames
 * get module operations; empty canvas falls back to tldraw's default menu.
 */

export function KaneContextMenu(props: TLUiContextMenuProps) {
	const editor = useEditor()

	// Selection is the primary target; when nothing is selected (e.g.
	// right-clicking a module frame's interior, which tldraw doesn't hit-test),
	// fall back to whatever card/frame is under the pointer.
	const target = useValue(
		'ctx target',
		() => {
			const only = editor.getOnlySelectedShape()
			if (only) return only
			const point = editor.inputs.getCurrentPagePoint()
			const hit = editor.getShapeAtPoint(point, {
				hitInside: true,
				margin: 8,
			})
			if (hit) return hit
			// frames don't hit-test their interior — check them explicitly
			const frame = editor
				.getCurrentPageShapes()
				.filter((s): s is TLFrameShape => editor.isShapeOfType<TLFrameShape>(s, 'frame'))
				.find((f) => {
					const bounds = editor.getShapePageBounds(f.id)
					return bounds?.containsPoint(point)
				})
			return frame ?? null
		},
		[editor]
	)

	const isNode = !!target && editor.isShapeOfType<NodeShape>(target, 'node')
	const isFrame = !!target && editor.isShapeOfType<TLFrameShape>(target, 'frame')

	return (
		<DefaultContextMenu {...props}>
			{isNode ? (
				<NodeMenuContent shape={target as NodeShape} />
			) : isFrame ? (
				<FrameMenuContent shape={target as TLFrameShape} />
			) : (
				<CanvasMenuContent />
			)}
		</DefaultContextMenu>
	)
}

/**
 * The empty-canvas menu: tldraw's default, minus the conversions group.
 *
 * That group is "Copy as" / "Export as" — SVG, PNG, JSON of the drawing. A Kane
 * canvas is a test workflow: it is exported as runnable code from the Code
 * panel, not as a picture, so those entries only ever produced the wrong kind
 * of file. Rebuilt from the same exported pieces rather than hidden with CSS,
 * so the remaining items keep their real behaviour.
 *
 * "Download original" rides in the same group and goes with it; it only applies
 * to image and video shapes, which this canvas has none of.
 */
function CanvasMenuContent() {
	return (
		<>
			<TldrawUiMenuGroup id="modify">
				<EditMenuSubmenu />
				<ArrangeMenuSubmenu />
				<ReorderMenuSubmenu />
			</TldrawUiMenuGroup>
			<ClipboardMenuGroup />
			<TldrawUiMenuGroup id="select-all">
				<SelectAllMenuItem />
			</TldrawUiMenuGroup>
		</>
	)
}

function NodeMenuContent({ shape }: { shape: NodeShape }) {
	const editor = useEditor()
	const node = shape.props.node as { type: string }
	const definition = getNodeDefinition(editor, shape.props.node)
	const props = shape.props.node as Record<string, unknown>
	const defaults = definition.getDefault() as Record<string, unknown>
	const hasResult = definition.resultKeys?.some((key) => props[key] !== defaults[key]) ?? false

	return (
		<>
			<TldrawUiMenuGroup id="kane-run">
				<TldrawUiMenuItem
					id="run-from-here"
					label="Run from this card"
					onSelect={() => startExecution(editor, new Set([shape.id]))}
				/>
				<TldrawUiMenuItem
					id="set-run-start"
					label="Set run start here"
					onSelect={() => setRunCursorTo(editor, shape.id)}
				/>
			</TldrawUiMenuGroup>
			<TypeSpecificItems shape={shape} kind={node.type} />
			<TldrawUiMenuGroup id="kane-edit">
				<TldrawUiMenuItem
					id="rename-card"
					label="Rename card"
					onSelect={() => {
						editor.setSelectedShapes([shape.id])
						renameState.set(editor, shape.id)
					}}
				/>
				<TldrawUiMenuItem
					id="duplicate-card"
					label="Duplicate"
					onSelect={() => {
						editor.markHistoryStoppingPoint('duplicate card')
						editor.duplicateShapes([shape.id])
					}}
				/>
				{hasResult && (
					<TldrawUiMenuItem
						id="clear-result"
						label="Clear last result"
						onSelect={() => {
							const updates: Record<string, unknown> = {}
							for (const key of definition.resultKeys ?? []) updates[key] = defaults[key]
							editor.updateShape({
								id: shape.id,
								type: shape.type,
								props: {
									node: { ...(shape.props.node as object), ...updates } as never,
									isOutOfDate: true,
								},
							})
						}}
					/>
				)}
				<TldrawUiMenuItem
					id="delete-card"
					label="Delete card"
					onSelect={() => {
						editor.markHistoryStoppingPoint('delete card')
						editor.deleteShapes([shape.id])
					}}
				/>
			</TldrawUiMenuGroup>
		</>
	)
}

function TypeSpecificItems({ shape, kind }: { shape: NodeShape; kind: string }) {
	const editor = useEditor()

	switch (kind) {
		case 'ifelse': {
			const node = shape.props.node as IfElseNode
			return (
				<TldrawUiMenuGroup id="kane-ifelse">
					<TldrawUiMenuItem
						id="toggle-mode"
						label={
							node.mode === 'nl' ? 'Use operand picker' : 'Use natural language'
						}
						onSelect={() => toggleConditionMode(editor, shape)}
					/>
					{canAddElseIf(node) && (
						<TldrawUiMenuItem
							id="add-else-if"
							label="Add Else-If block"
							onSelect={() => addElseIfBlock(editor, shape)}
						/>
					)}
					{node.blocks.length > 1 && (
						<TldrawUiMenuItem
							id="remove-else-if"
							label="Remove last Else-If"
							onSelect={() => removeElseIfBlock(editor, shape, node.blocks.length - 1)}
						/>
					)}
				</TldrawUiMenuGroup>
			)
		}
		case 'click': {
			const node = shape.props.node as ClickNode
			return (
				<TldrawUiMenuGroup id="kane-click">
					{(['single', 'double', 'multiple', 'right', 'hold'] as const).map((clickType) => (
						<TldrawUiMenuItem
							key={clickType}
							id={`click-${clickType}`}
							label={`${clickType[0].toUpperCase()}${clickType.slice(1)} click${node.clickType === clickType ? ' ✓' : ''}`}
							onSelect={() =>
								updateNode<ClickNode>(editor, shape, (n) => ({ ...n, clickType }))
							}
						/>
					))}
				</TldrawUiMenuGroup>
			)
		}
		case 'input': {
			const node = shape.props.node as InputNode
			return (
				<TldrawUiMenuGroup id="kane-input">
					<TldrawUiMenuItem
						id="toggle-enter"
						label={node.pressEnter ? 'Don’t press Enter after' : 'Press Enter after typing'}
						onSelect={() =>
							updateNode<InputNode>(editor, shape, (n) => ({ ...n, pressEnter: !n.pressEnter }))
						}
					/>
				</TldrawUiMenuGroup>
			)
		}
		case 'while': {
			const node = shape.props.node as WhileNode
			return (
				<TldrawUiMenuGroup id="kane-while">
					<TldrawUiMenuItem
						id="more-iterations"
						label={`More iterations (${node.maxIterations} → ${Math.min(10, node.maxIterations + 1)})`}
						onSelect={() =>
							updateNode<WhileNode>(editor, shape, (n) => ({
								...n,
								maxIterations: Math.min(10, n.maxIterations + 1),
							}))
						}
					/>
					{node.maxIterations > 1 && (
						<TldrawUiMenuItem
							id="fewer-iterations"
							label={`Fewer iterations (${node.maxIterations} → ${node.maxIterations - 1})`}
							onSelect={() =>
								updateNode<WhileNode>(editor, shape, (n) => ({
									...n,
									maxIterations: Math.max(1, n.maxIterations - 1),
								}))
							}
						/>
					)}
				</TldrawUiMenuGroup>
			)
		}
		default:
			return null
	}
}

function FrameMenuContent({ shape }: { shape: TLFrameShape }) {
	const editor = useEditor()

	return (
		<>
			<TldrawUiMenuGroup id="kane-module">
				<TldrawUiMenuItem
					id="run-module"
					label="Run module"
					onSelect={() => {
						const children = editor
							.getSortedChildIdsForParent(shape.id)
							.map((id) => editor.getShape(id))
							.filter((s): s is NodeShape => !!s && editor.isShapeOfType<NodeShape>(s, 'node'))
						const starting = children.filter(
							(s) => !getNodePortConnections(editor, s).some((c) => c.terminal === 'end')
						)
						if (starting.length > 0) {
							startExecution(editor, new Set(starting.map((s) => s.id)))
						}
					}}
				/>
				<TldrawUiMenuItem
					id="rename-module"
					label="Rename module"
					onSelect={() => {
						editor.setEditingShape(shape.id)
					}}
				/>
				<TldrawUiMenuItem
					id="fit-module"
					label="Fit to content"
					onSelect={() => fitFrameToContent(editor, shape.id, { padding: 40 })}
				/>
				<TldrawUiMenuItem
					id="dissolve-module"
					label="Delete module (keep cards)"
					onSelect={() => {
						editor.markHistoryStoppingPoint('remove module frame')
						const children = editor.getSortedChildIdsForParent(shape.id)
						editor.reparentShapes(children, editor.getCurrentPageId())
						editor.deleteShapes([shape.id])
					}}
				/>
			</TldrawUiMenuGroup>
		</>
	)
}
