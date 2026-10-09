import classNames from 'classnames'
import { MousePointerClick } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import {
	NODE_FIELD_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
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
	NodeCardLabel,
	NodeComponentProps,
	NodeDefinition,
	NodeFieldRow,
	NodeRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * Click card — a browser action that clicks a target element.
 *
 * The element is a full field rather than a one-line input: what gets clicked is
 * described in words ("the 'Add to cart' button in the second row"), and a
 * description that has to fit on one line stops being a description.
 *
 * Five kinds of click, because these are the ones a test actually needs: the
 * plain one, a double, a run of clicks on a stepper or a "load more", the
 * right-click that opens a context menu, and a press-and-hold for a drag handle
 * or a long-press menu.
 */

export type ClickType = 'single' | 'double' | 'multiple' | 'right' | 'hold'

export type ClickNode = T.TypeOf<typeof ClickNode>
export const ClickNode = T.object({
	type: T.literal('click'),
	...CARD_BASE,
	target: T.string,
	clickType: T.literalEnum('single', 'double', 'multiple', 'right', 'hold'),
	/** How many clicks the Multiple type performs. */
	repeat: T.number.optional(),
	/** How long the Hold type keeps the button down, in ms. */
	holdMs: T.number.optional(),
	/** Legacy: superseded by `run`. Kept so older documents still load. */
	lastShot: LastShot,
})

export const CLICK_TYPE_OPTIONS = [
	{ value: 'single', label: 'Single' },
	{ value: 'double', label: 'Double' },
	{ value: 'multiple', label: 'Multiple' },
	{ value: 'right', label: 'Right' },
	{ value: 'hold', label: 'Hold' },
] as const

export const DEFAULT_HOLD_MS = 800
export const DEFAULT_REPEAT = 3

/** Clamped so a demo can't be sent off to click something 400 times. */
export function clampRepeat(n: number) {
	return Math.max(2, Math.min(20, Math.round(n) || DEFAULT_REPEAT))
}
export function clampHold(ms: number) {
	return Math.max(100, Math.min(10_000, Math.round(ms) || DEFAULT_HOLD_MS))
}

/** How many times this card clicks — only the Multiple type clicks more than once. */
export function clickCount(node: ClickNode) {
	return node.clickType === 'multiple' ? clampRepeat(node.repeat ?? DEFAULT_REPEAT) : 1
}

/** How the step reads in the run log and in the page toast. */
export function describeClick(node: ClickNode, target: string) {
	const times = clickCount(node)
	const base =
		node.clickType === 'single'
			? 'Click'
			: node.clickType === 'double'
				? 'Double-click'
				: node.clickType === 'right'
					? 'Right-click'
					: node.clickType === 'hold'
						? `Hold ${clampHold(node.holdMs ?? DEFAULT_HOLD_MS)}ms on`
						: 'Click'
	return `${base} “${target}”${times > 1 ? ` ×${times}` : ''}`
}

/**
 * The Click card is wider than the standard 260.
 *
 * Five click types on one segmented control measure 255px, and the row also
 * carries the 62px TYPE label, an 8px gap and 12px of padding either side —
 * 349px of card. At the standard width the control ran 77px past the card's
 * right edge. 360 fits it with a little room to spare, so a font that renders a
 * shade wider doesn't put it back over the edge.
 */
export const CLICK_CARD_WIDTH_PX = 360

/** Element field + the type row, and one more row when the type takes a number. */
const BODY_PX = NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX

/** Multiple needs a count and Hold needs a duration; the rest need nothing. */
function takesAnArgument(node: ClickNode) {
	return node.clickType === 'multiple' || node.clickType === 'hold'
}

export class ClickNodeDefinition extends NodeDefinition<ClickNode> {
	static type = 'click' as const
	static validator = ClickNode
	title = 'Click'
	heading = 'Click'
	icon = (<MousePointerClick size={15} />)
	category = 'browser'
	resultKeys = ['run'] as const
	getDefault(): ClickNode {
		return { type: 'click', target: '', clickType: 'single', lastShot: null }
	}
	getWidthPx() {
		return CLICK_CARD_WIDTH_PX
	}
	getBodyHeightPx(_shape: NodeShape, node: ClickNode) {
		// Five types plus a number do not fit on one row at the card's width —
		// measured at 142px of overflow — so the number gets its own.
		return BODY_PX + (takesAnArgument(node) ? NODE_ROW_HEIGHT_PX : 0)
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
			// the element can be handed in by a data card instead of typed
			element: {
				id: 'element',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX + NODE_FIELD_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'value',
			},
			output: {
				id: 'output',
				x: CLICK_CARD_WIDTH_PX,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'flow',
			},
		}
	}
	async execute(shape: NodeShape, node: ClickNode, inputs: InputValues): Promise<ExecutionResult> {
		const fromPort = getInputText(inputs, 'element', '')
		const target = kaneRuntime.resolve(fromPort || node.target) || 'element'
		const view = kaneRuntime.currentView
		const times = clickCount(node)
		const holdMs = clampHold(node.holdMs ?? DEFAULT_HOLD_MS)
		const started = performance.now()

		// Each repeat is its own action so the page animates every one of them,
		// and the run log reads as the several clicks it actually performs.
		for (let i = 1; i <= times; i++) {
			kaneRuntime.act({
				kind: 'click',
				target,
				clickType: node.clickType,
				holdMs: node.clickType === 'hold' ? holdMs : undefined,
				label:
					times > 1
						? `${describeClick(node, target)} — ${i}/${times}`
						: describeClick(node, target),
			})
			await runSleep(paced(node.clickType === 'hold' ? 350 + holdMs : 650))
		}

		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view,
			target,
			thought:
				`Located “${target}” on the page and confirmed it was visible and enabled. ` +
				(node.clickType === 'hold'
					? `Pressed and held for ${holdMs}ms, which is what this control needs to register.`
					: times > 1
						? `Clicked it ${times} times, waiting for the page to settle between each one.`
						: `Sent a ${node.clickType} click at its centre.`),
		})
		return { output: 'clicked' }
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
	Component = ClickNodeComponent
}

