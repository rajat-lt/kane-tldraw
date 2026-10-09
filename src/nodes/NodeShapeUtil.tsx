import classNames from 'classnames'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import {
	Circle2d,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	Group2d,
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	T,
	TLShape,
	TLShapeId,
	useEditor,
	useValue,
} from 'tldraw'
import { PORT_RADIUS_PX } from '../constants'
import { executionState } from '../execution/executionState'
import { aiBuildState, errorFlashState, renameState } from '../kane/uiState'
import { Port } from '../ports/Port'
import { CardHeaderActions } from './CardHeaderActions'
import { getNodeOutputPortInfo, getNodePorts } from './nodePorts'
import { getNodeDefinition, getNodeHeightPx, getNodeWidthPx, NodeBody, NodeType } from './nodeTypes'
import { CardBaseFields } from './types/cardBase'
import { CardPanel } from './types/CardPanel'
import {
	CARD_CHROME_PX,
	NodeResizeGrip,
	NodeValue,
	STOP_EXECUTION,
	updateNode,
} from './types/shared'

const NODE_TYPE = 'node'

const nodeVersions = createShapePropsMigrationIds('node', {
	RemoveWhileBreakAndContinue: 1,
})

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[NODE_TYPE]: { node: NodeType; isOutOfDate: boolean }
	}
}

export type NodeShape = TLShape<typeof NODE_TYPE>

export class NodeShapeUtil extends ShapeUtil<NodeShape> {
	static override type = NODE_TYPE
	static override props: RecordProps<NodeShape> = {
		node: NodeType,
		isOutOfDate: T.boolean,
	}

	/**
	 * Documents are persisted to IndexedDB, so a field that is removed from a
	 * card has to be removed from what is already saved too — otherwise the
	 * validator rejects the whole document on load and the canvas comes up empty.
	 *
	 * Adding a field never needs one of these, because every field a card gained
	 * is optional.
	 */
	static override migrations = createShapePropsMigrationSequence({
		sequence: [
			{
				id: nodeVersions.RemoveWhileBreakAndContinue,
				up: (props) => {
					const node = props.node as Record<string, unknown>
					if (node?.type !== 'while') return
					for (const key of [
						'breakWhen',
						'breakLeft',
						'breakOp',
						'breakRight',
						'continueWhen',
						'continueLeft',
						'continueOp',
						'continueRight',
						'lastExit',
						'lastSkipped',
					]) {
						delete node[key]
					}
				},
				down: () => {
					// the fields are gone; there is nothing to put back
				},
			},
		],
	})

	getDefaultProps(): NodeShape['props'] {
		return {
			node: getNodeDefinition(this.editor, 'click').getDefault(),
			isOutOfDate: false,
		}
	}

	override canEdit(_shape: NodeShape) {
		return false
	}
	override canResize(_shape: NodeShape) {
		return false
	}
	override hideResizeHandles(_shape: NodeShape) {
		return true
	}
	override hideRotateHandle(_shape: NodeShape) {
		return true
	}
	override hideSelectionBoundsBg(_shape: NodeShape) {
		return true
	}
	override hideSelectionBoundsFg(_shape: NodeShape) {
		return true
	}
	override isAspectRatioLocked(_shape: NodeShape) {
		return false
	}
	override getBoundsSnapGeometry(_shape: NodeShape) {
		return {
			points: [{ x: 0, y: 0 }],
		}
	}

	getGeometry(shape: NodeShape) {
		const ports = getNodePorts(this.editor, shape)
		const width = getNodeWidthPx(this.editor, shape)

		const portGeometries = Object.values(ports).map(
			(port) =>
				new Circle2d({
					x: port.x - PORT_RADIUS_PX,
					y: port.y - PORT_RADIUS_PX,
					radius: PORT_RADIUS_PX,
					isFilled: true,
					isLabel: true,
					excludeFromShapeBounds: true,
				})
		)

		const bodyGeometry = new Rectangle2d({
			width,
			height: getNodeHeightPx(this.editor, shape),
			isFilled: true,
		})

		return new Group2d({
			children: [bodyGeometry, ...portGeometries],
		})
	}

	component(shape: NodeShape) {
		return <NodeShapeComponent shape={shape} />
	}

	/**
	 * No tldraw indicator for cards.
	 *
	 * tldraw draws indicators to a canvas for both the hovered *and* the
	 * selected shape, with no per-shape DOM to style — so the blue outline
	 * fought the proximity glow on hover. Selection is drawn by the card
	 * itself instead (`NodeShape_selected`), leaving hover to the glow alone.
	 */
	getIndicatorPath(_shape: NodeShape) {
		return undefined
	}
}

/**
 * Cards that have already played their entry animation this session.
 *
 * tldraw culls off-screen shapes by unmounting them, so without this the
 * spring entry would replay every time a card scrolled back into view.
 */
const enteredCards = new Set<TLShapeId>()

