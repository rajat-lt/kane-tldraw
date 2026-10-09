import { TextCursorInput } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import {
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
	NODE_WIDTH_PX,
} from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime } from '../../execution/runtime'
import { ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import { LastShot } from './lastShot'
import {
	ExecutionResult,
	getInputText,
	InfoValues,
	InputValues,
	NodeCheckboxRow,
	NodeComponentProps,
	NodeDefinition,
	NodeTextRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * Input box card — types text into a field in the browser.
 *
 * Both halves can come from elsewhere: the element through its own value port,
 * and the text through the `text` port (a Parameter / Secret / TOTP / Variable
 * card), which is how a password reaches a login form without being written on
 * the canvas.
 */

export type InputNode = T.TypeOf<typeof InputNode>
export const InputNode = T.object({
	type: T.literal('input'),
	...CARD_BASE,
	target: T.string,
	text: T.string,
	pressEnter: T.boolean,
	/** Legacy: superseded by `run`. Kept so older documents still load. */
	lastShot: LastShot,
})

/** Element · Text · the Enter checkbox. */
const BODY_PX = NODE_ROW_HEIGHT_PX * 3

const rowY = (i: number) =>
	NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX + i * NODE_ROW_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2

export class InputNodeDefinition extends NodeDefinition<InputNode> {
	static type = 'input' as const
	static validator = InputNode
	title = 'Input box'
	heading = 'Input Box'
	icon = (<TextCursorInput size={15} />)
	category = 'browser'
	resultKeys = ['run'] as const
	getDefault(): InputNode {
		return { type: 'input', target: '', text: '', pressEnter: false, lastShot: null }
	}
	getBodyHeightPx() {
		return BODY_PX
	}
	getPorts(): Record<string, ShapePort> {
		return {
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
			element: { id: 'element', x: 0, y: rowY(0), terminal: 'end', dataType: 'value' },
			text: { id: 'text', x: 0, y: rowY(1), terminal: 'end', dataType: 'value' },
			output: {
				id: 'output',
				x: NODE_WIDTH_PX,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'flow',
			},
		}
	}
	async execute(shape: NodeShape, node: InputNode, inputs: InputValues): Promise<ExecutionResult> {
		const started = performance.now()
		const fromElementPort = getInputText(inputs, 'element', '')
		const target = kaneRuntime.resolve(fromElementPort || node.target) || 'field'
		const fromPort = getInputText(inputs, 'text', '')
		const text = kaneRuntime.resolve(fromPort || node.text)
		const view = kaneRuntime.currentView
		kaneRuntime.act({ kind: 'type', target, text, label: `Type into “${target}”` })
		await runSleep(paced(700))
		if (node.pressEnter) {
			kaneRuntime.act({ kind: 'press', text: 'Enter', label: 'Press Enter' })
			await runSleep(paced(300))
		}
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view,
			target,
			thought:
				`Focused “${target}”, cleared what was in it and typed ${text ? `${text.length} character${text.length === 1 ? '' : 's'}` : 'nothing — the text was empty'}. ` +
				(fromPort
					? 'The text came in through the port rather than from the card.'
					: node.pressEnter
						? 'Enter was pressed afterwards, which is what submits this form.'
						: 'No Enter was sent, so the form is still waiting.'),
		})
		return { output: text }
	}
	getOutputInfo(shape: NodeShape): InfoValues {
		return {
			output: {
				value: null,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'flow',
			},
		}
	}
	Component = InputNodeComponent
}

function InputNodeComponent({ shape, node }: NodeComponentProps<InputNode>) {
	const editor = useEditor()
	return (
		<>
			<NodeTextRow
				shapeId={shape.id}
				portId="element"
				label="ELEMENT"
				strongLabel
				value={node.target}
				placeholder="Enter element"
				onChange={(target) => updateNode<InputNode>(editor, shape, (n) => ({ ...n, target }), false)}
			/>
			<NodeTextRow
				shapeId={shape.id}
				portId="text"
				label="TEXT"
				strongLabel
				value={node.text}
				placeholder="Enter text"
				onChange={(text) => updateNode<InputNode>(editor, shape, (n) => ({ ...n, text }), false)}
			/>
			<NodeCheckboxRow
				shapeId={shape.id}
				label="Press Enter after Typing"
				checked={node.pressEnter}
				onChange={(pressEnter) =>
					updateNode<InputNode>(editor, shape, (n) => ({ ...n, pressEnter }))
				}
			/>
		</>
	)
}