function ClickNodeComponent({ shape, node }: NodeComponentProps<ClickNode>) {
	const editor = useEditor()
	const set = (update: Partial<ClickNode>) =>
		updateNode<ClickNode>(editor, shape, (n) => ({ ...n, ...update }), false)

	return (
		<>
			<NodeFieldRow
				shapeId={shape.id}
				portId="element"
				label="ELEMENT"
				value={node.target}
				placeholder="Enter element"
				onChange={(target) => set({ target })}
			/>
			<NodeRow className="ClickNode-type-row">
				<NodeCardLabel>TYPE</NodeCardLabel>
				<span
					className="NodeSegmentedRow-options ClickNode-types"
					onPointerDown={(e) => e.stopPropagation()}
				>
					{CLICK_TYPE_OPTIONS.map((option) => (
						<button
							key={option.value}
							className={classNames('NodeSegmentedRow-option', {
								'NodeSegmentedRow-option_active': option.value === node.clickType,
							})}
							onClick={() => set({ clickType: option.value })}
						>
							{option.label}
						</button>
					))}
				</span>
			</NodeRow>

			{/* the one number the chosen type needs, on its own row */}
			{node.clickType === 'multiple' && (
				<NodeRow className="ClickNode-arg-row">
					<NodeCardLabel>TIMES</NodeCardLabel>
					<span className="ClickNode-arg" onPointerDown={(e) => e.stopPropagation()}>
						<input
							type="text"
							inputMode="numeric"
							aria-label="Number of clicks"
							value={String(node.repeat ?? DEFAULT_REPEAT)}
							onChange={(e) => {
								const parsed = Number(e.currentTarget.value.trim())
								if (Number.isNaN(parsed)) return
								set({ repeat: clampRepeat(parsed) })
							}}
							onFocus={() => editor.setSelectedShapes([shape.id])}
						/>
						<em>clicks in a row</em>
					</span>
				</NodeRow>
			)}
			{node.clickType === 'hold' && (
				<NodeRow className="ClickNode-arg-row">
					<NodeCardLabel>HOLD</NodeCardLabel>
					<span className="ClickNode-arg" onPointerDown={(e) => e.stopPropagation()}>
						<input
							type="text"
							inputMode="numeric"
							aria-label="Hold duration in milliseconds"
							value={String(node.holdMs ?? DEFAULT_HOLD_MS)}
							onChange={(e) => {
								const parsed = Number(e.currentTarget.value.trim())
								if (Number.isNaN(parsed)) return
								set({ holdMs: clampHold(parsed) })
							}}
							onFocus={() => editor.setSelectedShapes([shape.id])}
						/>
						<em>ms with the button down</em>
					</span>
				</NodeRow>
			)}
		</>
	)
}
