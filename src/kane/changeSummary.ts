import { Editor, TLShapeId } from 'tldraw'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'

/**
 * The commit message the Save popover starts you off with.
 *
 * It is a real diff, not a phrase generator: the canvas is fingerprinted when a
 * version is saved, and the next save compares that snapshot against what is on
 * the canvas now. Added, removed and edited cards each get counted and named,
 * and the sentence is assembled from what actually changed. In a build with a
 * model behind it this is the prompt's input; here it is the whole answer, and
 * it stays editable either way.
 */

/** One card, reduced to what a version diff cares about. */
export interface CardFingerprint {
	type: string
	/** The card's own title, if it has been renamed. */
	label?: string
	/** The one field that says what this card does. */
	detail: string
}

export type CanvasSnapshot = Map<TLShapeId, CardFingerprint>

/** The field that best describes a card of each type. */
function detailOf(node: Record<string, unknown>): string {
	switch (node.type) {
		case 'open':
			return String(node.url ?? '')
		case 'click':
			return `${String(node.target ?? '')}·${String(node.clickType ?? '')}·${String(node.repeat ?? 1)}·${String(node.holdMs ?? '')}`
		case 'input':
			return `${String(node.target ?? '')}·${String(node.text ?? '')}·${String(node.pressEnter ?? false)}`
		case 'ifelse': {
			const blocks = (node.blocks as { nl?: string; left?: string; op?: string; right?: string }[]) ?? []
			return blocks.map((b) => b.nl || `${b.left} ${b.op} ${b.right}`).join(' | ')
		}
		case 'while':
			return [node.condition, node.left, node.op, node.right, node.maxIterations]
				.map((v) => String(v ?? ''))
				.join('·')
		case 'scroll':
			return `${String(node.direction ?? '')}·${String(node.amount ?? '')}${String(node.unit ?? '')}·${String(node.container ?? '')}`
		case 'js':
			return String(node.code ?? '')
		case 'api':
			return `${String(node.method ?? '')}·${String(node.url ?? '')}·${String(node.body ?? '')}`
		case 'ai':
			return `${String(node.prompt ?? '')}·${String(node.xpath ?? '')}`
		default:
			return `${String(node.name ?? '')}·${String(node.value ?? '')}`
	}
}

export function snapshotCanvas(editor: Editor): CanvasSnapshot {
	const snapshot: CanvasSnapshot = new Map()
	for (const shape of editor.getCurrentPageShapes()) {
		if (!editor.isShapeOfType<NodeShape>(shape, 'node')) continue
		const node = shape.props.node as Record<string, unknown>
		snapshot.set(shape.id, {
			type: String(node.type),
			label: typeof node.label === 'string' ? node.label : undefined,
			detail: detailOf(node),
		})
	}
	return snapshot
}

/** "a Click card" / "2 Click cards" / "a Click and 2 Input cards". */
function nameList(editor: Editor, types: string[]): string {
	const counts = new Map<string, number>()
	for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1)
	const parts = [...counts.entries()].map(([type, n]) => {
		const title = getNodeDefinition(editor, type as never).title
		return n === 1 ? title : `${n} × ${title}`
	})
	if (parts.length === 1) return parts[0]
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Describe the difference between a saved snapshot and the canvas now. Returns
 * an empty string when nothing has changed.
 */
export function summarizeChanges(editor: Editor, before: CanvasSnapshot): string {
	const now = snapshotCanvas(editor)

	const added: string[] = []
	const removed: string[] = []
	const edited: string[] = []

	for (const [id, card] of now) {
		const old = before.get(id)
		if (!old) added.push(card.type)
		else if (old.detail !== card.detail || old.label !== card.label) edited.push(card.type)
	}
	for (const [id, card] of before) {
		if (!now.has(id)) removed.push(card.type)
	}

	const clauses: string[] = []
	if (added.length) clauses.push(`Add ${nameList(editor, added)}`)
	if (edited.length) clauses.push(`${clauses.length ? 'update' : 'Update'} ${nameList(editor, edited)}`)
	if (removed.length)
		clauses.push(`${clauses.length ? 'remove' : 'Remove'} ${nameList(editor, removed)}`)

	if (clauses.length === 0) {
		// The store also fires for moves and wiring, which no card fingerprint
		// covers — say so rather than pretending nothing happened.
		return now.size === before.size ? 'Rearrange the workflow' : ''
	}

	const sentence =
		clauses.length === 1
			? clauses[0]
			: `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`
	return `${sentence} — ${now.size} step${now.size === 1 ? '' : 's'} in the flow`
}
