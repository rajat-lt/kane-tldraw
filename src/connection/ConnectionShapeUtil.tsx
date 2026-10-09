import classNames from 'classnames'
import {
	CubicBezier2d,
	Editor,
	IndexKey,
	Mat,
	RecordProps,
	SVGContainer,
	ShapeUtil,
	TLHandle,
	TLHandleDragInfo,
	TLShape,
	TLShapeId,
	Vec,
	VecLike,
	VecModel,
	clamp,
	createShapeId,
	useEditor,
	useValue,
	vecModelValidator,
} from 'tldraw'
import { useEffect, useRef } from 'react'
import { onCanvasNodePickerState } from '../components/OnCanvasNodePicker'
import { PortDataType } from '../constants'
import { executionState } from '../execution/executionState'
import { aiBuildState } from '../kane/uiState'
import { gsap, prefersReducedMotion } from '../lib/gsap'
import {
	getAllConnectedNodes,
	getNodeOutputPortInfo,
	getNodePorts,
	getPortDataType,
} from '../nodes/nodePorts'
import { STOP_EXECUTION } from '../nodes/types/shared'
import { getPortAtPoint } from '../ports/getPortAtPoint'
import { findFirstCompatiblePort } from '../ports/portCompatibility'
import { updatePortState } from '../ports/portState'
import {
	createOrUpdateConnectionBinding,
	getConnectionBindingPositionInPageSpace,
	getConnectionBindings,
	removeConnectionBinding,
} from './ConnectionBindingUtil'

const CONNECTION_TYPE = 'connection'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CONNECTION_TYPE]: {
			start: VecModel
			end: VecModel
		}
	}
}

export type ConnectionShape = TLShape<typeof CONNECTION_TYPE>

export class ConnectionShapeUtil extends ShapeUtil<ConnectionShape> {
	static override type = CONNECTION_TYPE
	static override props: RecordProps<ConnectionShape> = {
		start: vecModelValidator,
		end: vecModelValidator,
	}

	/** Connection ID that will be replaced if the current drag completes on an occupied port. */
	private pendingReplacementId: TLShapeId | null = null