function NodeShapeComponent({ shape }: { shape: NodeShape }) {
	const editor = useEditor()
	const reduceMotion = useReducedMotion()

	// Only animate genuinely new cards — decided once, on first mount.
	const isFirstMount = useRef(!enteredCards.has(shape.id))
	useEffect(() => {
		enteredCards.add(shape.id)
	}, [shape.id])

	const ports = useValue('ports', () => getNodePorts(editor, shape.id), [editor, shape.id])

	const output = useValue(
		'output',
		() => getNodeOutputPortInfo(editor, shape.id)?.output ?? undefined,
		[editor, shape.id]
	)

	const isExecuting = useValue(
		'is executing',
		() => executionState.get(editor).runningGraph?.getNodeStatus(shape.id) === 'executing',
		[editor, shape.id]
	)

	const isErrorFlashing = useValue(
		'error flash',
		() => errorFlashState.get(editor).ids.includes(shape.id),
		[editor, shape.id]
	)

	const isAiBuilding = useValue(
		'ai building',
		() => aiBuildState.get(editor).ids.includes(shape.id),
		[editor, shape.id]
	)

	const isSelected = useValue(
		'is selected',
		() => editor.getSelectedShapeIds().includes(shape.id),
		[editor, shape.id]
	)

	const externalRename = useValue(
		'rename request',
		() => renameState.get(editor) === shape.id,
		[editor, shape.id]
	)

	const nodeDefinition = getNodeDefinition(editor, shape.props.node)
	const node = shape.props.node as { label?: string }
	const displayName = node.label?.trim() || (nodeDefinition.heading ?? nodeDefinition.title)

	// ---- inline heading rename (double-click, or context-menu Rename) ------
	const [editingName, setEditingName] = useState(false)
	const [draftName, setDraftName] = useState('')
	const nameInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (externalRename) {
			setDraftName(displayName)
			setEditingName(true)
			renameState.set(editor, null)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [externalRename])

	useEffect(() => {
		if (editingName) {
			window.setTimeout(() => {
				nameInputRef.current?.focus()
				nameInputRef.current?.select()
			}, 20)
		}
	}, [editingName])

	const commitName = () => {
		setEditingName(false)
		const next = draftName.trim()
		updateNode(
			editor,
			shape,
			(n) => ({ ...(n as object), label: next || undefined }) as never,
			false
		)
	}

	const showHeaderValue =
		output !== undefined && output.dataType === 'value' && !output.multi && output.value !== null

	const animateEntry = isFirstMount.current && !reduceMotion

	// A resizable card is exactly as tall as its geometry says, so the rows can
	// share whatever height was dragged onto it. Every other card is still sized
	// by its contents.
	const canResize = nodeDefinition.canResizeNode
	// what the card needs at its smallest — the floor for the grip
	const naturalSize = useValue(
		'natural size',
		() => {
			const bare = { ...(shape.props.node as object), w: undefined, h: undefined } as NodeType
			const def = getNodeDefinition(editor, bare)
			return {
				width: def.getWidthPx(shape, bare),
				height: def.getBodyHeightPx(shape, bare) + CARD_CHROME_PX,
			}
		},
		[editor, shape]
	)

	return (
		<HTMLContainer
			className={classNames('NodeShape-host', { 'NodeShape-host_sized': canResize })}
			// Native context menu is disabled everywhere on the canvas; the
			// card context menu (tldraw) opens instead.
			onContextMenu={(e) => e.preventDefault()}
		>
			<motion.div
				className={classNames('NodeShape', {
					NodeShape_executing: isExecuting,
					NodeShape_errorFlash: isErrorFlashing,
					NodeShape_aiBuilding: isAiBuilding,
					NodeShape_selected: isSelected,
					NodeShape_sized: canResize,
				})}
				initial={
					animateEntry ? { opacity: 0, scale: 0.92, y: 10, filter: 'blur(6px)' } : false
				}
				animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
				transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
			>
				{/* No proximity glow here any more. The gradient sweep it painted on
				    hover read as a state the card was in rather than as a pointer
				    affordance, and on a dense canvas it fired constantly. Every other
				    gradient — the AI-building conic ring included — is untouched. */}
				<div className="NodeShape-heading">
				{ports?.input && <Port shapeId={shape.id} portId="input" />}
				<div className="NodeShape-icon">{nodeDefinition.icon}</div>
				{editingName ? (
					<input
						ref={nameInputRef}
						className="NodeShape-name-input"
						value={draftName}
						onChange={(e) => setDraftName(e.currentTarget.value)}
						onPointerDown={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							e.stopPropagation()
							if (e.key === 'Enter' || e.key === 'Return') commitName()
							if (e.key === 'Escape') setEditingName(false)
						}}
						onBlur={commitName}
					/>
				) : (
					<div
						className="NodeShape-label"
						title="Double-click to rename"
						onDoubleClick={(e) => {
							e.stopPropagation()
							setDraftName(displayName)
							setEditingName(true)
						}}
						onPointerDown={(e) => {
							// double-click needs the events; single clicks still select via tldraw
							if (e.detail > 1) e.stopPropagation()
						}}
					>
						{displayName}
					</div>
				)}
				{showHeaderValue && (
					<div className="NodeShape-output">
						<NodeValue value={output.isOutOfDate ? STOP_EXECUTION : output.value} />
					</div>
				)}
				<CardHeaderActions shape={shape} />
				{ports?.output && <Port shapeId={shape.id} portId="output" />}
				</div>
				<NodeBody shape={shape} />
				<CardPanel shape={shape} node={shape.props.node as CardBaseFields} />
				{canResize && (
					<NodeResizeGrip
						shape={shape}
						minWidth={naturalSize.width}
						minHeight={naturalSize.height}
					/>
				)}
			</motion.div>
		</HTMLContainer>
	)
}
