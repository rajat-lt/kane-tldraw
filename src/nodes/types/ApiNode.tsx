import { Webhook } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import { NODE_HEADER_HEIGHT_PX, NODE_ROW_HEIGHT_PX } from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime } from '../../execution/runtime'
import { ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import {
	cardBodyHeight,
	cardWidth,
	ExecutionResult,
	InfoValues,
	NodeComponentProps,
	NodeDefinition,
	NodeSegmentedRow,
	NodeTextRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * API card — calls an endpoint as a step in the workflow.
 *
 * Not every assertion is worth driving through the UI: seeding a fixture,
 * reading back what the page just wrote, or checking a webhook fired are all
 * faster and steadier as a direct request. The call is announced to the runtime
 * like any browser action, so it also shows up in the Network pane alongside
 * the page's own traffic.
 *
 * Like every other card here, it doesn't reach the network — the prototype has
 * no backend. The status it reports is derived from the method.
 */

export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type ApiMethod = (typeof API_METHODS)[number]

export type ApiNode = T.TypeOf<typeof ApiNode>
export const ApiNode = T.object({
	type: T.literal('api'),
	...CARD_BASE,
	method: T.literalEnum(...API_METHODS),
	url: T.string,
	body: T.string,
	/** Status of the last run, or null before it has run. */
	lastStatus: T.number.nullable(),
	w: T.number.optional(),
	h: T.number.optional(),
})

/** Method row + URL row, then a body worth a few lines. */
const NATURAL_BODY_PX = NODE_ROW_HEIGHT_PX * 2 + 92

/** Methods that carry a request body. */
function hasBody(method: ApiMethod) {
	return method !== 'GET' && method !== 'DELETE'
}

/** What a method would plausibly answer with when it succeeds. */
function statusFor(method: ApiMethod): number {
	if (method === 'POST') return 201
	if (method === 'DELETE') return 204
	return 200
}

export class ApiNodeDefinition extends NodeDefinition<ApiNode> {
	static type = 'api' as const
	static validator = ApiNode
	title = 'API request'
	heading = 'API request'
	icon = (<Webhook size={15} />)
	category = 'browser'
	resultKeys = ['lastStatus'] as const
	canResizeNode = true
	getDefault(): ApiNode {
		return {
			type: 'api',
			method: 'GET',
			url: 'https://api.lambdatest.com/v1/tests',
			body: '',
			lastStatus: null,
		}
	}
	getWidthPx(_shape: NodeShape, node: ApiNode) {
		return cardWidth(node)
	}
	/**
	 * The body slot is always there, even for a GET — the way a request client
	 * always shows one. Hiding it made the card change height whenever the method
	 * changed, and left a resized card with nowhere to put the extra room.
	 */
	getBodyHeightPx(_shape: NodeShape, node: ApiNode) {
		return cardBodyHeight(node, NATURAL_BODY_PX)
	}
	getPorts(_shape: NodeShape, node: ApiNode): Record<string, ShapePort> {
		const width = cardWidth(node)
		return {
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
			output: {
				id: 'output',
				x: width,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'flow',
			},
			// the status, for a downstream If/Else to assert on
			status: {
				id: 'status',
				x: width,
				y: NODE_HEADER_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'value',
			},
		}
	}
	async execute(shape: NodeShape, node: ApiNode): Promise<ExecutionResult> {
		const started = performance.now()
		const url = kaneRuntime.resolve(node.url)
		const body = hasBody(node.method) ? kaneRuntime.resolve(node.body) : ''
		const status = statusFor(node.method)
		kaneRuntime.act({
			kind: 'api',
			method: node.method,
			url,
			text: body,
			status,
			label: `${node.method} ${url}`,
		})
		await runSleep(paced(700))
		updateNode<ApiNode>(this.editor, shape, (n) => ({ ...n, lastStatus: status }), false)
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: kaneRuntime.currentView,
			target: url,
			thought:
				`Sent a ${node.method} to ${url}${body ? ' with the request body from the card' : ''} and got ${status} back. ` +
				'The call went out beside the page\u2019s own traffic, so it is in the Network pane too.',
		})
		return { output: url, status }
	}
	getOutputInfo(shape: NodeShape, node: ApiNode): InfoValues {
		return {
			output: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
			status: {
				value: node.lastStatus,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'value',
			},
		}
	}
	Component = ApiNodeComponent
}

function ApiNodeComponent({ shape, node }: NodeComponentProps<ApiNode>) {
	const editor = useEditor()
	const bodyAllowed = hasBody(node.method)
	return (
		<>
			<NodeSegmentedRow
				options={API_METHODS.map((m) => ({ value: m, label: m }))}
				value={node.method}
				onChange={(method) =>
					updateNode<ApiNode>(editor, shape, (n) => ({ ...n, method }), false)
				}
			/>
			<NodeTextRow
				shapeId={shape.id}
				label="URL"
				value={node.url}
				placeholder="https://api.example.com/resource"
				onChange={(url) => updateNode<ApiNode>(editor, shape, (n) => ({ ...n, url }), false)}
			/>
			<div className="NodeBodyArea">
				<span className="NodeBodyArea-label">
					Body
					{!bodyAllowed && <em> — {node.method} sends none</em>}
				</span>
				<textarea
					className="NodeBodyArea-input"
					value={bodyAllowed ? node.body : ''}
					disabled={!bodyAllowed}
					spellCheck={false}
					placeholder={bodyAllowed ? '{\n  "key": "value"\n}' : ''}
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
					onFocus={() => editor.setSelectedShapes([shape.id])}
					onChange={(e) => {
						const body = e.currentTarget.value
						updateNode<ApiNode>(editor, shape, (n) => ({ ...n, body }), false)
					}}
				/>
			</div>
		</>
	)
}
