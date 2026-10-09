import { Editor, TLShapeId } from 'tldraw'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { kaneToast } from './uiState'

/**
 * Workflow rules:
 * 1. Only ONE workflow may exist at the page level (modules — cards inside
 *    frames — are separate and unlimited). A connection that would create a
 *    second disjoint workflow is removed right after it's made.
 * 2. A card may only live inside a module frame if it is attached to a
 *    workflow (has at least one connection).
 */

/** Is this card attached to anything? */
export function isInWorkflow(editor: Editor, id: TLShapeId): boolean {
	const shape = editor.getShape(id)
	if (!shape || !editor.isShapeOfType<NodeShape>(shape, 'node')) return false
	return getNodePortConnections(editor, shape).length > 0
}

/** All page-root cards (cards inside module frames are excluded). */
function getPageRootCards(editor: Editor): NodeShape[] {
	const pageId = editor.getCurrentPageId()
	return editor
		.getCurrentPageShapes()
		.filter(
			(s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node') && s.parentId === pageId
		)
}

/** Connected components (size ≥ 2) among page-root cards. */
export function getPageWorkflowComponents(editor: Editor): TLShapeId[][] {
	const cards = getPageRootCards(editor)
	const ids = new Set(cards.map((c) => c.id))
	const seen = new Set<TLShapeId>()
	const components: TLShapeId[][] = []
	for (const card of cards) {
		if (seen.has(card.id)) continue
		const queue = [card.id]
		const component: TLShapeId[] = []
		seen.add(card.id)
		while (queue.length) {
			const id = queue.pop()!
			component.push(id)
			const shape = editor.getShape(id)
			if (!shape || !editor.isShapeOfType<NodeShape>(shape, 'node')) continue
			for (const conn of getNodePortConnections(editor, shape)) {
				if (!ids.has(conn.connectedShapeId) || seen.has(conn.connectedShapeId)) continue
				seen.add(conn.connectedShapeId)
				queue.push(conn.connectedShapeId)
			}
		}
		if (component.length >= 2) components.push(component)
	}
	return components
}

/** The last card of the existing page workflow (no outgoing flow), if any. */
export function findWorkflowTail(editor: Editor): NodeShape | null {
	const components = getPageWorkflowComponents(editor)
	if (components.length === 0) return null
	const component = components[0]
	for (const id of component) {
		const shape = editor.getShape(id)
		if (!shape || !editor.isShapeOfType<NodeShape>(shape, 'node')) continue
		const kind = (shape.props.node as { type: string }).type
		if (kind === 'parameter' || kind === 'secret' || kind === 'totp' || kind === 'variable') {
			continue
		}
		const hasOutgoing = getNodePortConnections(editor, shape).some(
			(c) => c.terminal === 'start'
		)
		if (!hasOutgoing) return shape
	}
	return null
}

/** Install both rules as store side effects. Call once from onMount. */
export function installWorkflowRules(editor: Editor) {
	// ---- Rule 1: single page-level workflow --------------------------------
	let pendingConnectionIds = new Set<TLShapeId>()

	editor.sideEffects.registerAfterCreateHandler('binding', (binding, source) => {
		if (source === 'remote') return
		if (binding.type !== 'connection') return
		pendingConnectionIds.add(binding.fromId as TLShapeId)
	})

	// ---- Rule 2: no unattached card inside a module frame ------------------
	let pendingReparented = new Set<TLShapeId>()

	editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
		if (source === 'remote') return
		if (next.type !== 'node') return
		if (prev.parentId === next.parentId) return
		const parent = editor.getShape(next.parentId as TLShapeId)
		if (parent && parent.type === 'frame') {
			pendingReparented.add(next.id)
		}
	})

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pendingConnectionIds.size > 0) {
			const connectionIds = pendingConnectionIds
			pendingConnectionIds = new Set()

			if (getPageWorkflowComponents(editor).length > 1) {
				// The newest connection created a second disjoint workflow — undo it.
				const toDelete = [...connectionIds].filter((id) => {
					const shape = editor.getShape(id)
					return !!shape && shape.type === 'connection'
				})
				if (toDelete.length > 0) {
					editor.deleteShapes(toDelete)
					kaneToast('Only one workflow is allowed — connect to the existing workflow instead', 'error')
				}
			}
		}

		if (pendingReparented.size > 0) {
			const reparented = pendingReparented
			pendingReparented = new Set()

			const toEject = [...reparented].filter((id) => {
				const shape = editor.getShape(id)
				if (!shape || shape.type !== 'node') return false
				const parent = editor.getShape(shape.parentId as TLShapeId)
				if (!parent || parent.type !== 'frame') return false
				return !isInWorkflow(editor, id)
			})
			if (toEject.length > 0) {
				editor.reparentShapes(toEject, editor.getCurrentPageId())
				kaneToast('Cards must be attached to a workflow to live inside a module', 'error')
			}
		}
	})
}
