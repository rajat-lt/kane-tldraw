import classNames from 'classnames'
import { CirclePlus, Split, X } from 'lucide-react'
import { Editor, T, useEditor } from 'tldraw'
import {
	NODE_FIELD_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
} from '../../constants'
import { runSleep } from '../../execution/runControl'
import { CONDITION_OPS, evalCondition, KaneCondition } from '../../execution/runtime'
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
	STOP_EXECUTION,
	updateNode,
} from './shared'

/**
 * If / Else-If / Else card.
 *
 * Each block is a condition with its own outgoing branch; the Else branch is
 * always there and takes over when none of them matched. Conditions are written
 * in plain English or as operand → operator → operand — the whole card switches
 * between the two from its Settings tab.
 */

const ConditionBlock = T.object({
	nl: T.string,
	left: T.string,
	op: T.string,
	right: T.string,
})
type ConditionBlock = T.TypeOf<typeof ConditionBlock>

export type IfElseNode = T.TypeOf<typeof IfElseNode>
export const IfElseNode = T.object({
	type: T.literal('ifelse'),
	...CARD_BASE,
	mode: T.literalEnum('nl', 'structured'),
	blocks: T.arrayOf(ConditionBlock),
	lastTaken: T.number.nullable(),
	w: T.number.optional(),
	h: T.number.optional(),
})

export const MAX_ELSE_IF_BLOCKS = 5

/**
 * Whether another Else-If can still be added. `blocks[0]` is the If itself, so
 * the card is full at 1 + {@link MAX_ELSE_IF_BLOCKS} blocks — at which point the
 * add row goes away entirely rather than sitting there greyed out, since a
 * control that can never be used again is just a row of wasted card.
 */
export function canAddElseIf(node: IfElseNode): boolean {
	return node.blocks.length <= MAX_ELSE_IF_BLOCKS
}

/** What the rows need: a field per condition, the add row if it's there, Else. */
function naturalBodyPx(node: IfElseNode): number {
	return (
		node.blocks.length * NODE_FIELD_HEIGHT_PX +
		NODE_ROW_HEIGHT_PX * (canAddElseIf(node) ? 2 : 1)
	)
}

function blockCondition(node: IfElseNode, block: ConditionBlock): KaneCondition {
	return { mode: node.mode, nl: block.nl, left: block.left, op: block.op, right: block.right }
}

/** What a block reads as, for the run log and the Thought tab. */
function describeBlock(node: IfElseNode, block: ConditionBlock) {
	return node.mode === 'structured'
		? `${block.left} ${block.op} ${block.right}`.trim()
		: block.nl.trim()
}

export class IfElseNodeDefinition extends NodeDefinition<IfElseNode> {
	static type = 'ifelse' as const
	static validator = IfElseNode
	title = 'If / Else'
	heading = 'If / Else'
	icon = (<Split size={15} />)
	category = 'logic'
	resultKeys = ['lastTaken'] as const
	canResizeNode = true
	getDefault(): IfElseNode {
		return {
			type: 'ifelse',
			mode: 'nl',
			blocks: [{ nl: '', left: '', op: '==', right: '' }],
			lastTaken: null,
		}
	}
	getWidthPx(_shape: NodeShape, node: IfElseNode) {
		return cardWidth(node)
	}
	/** a field per condition, then the add-branch row, then Else */
	getBodyHeightPx(_shape: NodeShape, node: IfElseNode) {
		return cardBodyHeight(node, naturalBodyPx(node))
	}
	getPorts(shape: NodeShape, node: IfElseNode): Record<string, ShapePort> {
		const width = cardWidth(node)
		const ports: Record<string, ShapePort> = {
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
		}
		// The condition fields carry any extra height the card was dragged to
		// (`flex: 1` in the CSS); the add-branch and Else rows keep theirs.
		const extra = Math.max(0, this.getBodyHeightPx(shape, node) - naturalBodyPx(node))
		const fieldH = NODE_FIELD_HEIGHT_PX + extra / node.blocks.length
		const top = NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX

		node.blocks.forEach((_, i) => {
			const y = top + i * fieldH + fieldH / 2
			ports[`out${i}`] = { id: `out${i}`, x: width, y, terminal: 'start', dataType: 'flow' }
			ports[`cond${i}`] = { id: `cond${i}`, x: 0, y, terminal: 'end', dataType: 'value' }
		})
		// Else sits after the fields, and after the add row when there is one.
		const addRowPx = canAddElseIf(node) ? NODE_ROW_HEIGHT_PX : 0
		ports.else = {
			id: 'else',
			x: width,
			y: top + node.blocks.length * fieldH + addRowPx + NODE_ROW_HEIGHT_PX / 2,
			terminal: 'start',
			dataType: 'flow',
		}
		return ports
	}
	async execute(shape: NodeShape, node: IfElseNode): Promise<ExecutionResult> {
		const started = performance.now()
		await runSleep(paced(450))
		let taken = -1
		for (let i = 0; i < node.blocks.length; i++) {
			if (evalCondition(blockCondition(node, node.blocks[i]))) {
				taken = i
				break
			}
		}
		updateNode<IfElseNode>(this.editor, shape, (n) => ({ ...n, lastTaken: taken }), false)
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: 'dashboard',
			thought:
				taken === -1
					? `Checked ${node.blocks.length} condition${node.blocks.length === 1 ? '' : 's'} against the page and none of them held, so the Else branch is the one that runs.`
					: `“${describeBlock(node, node.blocks[taken]) || 'the condition'}” held, so branch ${taken + 1} is the one that runs. The remaining branches were left untouched.`,
		})
		const result: ExecutionResult = {}
		node.blocks.forEach((_, i) => {
			result[`out${i}`] = i === taken ? 'true' : STOP_EXECUTION
		})
		result.else = taken === -1 ? 'true' : STOP_EXECUTION
		return result
	}
	getOutputInfo(shape: NodeShape, node: IfElseNode): InfoValues {
		const info: InfoValues = {}
		node.blocks.forEach((_, i) => {
			info[`out${i}`] = {
				value: null,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'flow',
			}
		})
		info.else = { value: null, isOutOfDate: shape.props.isOutOfDate, dataType: 'flow' }
		return info
	}
	Component = IfElseNodeComponent
}