	getDefaultProps(): ConnectionShape['props'] {
		return {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 100 },
		}
	}

	override canEdit(_shape: ConnectionShape) {
		return false
	}
	override canResize(_shape: ConnectionShape) {
		return false
	}
	override hideResizeHandles(_shape: ConnectionShape) {
		return true
	}
	override hideRotateHandle(_shape: ConnectionShape) {
		return true
	}
	override hideSelectionBoundsBg(_shape: ConnectionShape) {
		return true
	}
	override hideSelectionBoundsFg(_shape: ConnectionShape) {
		return true
	}
	override canSnap(_shape: ConnectionShape) {
		return false
	}
	override getBoundsSnapGeometry(_shape: ConnectionShape) {
		return {
			points: [],
		}
	}

	getGeometry(connection: ConnectionShape) {
		const { start, end } = getConnectionTerminals(this.editor, connection)
		const [cp1, cp2] = getConnectionControlPoints(start, end)
		return new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})
	}

	getHandles(connection: ConnectionShape): TLHandle[] {
		const { start, end } = getConnectionTerminals(this.editor, connection)
		return [
			{
				id: 'start',
				type: 'vertex',
				index: 'a0' as IndexKey,
				x: start.x,
				y: start.y,
			},
			{
				id: 'end',
				type: 'vertex',
				index: 'a1' as IndexKey,
				x: end.x,
				y: end.y,
			},
		]
	}

	onHandleDrag(connection: ConnectionShape, { handle }: TLHandleDragInfo<ConnectionShape>) {
		const existingBindings = getConnectionBindings(this.editor, connection)
		const draggingTerminal = handle.id as 'start' | 'end'
		const oppositeTerminal = draggingTerminal === 'start' ? 'end' : 'start'
		const oppositeTerminalShapeId = existingBindings[oppositeTerminal]?.toId

		const shapeTransform = this.editor.getShapePageTransform(connection)
		const handlePagePosition = shapeTransform.applyToPoint(handle)

		const target = getPortAtPoint(this.editor, handlePagePosition, {
			margin: 8,
			terminal: handle.id as 'start' | 'end',
		})

		const existingConnectionOnTarget =
			target?.existingConnections.find((c) => c.connectionId !== connection.id) ?? null

		const nodesWhichWouldCreateACycle = oppositeTerminalShapeId
			? getAllConnectedNodes(this.editor, oppositeTerminalShapeId, draggingTerminal)
			: null

		// Determine the data type of the opposite end for type-checking
		const oppositeBinding = existingBindings[oppositeTerminal]
		let dragDataType: PortDataType | null = null
		if (oppositeBinding) {
			dragDataType = getPortDataType(
				this.editor,
				oppositeBinding.toId,
				oppositeBinding.props.portId
			)
		}

		updatePortState(this.editor, {
			eligiblePorts: {
				terminal: draggingTerminal,
				excludeNodes: nodesWhichWouldCreateACycle,
				dataType: dragDataType,
			},
		})

		// Check type compatibility
		const isTypeIncompatible =
			target &&
			dragDataType &&
			dragDataType !== 'any' &&
			target.port.dataType !== 'any' &&
			target.port.dataType !== dragDataType

		const wouldCreateACycle = (target && nodesWhichWouldCreateACycle?.has(target.shape.id)) ?? false
		if (!target || wouldCreateACycle || isTypeIncompatible) {
			this.pendingReplacementId = null
			updatePortState(this.editor, { hintingPort: null })

			removeConnectionBinding(this.editor, connection, draggingTerminal)

			return {
				...connection,
				props: {
					[handle.id]: { x: handle.x, y: handle.y },
				},
			}
		}

		// Track the connection that would be replaced, but don't delete it yet.
		// Multi-ports accept multiple connections, so skip replacement for them.
		this.pendingReplacementId =
			existingConnectionOnTarget && draggingTerminal === 'end' && !target.port.multi
				? existingConnectionOnTarget.connectionId
				: null

		updatePortState(this.editor, {
			hintingPort: { portId: target.port.id, shapeId: target.shape.id },
		})

		createOrUpdateConnectionBinding(this.editor, connection, target.shape, {
			portId: target.port.id,
			terminal: draggingTerminal,
		})

		return connection
	}

	onHandleDragEnd(
		connection: ConnectionShape,
		{ handle, isCreatingShape }: TLHandleDragInfo<ConnectionShape>
	) {
		// Delete the connection being replaced now that the drag is committed.
		if (this.pendingReplacementId) {
			this.editor.deleteShapes([this.pendingReplacementId])
			this.pendingReplacementId = null
		}

		updatePortState(this.editor, { hintingPort: null, eligiblePorts: null })

		const draggingTerminal = handle.id as 'start' | 'end'

		const bindings = getConnectionBindings(this.editor, connection)
		if (bindings[draggingTerminal]) {
			return
		}

		if (isCreatingShape && draggingTerminal === 'end') {
			this.editor.selectNone()
			onCanvasNodePickerState.set(this.editor, {
				connectionShapeId: connection.id,
				location: draggingTerminal,
				onClose: () => {
					const bindings = getConnectionBindings(this.editor, connection)
					if (!bindings.start || !bindings.end) {
						this.editor.deleteShapes([connection.id])
					}
				},
				onPick: (nodeType, terminalInPageSpace) => {
					const newNodeId = createShapeId()
					this.editor.createShape({
						type: 'node',
						id: newNodeId,
						x: terminalInPageSpace.x,
						y: terminalInPageSpace.y,
						props: {
							node: nodeType,
						},
					})
					this.editor.select(newNodeId)

					const bindings = getConnectionBindings(this.editor, connection)
					const sourceType = bindings.start
						? (getPortDataType(this.editor, bindings.start.toId, bindings.start.props.portId) ??
							'any')
						: 'any'

					const ports = getNodePorts(this.editor, newNodeId)
					const firstCompatibleInputPort = findFirstCompatiblePort(
						Object.values(ports),
						'end',
						sourceType
					)
					if (firstCompatibleInputPort) {
						this.editor.updateShape({
							id: newNodeId,
							type: 'node',
							x: terminalInPageSpace.x - firstCompatibleInputPort.x,
							y: terminalInPageSpace.y - firstCompatibleInputPort.y,
						})

						createOrUpdateConnectionBinding(this.editor, connection, newNodeId, {
							portId: firstCompatibleInputPort.id,
							terminal: draggingTerminal,
						})
					}
				},
			})
		} else {
			if (!bindings.start || !bindings.end) {
				this.editor.deleteShapes([connection.id])
			}
		}
	}

	onHandleDragCancel() {
		this.pendingReplacementId = null
		updatePortState(this.editor, { hintingPort: null, eligiblePorts: null })
	}

	component(connection: ConnectionShape) {
		return <ConnectionShapeComponent connection={connection} />
	}

	getIndicatorPath(connection: ConnectionShape) {
		const { start, end } = getConnectionTerminals(this.editor, connection)
		return new Path2D(getConnectionPath(start, end))
	}
}

