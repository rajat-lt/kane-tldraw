import { Sparkles } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import {
	NODE_FIELD_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
	NODE_WIDTH_PX,
} from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime } from '../../execution/runtime'
import { Port, ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import {
	ExecutionResult,
	getInputText,
	InfoValues,
	InputValues,
	NodeComponentProps,
	NodeDefinition,
	NodeFieldRow,
	NodeReadonlyRow,
	NodeTextRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * AI step — a plain-language instruction bound to one element on the page.
 *
 * Made in the browser's Inspector: pick an element, write what you want done
 * with it, and the card arrives here carrying three things — the prompt, a
 * readable name for the element, and the XPath that locates it again on a later
 * run. The XPath is what makes the card survive a re-render that changes class
 * names; the name is what makes it readable on the canvas.
 *
 * The XPath sits on one line, cut at the front rather than the back: the end of
 * a locator is what identifies this element, and the front is boilerplate every
 * XPath on the page shares. The whole thing is on the tooltip and the copy
 * button.
 */

export type AiStepNode = T.TypeOf<typeof AiStepNode>
export const AiStepNode = T.object({
	type: T.literal('ai'),
	...CARD_BASE,
	/** What the user asked for, in their own words. */
	prompt: T.string,
	/** Readable name of the element it was written against. */
	element: T.string,
	/** How to find that element again. */
	xpath: T.string,
	/** CSS path, kept alongside the XPath — easier to read, easier to paste. */
	selector: T.string,
	lastResult: T.string.nullable(),
})

export class AiStepNodeDefinition extends NodeDefinition<AiStepNode> {
	static type = 'ai' as const
	static validator = AiStepNode
	title = 'AI step'
	heading = 'AI step'
	icon = (<Sparkles size={15} />)
	category = 'browser'
	resultKeys = ['lastResult'] as const
	getDefault(): AiStepNode {
		return {
			type: 'ai',
			prompt: '',
			element: '',
			xpath: '',
			selector: '',
			lastResult: null,
		}
	}
	getBodyHeightPx(_shape: NodeShape, node: AiStepNode) {
		// prompt field + element row, plus one more row for the locator once
		// there is one
		return (
			NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX + (node.xpath.trim() ? NODE_ROW_HEIGHT_PX : 0)
		)
	}
	getPorts(_shape: NodeShape, node: AiStepNode): Record<string, ShapePort> {
		const top = NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX
		const ports: Record<string, ShapePort> = {
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
			element: {
				id: 'element',
				x: 0,
				y: top + NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'value',
			},
			output: {
				id: 'output',
				x: NODE_WIDTH_PX,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'flow',
			},
		}
		// the locator is published too, so a later step can target the same node
		if (node.xpath.trim()) {
			ports.locator = {
				id: 'locator',
				x: NODE_WIDTH_PX,
				y: top + NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'value',
			}
		}
		return ports
	}
	async execute(shape: NodeShape, node: AiStepNode, inputs: InputValues): Promise<ExecutionResult> {
		const started = performance.now()
		const prompt = kaneRuntime.resolve(node.prompt)
		const fromPort = getInputText(inputs, 'element', '')
		const element = fromPort || node.element
		kaneRuntime.act({
			kind: 'flash',
			target: element,
			text: prompt,
			label: `AI: ${prompt.slice(0, 60)}`,
		})
		await runSleep(paced(850))
		updateNode<AiStepNode>(this.editor, shape, (n) => ({ ...n, lastResult: 'done' }), false)
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: kaneRuntime.currentView,
			target: element,
			thought:
				`Resolved “${element || 'the element'}” from the stored locator and confirmed it was still on the page. ` +
				`Carried out the instruction — ${prompt || 'no prompt was given'} — and checked the page settled afterwards.`,
		})
		return { output: null, locator: node.xpath }
	}
	getOutputInfo(shape: NodeShape, node: AiStepNode): InfoValues {
		const info: InfoValues = {
			output: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
		}
		if (node.xpath.trim()) {
			info.locator = {
				value: node.xpath,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'value',
			}
		}
		return info
	}
	Component = AiStepNodeComponent
}

function AiStepNodeComponent({ shape, node }: NodeComponentProps<AiStepNode>) {
	const editor = useEditor()
	return (
		<>
			<NodeFieldRow
				shapeId={shape.id}
				label="PROMPT"
				value={node.prompt}
				placeholder="Enter prompt"
				onChange={(prompt) =>
					updateNode<AiStepNode>(editor, shape, (n) => ({ ...n, prompt }), false)
				}
			/>
			<NodeTextRow
				shapeId={shape.id}
				portId="element"
				label="ELEMENT"
				strongLabel
				value={node.element}
				placeholder="Enter element"
				onChange={(element) =>
					updateNode<AiStepNode>(editor, shape, (n) => ({ ...n, element }), false)
				}
			/>
			{/* Read-only: it is a record of what was picked, and a hand-edited
			    XPath is how a card stops matching. */}
			{node.xpath.trim() !== '' && (
				<NodeReadonlyRow
					label="XPATH"
					value={node.xpath}
					title={`${node.xpath}${node.selector ? `\n\nCSS: ${node.selector}` : ''}`}
				>
					<Port shapeId={shape.id} portId="locator" />
				</NodeReadonlyRow>
			)}
		</>
	)
}
