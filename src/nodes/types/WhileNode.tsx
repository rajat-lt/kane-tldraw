import { Minus, Plus, RefreshCw } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import {
	NODE_FIELD_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
} from '../../constants'
import { runSleep } from '../../execution/runControl'
import { CONDITION_OPS, evalCondition, kaneRuntime, KaneCondition } from '../../execution/runtime'
import { Port, ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import {
	cardBodyHeight,
	cardWidth,
	ExecutionResult,
	InfoValues,
	NodeCardLabel,
	NodeComponentProps,
	NodeDefinition,
	NodeRow,
	recordRun,
	updateNode,
} from './shared'

/**
 * While loop card — repeats its Loop branch while the condition holds, capped by
 * Max.
 *
 * Loop is the body: it runs once per iteration and is where the repeated work
 * hangs. Done is what happens after the loop ends. They are two different
 * continuations, which is why the card has both — without Loop there is nothing
 * to repeat, and without Done the test has nowhere to go afterwards.
 *
 * The condition is written in plain English or as operand → operator → operand,
 * switched from the card's Settings tab.
 */

export type WhileNode = T.TypeOf<typeof WhileNode>
export const WhileNode = T.object({
	type: T.literal('while'),
	...CARD_BASE,
	/** How the condition is authored. Absent on older documents = 'nl'. */
	mode: T.literalEnum('nl', 'structured').optional(),
	condition: T.string,
	left: T.string.optional(),
	op: T.string.optional(),
	right: T.string.optional(),
	maxIterations: T.number,
	lastIterations: T.number.nullable(),
	w: T.number.optional(),
	h: T.number.optional(),
})

export const MAX_ITERATIONS_LIMIT = 10

/** Condition field · Max · Loop · Done. */
const NATURAL_BODY_PX = NODE_FIELD_HEIGHT_PX + NODE_ROW_HEIGHT_PX * 3

function conditionOf(node: WhileNode): KaneCondition {
	return {
		mode: node.mode ?? 'nl',
		nl: node.condition,
		left: node.left ?? '',
		op: node.op ?? '==',
		right: node.right ?? '',
	}
}

export class WhileNodeDefinition extends NodeDefinition<WhileNode> {
	static type = 'while' as const
	static validator = WhileNode
	title = 'While loop'
	heading = 'While'
	icon = (<RefreshCw size={15} />)
	category = 'logic'
	resultKeys = ['lastIterations'] as const
	canResizeNode = true
	getDefault(): WhileNode {
		return {
			type: 'while',
			mode: 'nl',
			condition: '',
			maxIterations: 5,
			lastIterations: null,
		}
	}
	getWidthPx(_shape: NodeShape, node: WhileNode) {
		return cardWidth(node)
	}
	getBodyHeightPx(_shape: NodeShape, node: WhileNode) {
		return cardBodyHeight(node, NATURAL_BODY_PX)
	}
	getPorts(shape: NodeShape, node: WhileNode): Record<string, ShapePort> {
		const width = cardWidth(node)
		// extra height from a resize goes to the condition field, so the three
		// fixed rows below it keep their positions
		const extra = Math.max(0, this.getBodyHeightPx(shape, node) - NATURAL_BODY_PX)
		const fieldH = NODE_FIELD_HEIGHT_PX + extra
		const top = NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX
		const rowY = (i: number) => top + fieldH + i * NODE_ROW_HEIGHT_PX + NODE_ROW_HEIGHT_PX / 2

		return {
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
			condition: {
				id: 'condition',
				x: 0,
				y: top + fieldH / 2,
				terminal: 'end',
				dataType: 'value',
			},
			max: { id: 'max', x: 0, y: rowY(0), terminal: 'end', dataType: 'value' },
			body: { id: 'body', x: width, y: rowY(1), terminal: 'start', dataType: 'flow' },
			done: { id: 'done', x: width, y: rowY(2), terminal: 'start', dataType: 'flow' },
		}
	}
	async execute(shape: NodeShape, node: WhileNode): Promise<ExecutionResult> {
		const max = Math.max(1, Math.min(MAX_ITERATIONS_LIMIT, Math.round(node.maxIterations) || 1))
		const started = performance.now()
		let iterations = 0
		let hitCap = false

		for (let i = 1; i <= max; i++) {
			if (!evalCondition(conditionOf(node))) break
			iterations = i
			if (i === max) hitCap = true
			updateNode<WhileNode>(this.editor, shape, (n) => ({ ...n, lastIterations: i }), false)
			kaneRuntime.act({ kind: 'flash', label: `Loop iteration ${i}/${max}` })
			await runSleep(paced(450))
		}

		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: kaneRuntime.currentView,
			thought:
				iterations === 0
					? 'The condition did not hold on the first check, so the body never ran and control went straight to Done.'
					: `Re-checked the condition before each pass and ran the body ${iterations} time${iterations === 1 ? '' : 's'}. ` +
						(hitCap
							? `That is the Max, so the loop stopped there rather than carrying on.`
							: `The condition stopped holding, which is what ended the loop.`),
		})
		return { body: iterations > 0 ? 'ok' : null, done: 'ok' }
	}
	getOutputInfo(shape: NodeShape): InfoValues {
		return {
			body: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
			done: { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' },
		}
	}
	Component = WhileNodeComponent
}

