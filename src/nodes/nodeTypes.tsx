import { Editor, T, useEditor, WeakCache } from 'tldraw'
import {
	NODE_FOOTER_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_BOTTOM_PADDING_PX,
	NODE_ROW_HEADER_GAP_PX,
} from '../constants'
import { PortId, ShapePort } from '../ports/Port'
import { NodeShape } from './NodeShapeUtil'
import { CardBaseFields } from './types/cardBase'
import { cardPanelHeightPx } from './types/CardPanel'
import { AiStepNodeDefinition } from './types/AiStepNode'
import { ApiNodeDefinition } from './types/ApiNode'
import { ClickNodeDefinition } from './types/ClickNode'
import {
	ParameterNodeDefinition,
	SecretNodeDefinition,
	TotpNodeDefinition,
	VariableNodeDefinition,
} from './types/EntityNode'
import { IfElseNodeDefinition } from './types/IfElseNode'
import { InputNodeDefinition } from './types/InputNode'
import { JsNodeDefinition } from './types/JsNode'
import { OpenNodeDefinition } from './types/OpenNode'
import { ScrollNodeDefinition } from './types/ScrollNode'
import {
	ExecutionResult,
	InfoValues,
	NodeDefinition,
	NodeDefinitionConstructor,
} from './types/shared'
import { WhileNodeDefinition } from './types/WhileNode'

/** All Kane card types */
export const NodeDefinitions = {
	ifelse: IfElseNodeDefinition,
	parameter: ParameterNodeDefinition,
	secret: SecretNodeDefinition,
	totp: TotpNodeDefinition,
	variable: VariableNodeDefinition,
	click: ClickNodeDefinition,
	input: InputNodeDefinition,
	while: WhileNodeDefinition,
	open: OpenNodeDefinition,
	js: JsNodeDefinition,
	api: ApiNodeDefinition,
	ai: AiStepNodeDefinition,
	scroll: ScrollNodeDefinition,
} satisfies Record<string, NodeDefinitionConstructor<any>>

/**
 * A union type of all our node types.
 */
export type NodeType = T.TypeOf<typeof NodeType>
export const NodeType = T.union(
	'type',
	Object.fromEntries(Object.values(NodeDefinitions).map((type) => [type.type, type.validator])) as {
		[K in keyof typeof NodeDefinitions as (typeof NodeDefinitions)[K]['type']]: (typeof NodeDefinitions)[K]['validator']
	}
)

const nodeDefinitions = new WeakCache<
	Editor,
	{ [K in keyof typeof NodeDefinitions]: InstanceType<(typeof NodeDefinitions)[K]> }
>()
export function getNodeDefinitions(editor: Editor) {
	return nodeDefinitions.get(editor, () => {
		return Object.fromEntries(
			Object.values(NodeDefinitions).map((value) => [value.type, new value(editor)])
		) as any
	})
}

export function getNodeDefinition(
	editor: Editor,
	node: NodeType | NodeType['type']
): NodeDefinition<NodeType> {
	return getNodeDefinitions(editor)[
		typeof node === 'string' ? node : node.type
	] as NodeDefinition<NodeType>
}

export function getNodeWidthPx(editor: Editor, shape: NodeShape): number {
	return getNodeDefinition(editor, shape.props.node).getWidthPx(shape, shape.props.node)
}

/**
 * The card's rows, plus its panel if one is open.
 *
 * The panel is added here rather than in each card's `getBodyHeightPx` so that
 * every card gets it without having to remember to — and so a card's own height
 * calculation stays about its own contents.
 */
export function getNodeBodyHeightPx(editor: Editor, shape: NodeShape): number {
	const rows = getNodeDefinition(editor, shape.props.node).getBodyHeightPx(shape, shape.props.node)
	return rows + cardPanelHeightPx(shape.props.node as CardBaseFields)
}

export function getNodeHeightPx(editor: Editor, shape: NodeShape): number {
	return (
		NODE_HEADER_HEIGHT_PX +
		NODE_ROW_HEADER_GAP_PX +
		getNodeBodyHeightPx(editor, shape) +
		NODE_ROW_BOTTOM_PADDING_PX +
		NODE_FOOTER_HEIGHT_PX
	)
}

export function getNodeTypePorts(editor: Editor, shape: NodeShape): Record<string, ShapePort> {
	return getNodeDefinition(editor, shape.props.node).getPorts(shape, shape.props.node)
}

/**
 * The ports a card of this type would have if one were created right now.
 *
 * Card definitions are handed the shape as well as the node, but only ever to
 * read the node back out of it, so a stand-in carrying the node answers the
 * question — which lets the on-canvas picker ask "could this card go here?"
 * without creating one first and deleting it again.
 */
export function getPortsForNodeType(editor: Editor, node: NodeType): Record<string, ShapePort> {
	const probe = { id: 'shape:probe', props: { node, isOutOfDate: false } } as unknown as NodeShape
	return getNodeDefinition(editor, node).getPorts(probe, node)
}

export async function executeNode(
	editor: Editor,
	shape: NodeShape,
	inputs: Record<string, string | number | null | (string | number | null)[]>
): Promise<ExecutionResult> {
	return await getNodeDefinition(editor, shape.props.node).execute(shape, shape.props.node, inputs)
}

export function getNodeOutputInfo(
	editor: Editor,
	shape: NodeShape,
	inputs: InfoValues
): InfoValues {
	return getNodeDefinition(editor, shape.props.node).getOutputInfo(shape, shape.props.node, inputs)
}

export function onNodePortConnect(editor: Editor, shape: NodeShape, port: PortId) {
	getNodeDefinition(editor, shape.props.node).onPortConnect?.(shape, shape.props.node, port)
}

export function onNodePortDisconnect(editor: Editor, shape: NodeShape, port: PortId) {
	getNodeDefinition(editor, shape.props.node).onPortDisconnect?.(shape, shape.props.node, port)
}

export function NodeBody({ shape }: { shape: NodeShape }) {
	const editor = useEditor()
	const node = shape.props.node
	const { Component } = getNodeDefinition(editor, node)
	return <Component shape={shape} node={node} />
}
