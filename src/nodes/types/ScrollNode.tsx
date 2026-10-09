import classNames from 'classnames'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Move } from 'lucide-react'
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
	NodeCardLabel,
	NodeComponentProps,
	NodeDefinition,
	NodeFieldRow,
	NodeRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * Scroll card — moves a scrollable region, in any of the four directions, by a
 * percentage of its own size or by a number of pixels.
 *
 * It has no slash command on purpose. A scroll is only meaningful against
 * something that scrolls, and the two ways of knowing what that is are both
 * already in the app: scrolling the page while Record is on (the page reports
 * the element that actually moved, and it lands in ELEMENT) or asking for one in
 * the omnibox. Adding it from a blank menu would have produced a card pointing
 * at nothing. An empty ELEMENT means the page itself.
 */

export type ScrollDirection = 'down' | 'up' | 'left' | 'right'
export type ScrollUnit = '%' | 'px'

export type ScrollNode = T.TypeOf<typeof ScrollNode>
export const ScrollNode = T.object({
	type: T.literal('scroll'),
	...CARD_BASE,
	direction: T.literalEnum('down', 'up', 'left', 'right'),
	amount: T.number,
	unit: T.literalEnum('%', 'px'),
	/** What scrolls — a selector or a description, or empty for the page itself. */
	container: T.string,
	/** Whether the page reported this element, rather than someone typing it. */
	detected: T.boolean.optional(),
})

export const SCROLL_DIRECTIONS: { value: ScrollDirection; label: string; icon: typeof ArrowDown }[] =
	[
		{ value: 'up', label: 'Up', icon: ArrowUp },
		{ value: 'down', label: 'Down', icon: ArrowDown },
		{ value: 'left', label: 'Left', icon: ArrowLeft },
		{ value: 'right', label: 'Right', icon: ArrowRight },
	]

/** The page itself, when no element was singled out. */
export const PAGE_CONTAINER = 'the page'

export function scrollContainerLabel(node: ScrollNode) {
	return node.container.trim() || PAGE_CONTAINER
}

/** Element field · direction · value. */
const BODY_PX = NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX * 2

export class ScrollNodeDefinition extends NodeDefinition<ScrollNode> {
	static type = 'scroll' as const
	static validator = ScrollNode
	title = 'Scroll'
	heading = 'Scroll'
	icon = (<Move size={15} />)
	category = 'browser'
	resultKeys = ['run'] as const
	/** Not offered in the slash palette or the toolbar — see the note above. */
	hidden = true
	getDefault(): ScrollNode {
		return {
			type: 'scroll',
			direction: 'down',
			amount: 20,
			unit: '%',
			container: '',
			detected: false,
		}
	}
	getBodyHeightPx() {
		return BODY_PX
	}
	getPorts(): Record<string, ShapePort> {
		const top = NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX
		return {
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
				y: top + NODE_FIELD_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'value',
			},
			value: {
				id: 'value',
				x: 0,
				y: top + NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2,
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
	}
	async execute(shape: NodeShape, node: ScrollNode, inputs: InputValues): Promise<ExecutionResult> {
		const started = performance.now()
		const fromElement = getInputText(inputs, 'element', '')
		const container = kaneRuntime.resolve(fromElement || node.container)
		const fromValue = Number(getInputText(inputs, 'value', ''))
		const amount = Number.isFinite(fromValue) && fromValue > 0 ? fromValue : node.amount
		kaneRuntime.act({
			kind: 'scroll',
			direction: node.direction,
			amount,
			unit: node.unit,
			container,
			label: `Scroll ${node.direction} ${amount}${node.unit} in ${container || PAGE_CONTAINER}`,
		})
		await runSleep(paced(600))
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: kaneRuntime.currentView,
			target: container || PAGE_CONTAINER,
			thought:
				`Found ${container ? `“${container}”` : 'the page'} to be the scrollable region and moved it ${node.direction} by ${amount}${node.unit}` +
				(node.unit === '%' ? ' of its own visible size.' : '.') +
				' Waited for the scroll to settle before handing on.',
		})
		return { output: 'scrolled' }
	}
	getOutputInfo(shape: NodeShape): InfoValues {
		return {
			output: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
		}
	}
	Component = ScrollNodeComponent
}

function ScrollNodeComponent({ shape, node }: NodeComponentProps<ScrollNode>) {
	const editor = useEditor()
	const set = (update: Partial<ScrollNode>) =>
		updateNode<ScrollNode>(editor, shape, (n) => ({ ...n, ...update }), false)

	return (
		<>
			<NodeFieldRow
				shapeId={shape.id}
				portId="element"
				label="ELEMENT"
				value={node.container}
				placeholder="Enter element"
				onChange={(container) => set({ container, detected: false })}
			/>

			<NodeRow className="ScrollNode-dir-row">
				<NodeCardLabel>SCROLL</NodeCardLabel>
				<span
					className="NodeSegmentedRow-options ScrollNode-dirs"
					onPointerDown={(e) => e.stopPropagation()}
				>
					{SCROLL_DIRECTIONS.map((d) => {
						const Icon = d.icon
						return (
							<button
								key={d.value}
								className={classNames('NodeSegmentedRow-option', 'ScrollNode-dir', {
									'NodeSegmentedRow-option_active': node.direction === d.value,
								})}
								title={d.label}
								aria-label={d.label}
								aria-pressed={node.direction === d.value}
								onClick={() => set({ direction: d.value })}
							>
								<Icon size={14} />
							</button>
						)
					})}
				</span>
			</NodeRow>

			<NodeRow className="ScrollNode-value-row">
				<Port shapeId={shape.id} portId="value" />
				<NodeCardLabel>VALUE</NodeCardLabel>
				<input
					type="text"
					inputMode="numeric"
					className="ScrollNode-amount"
					aria-label="Scroll amount"
					value={String(node.amount)}
					onChange={(e) => {
						const parsed = Number(e.currentTarget.value.trim())
						if (Number.isNaN(parsed)) return
						set({ amount: Math.max(0, Math.round(parsed)) })
					}}
					onPointerDown={(e) => e.stopPropagation()}
					onFocus={() => editor.setSelectedShapes([shape.id])}
				/>
				<span
					className="NodeSegmentedRow-options ScrollNode-units"
					onPointerDown={(e) => e.stopPropagation()}
				>
					{(['%', 'px'] as const).map((u) => (
						<button
							key={u}
							className={classNames('NodeSegmentedRow-option', {
								'NodeSegmentedRow-option_active': node.unit === u,
							})}
							onClick={() => set({ unit: u })}
						>
							{u}
						</button>
					))}
				</span>
			</NodeRow>
		</>
	)
}