/** Add an Else-If block (up to {@link MAX_ELSE_IF_BLOCKS}). */
export function addElseIfBlock(editor: Editor, shape: NodeShape) {
	updateNode<IfElseNode>(editor, shape, (n) => {
		if (n.blocks.length > MAX_ELSE_IF_BLOCKS) return n
		return {
			...n,
			blocks: [...n.blocks, { nl: '', left: '', op: '==', right: '' }],
			lastTaken: null,
		}
	})
}

/** Remove one Else-If block. The If block always stays. */
export function removeElseIfBlock(editor: Editor, shape: NodeShape, index: number) {
	updateNode<IfElseNode>(editor, shape, (n) => {
		if (n.blocks.length <= 1 || index === 0) return n
		return { ...n, blocks: n.blocks.filter((_, i) => i !== index), lastTaken: null }
	})
}

function IfElseNodeComponent({ shape, node }: NodeComponentProps<IfElseNode>) {
	const editor = useEditor()
	const canAdd = canAddElseIf(node)

	const setBlock = (index: number, update: Partial<ConditionBlock>) => {
		updateNode<IfElseNode>(
			editor,
			shape,
			(n) => ({
				...n,
				blocks: n.blocks.map((b, i) => (i === index ? { ...b, ...update } : b)),
			}),
			false
		)
	}

	return (
		<>
			{node.blocks.map((block, i) => (
				<NodeRow
					key={i}
					className={classNames('IfElseNode-row', 'NodeFieldRow', {
						'IfElseNode-row_taken': node.lastTaken === i,
					})}
				>
					<Port shapeId={shape.id} portId={`cond${i}`} />
					<NodeCardLabel>{i === 0 ? 'IF' : 'ELSE IF'}</NodeCardLabel>
					{node.mode === 'nl' ? (
						<textarea
							className="NodeFieldRow-input"
							value={block.nl}
							placeholder="Enter condition"
							spellCheck={false}
							onChange={(e) => setBlock(i, { nl: e.currentTarget.value })}
							onPointerDown={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
							onFocus={() => editor.setSelectedShapes([shape.id])}
						/>
					) : (
						<span
							className="IfElseNode-structured"
							onPointerDown={(e) => e.stopPropagation()}
						>
							<input
								type="text"
								value={block.left}
								placeholder="operand"
								onChange={(e) => setBlock(i, { left: e.currentTarget.value })}
								onFocus={() => editor.setSelectedShapes([shape.id])}
							/>
							<select
								value={block.op}
								onChange={(e) => setBlock(i, { op: e.currentTarget.value })}
							>
								{CONDITION_OPS.map((op) => (
									<option key={op} value={op}>
										{op}
									</option>
								))}
							</select>
							<input
								type="text"
								value={block.right}
								placeholder="operand"
								onChange={(e) => setBlock(i, { right: e.currentTarget.value })}
								onFocus={() => editor.setSelectedShapes([shape.id])}
							/>
						</span>
					)}
					{i > 0 && (
						<button
							className="IfElseNode-drop"
							title="Remove this branch"
							aria-label="Remove this branch"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={() => removeElseIfBlock(editor, shape, i)}
						>
							<X size={12} />
						</button>
					)}
					<Port shapeId={shape.id} portId={`out${i}`} />
				</NodeRow>
			))}

			{/* Gone once the card is full, rather than greyed out. */}
			{canAdd && (
				<NodeRow className="IfElseNode-add-row">
					<button
						className="IfElseNode-add"
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => addElseIfBlock(editor, shape)}
					>
						<CirclePlus size={15} />
						ELSE IF
					</button>
				</NodeRow>
			)}

			<NodeRow
				className={classNames('IfElseNode-row', 'IfElseNode-row_else', {
					'IfElseNode-row_taken': node.lastTaken === -1,
				})}
			>
				<NodeCardLabel>ELSE</NodeCardLabel>
				<span className="IfElseNode-else-hint">When no condition matches</span>
				<Port shapeId={shape.id} portId="else" />
			</NodeRow>
		</>
	)
}