function WhileNodeComponent({ shape, node }: NodeComponentProps<WhileNode>) {
	const editor = useEditor()
	const structured = (node.mode ?? 'nl') === 'structured'
	const set = (update: Partial<WhileNode>) =>
		updateNode<WhileNode>(editor, shape, (n) => ({ ...n, ...update }), false)
	const setMax = (value: number) =>
		updateNode<WhileNode>(editor, shape, (n) => ({
			...n,
			maxIterations: Math.max(1, Math.min(MAX_ITERATIONS_LIMIT, value)),
		}))

	return (
		<>
			<NodeRow className="NodeFieldRow WhileNode-cond-row">
				<Port shapeId={shape.id} portId="condition" />
				<NodeCardLabel>WHILE</NodeCardLabel>
				{structured ? (
					<span className="IfElseNode-structured" onPointerDown={(e) => e.stopPropagation()}>
						<input
							type="text"
							value={node.left ?? ''}
							placeholder="operand"
							onChange={(e) => set({ left: e.currentTarget.value })}
							onFocus={() => editor.setSelectedShapes([shape.id])}
						/>
						<select
							value={node.op ?? '=='}
							onChange={(e) => set({ op: e.currentTarget.value })}
						>
							{CONDITION_OPS.map((op) => (
								<option key={op} value={op}>
									{op}
								</option>
							))}
						</select>
						<input
							type="text"
							value={node.right ?? ''}
							placeholder="operand"
							onChange={(e) => set({ right: e.currentTarget.value })}
							onFocus={() => editor.setSelectedShapes([shape.id])}
						/>
					</span>
				) : (
					<textarea
						className="NodeFieldRow-input"
						value={node.condition}
						placeholder="Enter condition"
						spellCheck={false}
						onChange={(e) => set({ condition: e.currentTarget.value })}
						onPointerDown={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						onFocus={() => editor.setSelectedShapes([shape.id])}
					/>
				)}
			</NodeRow>

			<NodeRow className="WhileNode-max-row">
				<Port shapeId={shape.id} portId="max" />
				<NodeCardLabel>MAX</NodeCardLabel>
				<input
					type="text"
					inputMode="numeric"
					className="WhileNode-max"
					aria-label="Maximum iterations"
					value={String(node.maxIterations)}
					onChange={(e) => {
						const parsed = Number(e.currentTarget.value.trim())
						if (Number.isNaN(parsed)) return
						setMax(parsed)
					}}
					onPointerDown={(e) => e.stopPropagation()}
					onFocus={() => editor.setSelectedShapes([shape.id])}
				/>
				<span className="WhileNode-stepper" onPointerDown={(e) => e.stopPropagation()}>
					<button
						aria-label="Fewer iterations"
						disabled={node.maxIterations <= 1}
						onClick={() => setMax(node.maxIterations - 1)}
					>
						<Minus size={14} />
					</button>
					<button
						aria-label="More iterations"
						disabled={node.maxIterations >= MAX_ITERATIONS_LIMIT}
						onClick={() => setMax(node.maxIterations + 1)}
					>
						<Plus size={14} />
					</button>
				</span>
			</NodeRow>

			<NodeRow className="WhileNode-branch-row">
				<NodeCardLabel>LOOP</NodeCardLabel>
				<span className="IfElseNode-else-hint">
					{node.lastIterations
						? `Ran ${node.lastIterations}×`
						: 'Steps which run on each iteration'}
				</span>
				<Port shapeId={shape.id} portId="body" />
			</NodeRow>
			<NodeRow className="WhileNode-branch-row">
				<NodeCardLabel>DONE</NodeCardLabel>
				<span className="IfElseNode-else-hint">Steps to run after all iterations</span>
				<Port shapeId={shape.id} portId="done" />
			</NodeRow>
		</>
	)
}
