import { Braces } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import { NODE_HEADER_HEIGHT_PX, NODE_ROW_HEIGHT_PX } from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime } from '../../execution/runtime'
import { ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import { CodeEditor } from './CodeEditor'
import {
	cardBodyHeight,
	cardWidth,
	ExecutionResult,
	InfoValues,
	NodeComponentProps,
	NodeDefinition,
	recordRun,
	updateNode,
} from './shared'

/**
 * Javascript card — a snippet evaluated in the page, for the steps no other
 * card covers: reading something out of the DOM, scrolling a virtualised list,
 * stubbing a global before the next click.
 *
 * The whole card is the editor. It used to be two single-line fields — a code
 * box you couldn't read a line of, and a name to file the result under — which
 * made the one card meant for real code the worst place to write any. What the
 * snippet returns is published on the `result` port, so a later card consumes it
 * by being wired to it rather than by repeating a name.
 *
 * The snippet is not actually evaluated — this prototype has no page to
 * evaluate it in — so the result is a stand-in. Everything around it (the port,
 * the ordering, the value flowing on) behaves as it would.
 */

export type JsNode = T.TypeOf<typeof JsNode>
export const JsNode = T.object({
	type: T.literal('js'),
	...CARD_BASE,
	code: T.string,
	/**
	 * Kept for documents saved before the card became a single editor: the name
	 * the result was filed under. Still honoured at run time when it is there,
	 * but nothing writes it any more.
	 */
	resultName: T.string.optional(),
	lastResult: T.string.nullable(),
	w: T.number.optional(),
	h: T.number.optional(),
})

/** Tall enough for a handful of lines before anyone has to drag it. */
const NATURAL_BODY_PX = NODE_ROW_HEIGHT_PX * 3

export class JsNodeDefinition extends NodeDefinition<JsNode> {
	static type = 'js' as const
	static validator = JsNode
	title = 'Javascript'
	heading = 'Javascript'
	icon = (<Braces size={15} />)
	category = 'browser'
	resultKeys = ['lastResult'] as const
	canResizeNode = true
	getDefault(): JsNode {
		return {
			type: 'js',
			code: 'const tiles = document.querySelectorAll(".tile")\nreturn tiles.length',
			lastResult: null,
		}
	}
	getWidthPx(_shape: NodeShape, node: JsNode) {
		return cardWidth(node)
	}
	getBodyHeightPx(_shape: NodeShape, node: JsNode) {
		return cardBodyHeight(node, NATURAL_BODY_PX)
	}
	getPorts(_shape: NodeShape, node: JsNode): Record<string, ShapePort> {
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
			result: {
				id: 'result',
				x: width,
				y: NODE_HEADER_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'value',
			},
		}
	}
	async execute(shape: NodeShape, node: JsNode): Promise<ExecutionResult> {
		const started = performance.now()
		const code = kaneRuntime.resolve(node.code)
		kaneRuntime.act({
			kind: 'flash',
			label: 'Ran a snippet',
			text: code,
		})
		await runSleep(paced(600))
		// stands in for whatever the snippet would have returned
		const result = String(code.length % 97)
		if (node.resultName?.trim()) kaneRuntime.setValue(node.resultName, result)
		updateNode<JsNode>(this.editor, shape, (n) => ({ ...n, lastResult: result }), false)
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: kaneRuntime.currentView,
			thought:
				`Evaluated ${code.split('\n').length} line${code.split('\n').length === 1 ? '' : 's'} in the page and took what it returned. ` +
				'Nothing was clicked or typed — the snippet only read and reported.',
		})
		return { output: null, result }
	}
	getOutputInfo(shape: NodeShape, node: JsNode): InfoValues {
		return {
			output: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
			result: {
				value: node.lastResult,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'value',
			},
		}
	}
	Component = JsNodeComponent
}

function JsNodeComponent({ shape, node }: NodeComponentProps<JsNode>) {
	const editor = useEditor()
	return (
		<CodeEditor
			shape={shape}
			value={node.code}
			placeholder="return document.title"
			onChange={(code) => updateNode<JsNode>(editor, shape, (n) => ({ ...n, code }), false)}
		/>
	)
}
