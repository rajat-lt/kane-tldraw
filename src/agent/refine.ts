import { Editor } from 'tldraw'
import { clampHold, clampRepeat, ClickNode } from '../nodes/types/ClickNode'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { clearAiBuilding, markAiBuilding } from '../kane/uiState'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { API_METHODS, ApiMethod, ApiNode } from '../nodes/types/ApiNode'
import { addElseIfBlock, IfElseNode } from '../nodes/types/IfElseNode'
import { InputNode } from '../nodes/types/InputNode'
import { JsNode } from '../nodes/types/JsNode'
import { OpenNode } from '../nodes/types/OpenNode'
import { ScrollDirection, ScrollNode } from '../nodes/types/ScrollNode'
import { updateNode } from '../nodes/types/shared'
import { WhileNode } from '../nodes/types/WhileNode'
import { AiStepNode } from '../nodes/types/AiStepNode'
import { paced } from '../utils/pace'
import { sleep } from '../utils/sleep'

/**
 * Sending a card back to the AI.
 *
 * Like `planner.ts`, this is a deterministic client-side stand-in for a model:
 * it reads the instruction for the things a test step can actually be changed
 * to, applies every one it recognises, and says what it did. Nothing is guessed
 * at — if the instruction matches nothing, it says so rather than editing a
 * field at random and leaving the author to find it later.
 */

export interface RefineResult {
	/** Human-readable list of what changed. Empty means nothing matched. */
	changes: string[]
}

/** "…" or '…' or “…” — whatever the author quoted. */
const QUOTED = /["“']([^"”']{1,120})["”']/

function quoted(prompt: string): string | null {
	const m = prompt.match(QUOTED)
	return m ? m[1].trim() : null
}