/**
 * Wire animations.
 *
 * Creation beat (Codrops' self-drawing-SVG technique via DrawSVGPlugin): the
 * wire draws itself from the source port outwards, then hands over to the
 * marching-ants dashes for the rest of the "building" state — GSAP writes
 * stroke-dasharray inline, so we clear it on completion to let the CSS
 * animation take over.
 *
 * Run beat (Codrops' animate-along-a-path technique): a glow packet is walked
 * down the curve with getTotalLength/getPointAtLength whenever the wire's
 * destination card starts executing.
 */
function useWireAnimations(
	connectionId: TLShapeId,
	pathRef: React.RefObject<SVGPathElement | null>,
	dotRef: React.RefObject<SVGCircleElement | null>,
	isAiBuilding: boolean,
	isDelivering: boolean
) {
	// --- self-draw on creation ---------------------------------------------
	const hasDrawn = useRef(false)
	useEffect(() => {
		const path = pathRef.current
		if (!isAiBuilding || !path || hasDrawn.current) return
		hasDrawn.current = true
		if (prefersReducedMotion()) return

		const tween = gsap.fromTo(
			path,
			{ drawSVG: '0%' },
			{
				drawSVG: '100%',
				duration: 0.38,
				ease: 'power2.out',
				onComplete: () => {
					// hand the stroke back to the marching-ants CSS animation
					gsap.set(path, { clearProps: 'strokeDasharray,strokeDashoffset' })
				},
			}
		)
		return () => {
			tween.kill()
			gsap.set(path, { clearProps: 'strokeDasharray,strokeDashoffset' })
		}
	}, [isAiBuilding, pathRef, connectionId])

	// --- glow packet during a run ------------------------------------------
	useEffect(() => {
		const path = pathRef.current
		const dot = dotRef.current
		if (!isDelivering || !path || !dot || prefersReducedMotion()) return

		const length = path.getTotalLength()
		if (!length) return

		const walker = { distance: 0 }
		const tween = gsap.to(walker, {
			distance: length,
			duration: 0.62,
			ease: 'power1.inOut',
			onStart: () => dot.setAttribute('opacity', '1'),
			onUpdate: () => {
				const point = path.getPointAtLength(walker.distance)
				dot.setAttribute('cx', String(point.x))
				dot.setAttribute('cy', String(point.y))
			},
			onComplete: () => dot.setAttribute('opacity', '0'),
		})
		return () => {
			tween.kill()
			dot.setAttribute('opacity', '0')
		}
	}, [isDelivering, pathRef, dotRef])
}

