import { createShapeId, Editor } from 'tldraw'
import { onCanvasNodePickerState } from '../components/OnCanvasNodePicker'
import { DEFAULT_NODE_SPACING_PX, NODE_WIDTH_PX } from '../constants'
import { getNodePorts, getPortDataType } from '../nodes/nodePorts'
import { getNodeDefinitions, getPortsForNodeType } from '../nodes/nodeTypes'
import { ShapePort } from '../ports/Port'
import { arePortDataTypesCompatible, findFirstCompatiblePort } from '../ports/portCompatibility'
import { createOrUpdateConnectionBinding, getConnectionBindings } from './ConnectionBindingUtil'
import { ConnectionShape } from './ConnectionShapeUtil'

/**
 * Whether any card could be dropped into the middle of this wire.
 *
 * A card can only go there if it accepts what the wire carries *and* passes it
 * on: a Variable has a value output and no input at all, so a value wire —
 * a data card feeding a field — has nothing that could sit in the middle of it.
 * Wires like that don't get a "+" handle, because the menu behind it would be
 * empty.
 *
 * The answer depends only on the pair of data types at the wire's ends, so it
 * is worked out once per pair and remembered: `getOverlays` asks this for every
 * connection on screen, every frame.
 */
const insertableByTypePair = new Map<string, boolean>()

export function canInsertWithinConnection(editor: Editor, connection: ConnectionShape): boolean {
	const bindings = getConnectionBindings(editor, connection)
	if (!bindings.start || !bindings.end) return false
	const sourceType =
		getPortDataType(editor, bindings.start.toId, bindings.start.props.portId) ?? 'any'
	const targetType = getPortDataType(editor, bindings.end.toId, bindings.end.props.portId) ?? 'any'

	const key = `${sourceType}>${targetType}`
	const known = insertableByTypePair.get(key)
	if (known !== undefined) return known

	const fits = (ports: ShapePort[], terminal: ShapePort['terminal'], dataType: ShapePort['dataType']) =>
		ports.some((p) => p.terminal === terminal && arePortDataTypesCompatible(p.dataType, dataType))

	const answer = Object.values(getNodeDefinitions(editor))
		// a card nobody can choose from the menu can't make the menu worth opening
		.filter((definition) => !definition.hidden)
		.some((definition) => {
			const ports = Object.values(getPortsForNodeType(editor, definition.getDefault()))
			return fits(ports, 'end', sourceType) && fits(ports, 'start', targetType)
		})
	insertableByTypePair.set(key, answer)
	return answer
}

/**
 * Insert a node in the middle of a connection.
 */
export function insertNodeWithinConnection(editor: Editor, connection: ConnectionShape) {
	onCanvasNodePickerState.set(editor, {
		connectionShapeId: connection.id,
		location: 'middle',
		onPick: (nodeType) => {
			const mark = editor.markHistoryStoppingPoint()

			const originalBindings = getConnectionBindings(editor, connection)

			if (!originalBindings.start || !originalBindings.end) return

			const startBounds = editor.getShapePageBounds(originalBindings.start.toId)!
			const endBounds = editor.getShapePageBounds(originalBindings.end.toId)!
			const newNodeY = (startBounds.top + endBounds.top) / 2
			const newNodeIdealX = (startBounds.right + endBounds.left - NODE_WIDTH_PX) / 2
			const newNodeMin = startBounds.right + DEFAULT_NODE_SPACING_PX
			const newNodeX = Math.max(newNodeIdealX, newNodeMin)

			const newNodeId = createShapeId()
			editor.createShape({
				type: 'node',
				id: newNodeId,
				x: newNodeX,
				y: newNodeY,
				props: { node: nodeType },
			})

			const sourceType = getPortDataType(
				editor,
				originalBindings.start.toId,
				originalBindings.start.props.portId
			)
			const targetType = getPortDataType(
				editor,
				originalBindings.end.toId,
				originalBindings.end.props.portId
			)

			const ports = getNodePorts(editor, newNodeId)
			const firstCompatibleInputPort = sourceType
				? findFirstCompatiblePort(Object.values(ports), 'end', sourceType)
				: Object.values(ports).find((p) => p.terminal === 'end')
			const firstCompatibleOutputPort = targetType
				? findFirstCompatiblePort(Object.values(ports), 'start', targetType)
				: Object.values(ports).find((p) => p.terminal === 'start')

			if (!firstCompatibleInputPort || !firstCompatibleOutputPort) {
				editor.bailToMark(mark)
				return
			}

			createOrUpdateConnectionBinding(editor, connection, newNodeId, {
				portId: firstCompatibleInputPort.id,
				terminal: 'end',
			})

			const newConnectionId = createShapeId()
			editor.createShape({
				type: 'connection',
				id: newConnectionId,
			})
			createOrUpdateConnectionBinding(editor, newConnectionId, newNodeId, {
				portId: firstCompatibleOutputPort.id,
				terminal: 'start',
			})
			createOrUpdateConnectionBinding(editor, newConnectionId, originalBindings.end.toId, {
				portId: originalBindings.end.props.portId,
				terminal: 'end',
			})

			editor.select(newNodeId)
			editor.updatePointer()
		},
		onClose: () => {},
	})
}