/** `set <field> to <value>` / `change <field> to <value>`. */
function assignment(prompt: string, field: string): string | null {
	const m = prompt.match(
		new RegExp(`(?:set|change|make|update)\\s+(?:the\\s+)?${field}\\s+(?:to|=)\\s+(.+)$`, 'i')
	)
	return m ? m[1].trim().replace(/^["“']|["”']$/g, '').replace(/[.]$/, '') : null
}

/** The first bare number in the instruction. */
function firstNumber(prompt: string): number | null {
	const m = prompt.match(/(-?\d+(?:\.\d+)?)/)
	return m ? Number(m[1]) : null
}

/** A duration written as 2s / 250ms / "2 seconds". */
function duration(prompt: string): number | null {
	const ms = prompt.match(/(\d+(?:\.\d+)?)\s*(ms|milliseconds?)\b/i)
	if (ms) return Math.round(Number(ms[1]))
	const s = prompt.match(/(\d+(?:\.\d+)?)\s*(s\b|secs?\b|seconds?\b)/i)
	if (s) return Math.round(Number(s[1]) * 1000)
	return null
}

/** A URL, with or without a scheme. */
function url(prompt: string): string | null {
	const m = prompt.match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[\w\-./?%&=#]*)?)/i)
	return m ? m[0] : null
}

/**
 * Where one request ends and the next begins. "break when the banner appears
 * and run at most 6 times" is two things being asked for; "break when the
 * banner appears and the page reloads" is one condition that happens to contain
 * an "and", so only an "and" followed by another instruction verb counts.
 */
const NEXT_REQUEST =
	/[,;.]|\s+and\s+(?:run|set|make|cap|repeat|rename|call|click|type|scroll|use|change|switch|then)\b/i

/** The part of a matched condition that is actually the condition. */
function clause(text: string): string {
	const cut = text.search(NEXT_REQUEST)
	return (cut === -1 ? text : text.slice(0, cut)).trim()
}

/** Rename the card when the instruction asks for it by name. */
function renameTo(prompt: string): string | null {
	const m = prompt.match(/(?:rename(?:\s+it)?(?:\s+to)?|call\s+it|title\s+it)\s+(.+)$/i)
	return m ? m[1].trim().replace(/^["“']|["”']$/g, '').replace(/[.]$/, '') : null
}

/**
 * Apply one change to the card as it is *now*.
 *
 * One instruction can match several rules ("break when X and run at most 6
 * times" sets two fields), and every one of them has to build on the card the
 * previous rule left behind. Updating from the shape this function was handed
 * would make each rule overwrite the last, leaving only whichever happened to
 * run last — which is exactly what it did until this existed.
 */
function edit<T extends { type: string }>(
	editor: Editor,
	shape: NodeShape,
	update: (node: T) => T
) {
	const current = editor.getShape(shape.id)
	if (!current || !editor.isShapeOfType<NodeShape>(current, 'node')) return
	updateNode(editor, current, update as unknown as (node: never) => never, false)
}

/**
 * Work out what the instruction asks for and apply it. Returns one line per
 * change, in the order they were applied.
 */
function applyRefinement(editor: Editor, shape: NodeShape, prompt: string): string[] {
	const text = prompt.toLowerCase()
	const changes: string[] = []
	const node = shape.props.node as { type: string }

	const rename = renameTo(prompt)
	if (rename) {
		edit(editor, shape, (n) => ({ ...(n as object), label: rename }) as never)
		changes.push(`Renamed the card to “${rename}”`)
	}

	switch (node.type) {
		case 'click': {
			const click = node as unknown as ClickNode
			if (/\bdouble[- ]?click|twice in a row\b/.test(text) && click.clickType !== 'double') {
				edit<ClickNode>(editor, shape, (n) => ({ ...n, clickType: 'double' }))
				changes.push('Made it a double click')
			} else if (/\bright[- ]?click|context menu\b/.test(text)) {
				edit<ClickNode>(editor, shape, (n) => ({ ...n, clickType: 'right' }))
				changes.push('Made it a right click')
			} else if (/\bhold|long[- ]?press|press and hold\b/.test(text)) {
				const ms = duration(prompt)
				edit<ClickNode>(editor, shape,
					(n) => ({
						...n,
						clickType: 'hold',
						...(ms ? { holdMs: clampHold(ms) } : {}),
					})
				)
				changes.push(ms ? `Holds for ${clampHold(ms)}ms` : 'Holds the button down')
			}
			const times = prompt.match(/(\d+)\s*(?:times|x\b|clicks)/i)
			if (times) {
				// a count only means anything on the Multiple type, so asking for
				// one switches the card to it
				const repeat = clampRepeat(Number(times[1]))
				edit<ClickNode>(editor, shape, (n) => ({ ...n, clickType: 'multiple', repeat }))
				changes.push(`Clicks ${repeat}×`)
			}
			const target = assignment(prompt, 'target') ?? quoted(prompt)
			if (target) {
				edit<ClickNode>(editor, shape, (n) => ({ ...n, target }))
				changes.push(`Targets “${target}”`)
			}
			break
		}

		case 'input': {
			if (/press enter|hit enter|submit after|then enter/.test(text)) {
				edit<InputNode>(editor, shape, (n) => ({ ...n, pressEnter: true }))
				changes.push('Presses Enter after typing')
			}
			if (/(don'?t|do not|no)\s+press enter/.test(text)) {
				edit<InputNode>(editor, shape, (n) => ({ ...n, pressEnter: false }))
				changes.push('Stops pressing Enter')
			}
			const value = assignment(prompt, '(?:text|value)') ?? quoted(prompt)
			if (value) {
				edit<InputNode>(editor, shape, (n) => ({ ...n, text: value }))
				changes.push(`Types “${value}”`)
			}
			const field = assignment(prompt, '(?:field|target)')
			if (field) {
				edit<InputNode>(editor, shape, (n) => ({ ...n, target: field }))
				changes.push(`Targets “${field}”`)
			}
			break
		}

		case 'open': {
			const next = assignment(prompt, 'url') ?? url(prompt)
			if (next) {
				edit<OpenNode>(editor, shape, (n) => ({ ...n, url: next }))
				changes.push(`Opens ${next}`)
			}
			break
		}

		case 'ifelse': {
			const block = node as unknown as IfElseNode
			if (/add (?:an?\s+)?else[- ]?if|another branch|extra condition/.test(text)) {
				// same reason as `edit`: read the card back before changing it
				const current = editor.getShape(shape.id)
				if (current && editor.isShapeOfType<NodeShape>(current, 'node')) {
					addElseIfBlock(editor, current)
					changes.push('Added an Else-If branch')
				}
			}
			if (/operand|structured|comparison|compare/.test(text) && block.mode !== 'structured') {
				edit<IfElseNode>(editor, shape, (n) => ({ ...n, mode: 'structured' }))
				changes.push('Switched to operand → operator → operand')
			}
			const condition = assignment(prompt, 'condition') ?? quoted(prompt)
			if (condition) {
				edit<IfElseNode>(editor, shape,
					(n) => ({
						...n,
						blocks: n.blocks.map((b, i) => (i === 0 ? { ...b, nl: condition } : b)),
					})
				)
				changes.push(`First condition is now “${condition}”`)
			}
			break
		}

		case 'while': {
			const loop = node as unknown as WhileNode
			const cap = prompt.match(/(?:at most|max(?:imum)?|up to|cap(?:ped)? at)\s*(\d+)/i)
			const times = cap ?? prompt.match(/(\d+)\s*(?:times|iterations|runs|loops)/i)
			if (times) {
				const maxIterations = Math.max(1, Math.min(10, Number(times[1])))
				edit<WhileNode>(editor, shape, (n) => ({ ...n, maxIterations }))
				changes.push(`Runs at most ${maxIterations}×`)
			}
			if (/operand|structured|comparison|compare/.test(text) && loop.mode !== 'structured') {
				edit<WhileNode>(editor, shape, (n) => ({ ...n, mode: 'structured' }))
				changes.push('Switched to operand → operator → operand')
			}
			const until = prompt.match(/(?:while|until)\s+(.+?)(?:[.]|$)/i)
			if (until) {
				edit<WhileNode>(editor, shape, (n) => ({ ...n, condition: clause(until[1]) }))
				changes.push(`Loops while ${clause(until[1])}`)
			}
			break
		}

		case 'api': {
			const method = API_METHODS.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(prompt))
			if (method) {
				edit<ApiNode>(editor, shape, (n) => ({ ...n, method: method as ApiMethod }))
				changes.push(`Sends a ${method}`)
			}
			const endpoint = assignment(prompt, 'url') ?? url(prompt)
			if (endpoint) {
				edit<ApiNode>(editor, shape, (n) => ({ ...n, url: endpoint }))
				changes.push(`Calls ${endpoint}`)
			}
			const body = prompt.match(/(\{[\s\S]*\})/)
			if (body) {
				edit<ApiNode>(editor, shape, (n) => ({ ...n, body: body[1] }))
				changes.push('Replaced the request body')
			}
			break
		}

		case 'js': {
			const code = prompt.match(/```(?:js|javascript)?\n?([\s\S]*?)```/) ?? prompt.match(/`([^`]+)`/)
			if (code) {
				edit<JsNode>(editor, shape, (n) => ({ ...n, code: code[1].trim() }))
				changes.push('Replaced the snippet')
			}
			break
		}

		case 'scroll': {
			const directions: ScrollDirection[] = ['down', 'up', 'left', 'right']
			const direction = directions.find((d) => new RegExp(`\\b${d}\\b`, 'i').test(prompt))
			if (direction) {
				edit<ScrollNode>(editor, shape, (n) => ({ ...n, direction }))
				changes.push(`Scrolls ${direction}`)
			}
			const px = prompt.match(/(\d+)\s*px/i)
			const pct = prompt.match(/(\d+)\s*(?:%|percent)/i)
			if (px || pct) {
				const amount = Number((px ?? pct)![1])
				edit<ScrollNode>(editor, shape,
					(n) => ({ ...n, amount, unit: px ? 'px' : '%' })
				)
				changes.push(`Moves ${amount}${px ? 'px' : '%'}`)
			}
			const container = assignment(prompt, 'container') ?? quoted(prompt)
			if (container) {
				edit<ScrollNode>(editor, shape,
					(n) => ({ ...n, container, detected: false })
				)
				changes.push(`Scrolls ${container}`)
			}
			break
		}

		case 'ai': {
			// This card *is* a prompt — a new instruction replaces the old one.
			edit<AiStepNode>(editor, shape, (n) => ({ ...n, prompt, lastResult: null }))
			changes.push('Rewrote the step')
			break
		}

		case 'parameter':
		case 'secret':
		case 'totp':
		case 'variable': {
			const name = assignment(prompt, 'name')
			const value = assignment(prompt, 'value') ?? quoted(prompt)
			if (name) {
				edit(editor, shape, (n) => ({ ...(n as object), name }) as never)
				changes.push(`Named it ${name}`)
			}
			if (value) {
				edit(editor, shape, (n) => ({ ...(n as object), value }) as never)
				changes.push('Set a new value')
			}
			break
		}
	}

	// A bare number on a card that counts something is unambiguous enough to use
	if (changes.length === 0 && (node.type === 'while' || node.type === 'click')) {
		const n = firstNumber(prompt)
		if (n !== null) {
			if (node.type === 'while') {
				const maxIterations = Math.max(1, Math.min(10, Math.round(n)))
				edit<WhileNode>(editor, shape, (m) => ({ ...m, maxIterations }))
				changes.push(`Runs at most ${maxIterations}×`)
			} else {
				const repeat = clampRepeat(n)
				edit<ClickNode>(editor, shape, (m) => ({ ...m, clickType: 'multiple', repeat }))
				changes.push(`Clicks ${repeat}×`)
			}
		}
	}

	return changes
}

/**
 * Run the instruction against the card, with the same shimmer the planner uses
 * while it builds, so a refine reads as the agent working rather than as a
 * field quietly changing.
 */
export async function refineCard(
	editor: Editor,
	shape: NodeShape,
	prompt: string
): Promise<RefineResult> {
	markAiBuilding(editor, shape.id)
	try {
		await sleep(paced(700))
		const changes = applyRefinement(editor, shape, prompt.trim())
		if (changes.length > 0) await sleep(paced(200))
		return { changes }
	} finally {
		clearAiBuilding(editor, shape.id)
	}
}

/** What the card is called, for the toast. */
export function cardTitle(editor: Editor, shape: NodeShape): string {
	const node = shape.props.node as { label?: string }
	return node.label?.trim() || getNodeDefinition(editor, shape.props.node).title
}