function ConnectionShapeComponent({ connection }: { connection: ConnectionShape }) {
	const editor = useEditor()
	const pathRef = useRef<SVGPathElement>(null)
	const dotRef = useRef<SVGCircleElement>(null)

	const { start, end } = useValue('terminals', () => getConnectionTerminals(editor, connection), [
		editor,
		connection,
	])

	// Every wire is blue. Colouring by data type meant a value wire read as a
	// different kind of thing from a flow wire, when the useful question about a
	// wire on this canvas is only ever which way it runs — which the ports at
	// either end already answer.

	const isInactive = useValue(
		'isInactive',
		() => {
			const bindings = getConnectionBindings(editor, connection.id)
			if (!bindings.start) return false
			const originShapeId = bindings.start?.toId
			if (!originShapeId) return false
			const outputs = getNodeOutputPortInfo(editor, originShapeId)
			const output = outputs[bindings.start.props.portId]
			return output?.value === STOP_EXECUTION
		},
		[connection.id, editor]
	)

	const isAiBuilding = useValue(
		'ai building wire',
		() => aiBuildState.get(editor).ids.includes(connection.id),
		[connection.id, editor]
	)

	// The wire "delivers" while the card it feeds into is executing.
	const isDelivering = useValue(
		'wire delivering',
		() => {
			const graph = executionState.get(editor).runningGraph
			if (!graph) return false
			const bindings = getConnectionBindings(editor, connection.id)
			const targetId = bindings.end?.toId
			return !!targetId && graph.getNodeStatus(targetId) === 'executing'
		},
		[connection.id, editor]
	)

	useWireAnimations(connection.id, pathRef, dotRef, isAiBuilding, isDelivering)

	return (
		<SVGContainer
			className={classNames(
				'ConnectionShape',
				isInactive && 'ConnectionShape_inactive',
				isAiBuilding && 'ConnectionShape_aiBuilding'
			)}
		>
			<path ref={pathRef} d={getConnectionPath(start, end)} />
			<circle
				ref={dotRef}
				className="ConnectionShape-packet"
				r={4}
				cx={start.x}
				cy={start.y}
				opacity={0}
			/>
		</SVGContainer>
	)
}

export function getConnectionControlPoints(start: VecLike, end: VecLike): [Vec, Vec] {
	const distance = end.x - start.x
	const adjustedDistance = Math.max(
		30,
		distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100)
	)
	return [new Vec(start.x + adjustedDistance, start.y), new Vec(end.x - adjustedDistance, end.y)]
}

/**
 * Page-space midpoint of a connection's bezier curve, for positioning the
 * center insert handle. Returns null when the connection isn't fully bound.
 */
export function getConnectionPageCenter(editor: Editor, connection: ConnectionShape): Vec | null {
	const bindings = getConnectionBindings(editor, connection)
	if (!bindings.start || !bindings.end) return null
	const startPage = getConnectionBindingPositionInPageSpace(editor, bindings.start)
	const endPage = getConnectionBindingPositionInPageSpace(editor, bindings.end)
	if (!startPage || !endPage) return null
	const [cp1, cp2] = getConnectionControlPoints(startPage, endPage)
	// Cubic bezier midpoint at t=0.5: (P0 + 3·P1 + 3·P2 + P3) / 8
	return new Vec(
		(startPage.x + 3 * cp1.x + 3 * cp2.x + endPage.x) / 8,
		(startPage.y + 3 * cp1.y + 3 * cp2.y + endPage.y) / 8
	)
}

function getConnectionPath(start: VecLike, end: VecLike) {
	const [cp1, cp2] = getConnectionControlPoints(start, end)
	return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
}

export function getConnectionTerminals(editor: Editor, connection: ConnectionShape) {
	let start, end

	const bindings = getConnectionBindings(editor, connection)
	const shapeTransform = Mat.Inverse(editor.getShapePageTransform(connection))
	if (bindings.start) {
		const inPageSpace = getConnectionBindingPositionInPageSpace(editor, bindings.start)
		if (inPageSpace) {
			start = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}
	if (bindings.end) {
		const inPageSpace = getConnectionBindingPositionInPageSpace(editor, bindings.end)
		if (inPageSpace) {
			end = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}

	if (!start) start = connection.props.start
	if (!end) end = connection.props.end

	return { start, end }
}
