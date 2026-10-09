import { Box, createBindingId, createShapeId, Editor, TLShapeId } from 'tldraw'
import { NODE_WIDTH_PX } from '../constants'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeHeightPx, getNodeWidthPx, NodeType } from '../nodes/nodeTypes'
import { SavedModule } from './catalog'

/**
 * Shared canvas-graph operations used by the Modules drawer and the agent's
 * workflow builder: creating cards, wiring connections, and wrapping a set of
 * cards in a Module frame.
 */

/** Clear space kept between two cards when nudging one out of the way. */
const CARD_GAP_PX = 24
/** How far each search ring steps out from the desired spot. */
const SPOT_STEP_PX = 28
const SPOT_MAX_RINGS = 80

/**
 * Find the nearest position to (x, y) where a w×h card would not sit on top of
 * an existing card. Cards must never be stacked: dropping one on another hides
 * it completely and makes ports impossible to hit.
 *
 * Searches down first, then up, then sideways, so a card nudged out of the way
 * stays in its column and the layout keeps reading left-to-right.
 */
export function findFreeSpot(
	editor: Editor,
	x: number,
	y: number,
	w: number,
	h: number,
	ignore?: Set<TLShapeId>
): { x: number; y: number } {
	const cards = editor
		.getCurrentPageShapes()
		.filter((s) => s.type === 'node' && !ignore?.has(s.id))
		.map((s) => editor.getShapePageBounds(s.id))
		.filter((b): b is NonNullable<typeof b> => !!b)

	const collides = (px: number, py: number) =>
		cards.some(
			(b) =>
				px < b.maxX + CARD_GAP_PX &&
				px + w + CARD_GAP_PX > b.x &&
				py < b.maxY + CARD_GAP_PX &&
				py + h + CARD_GAP_PX > b.y
		)

	if (!collides(x, y)) return { x, y }

	for (let ring = 1; ring <= SPOT_MAX_RINGS; ring++) {
		const offset = ring * SPOT_STEP_PX
		for (const candidate of [
			{ x, y: y + offset },
			{ x, y: y - offset },
			{ x: x + offset, y },
			{ x: x - offset, y },
		]) {
			if (!collides(candidate.x, candidate.y)) return candidate
		}
	}
	return { x, y }
}

/** Move an existing card to the nearest spot where it isn't on top of another. */
export function nudgeOutOfOverlap(editor: Editor, shapeId: TLShapeId, x: number, y: number) {
	const bounds = editor.getShapePageBounds(shapeId)
	if (!bounds) {
		editor.updateShape({ id: shapeId, type: 'node', x, y })
		return
	}
	const spot = findFreeSpot(editor, x, y, bounds.w, bounds.h, new Set([shapeId]))
	editor.updateShape({ id: shapeId, type: 'node', x: spot.x, y: spot.y })
}

/**
 * Create a card shape at a page position. Returns its id.
 *
 * By default the card is kept clear of existing cards. `keepExactPosition` is
 * for callers that lay a group out themselves (stamping a saved module), where
 * the relative arrangement is the point.
 */
export function createCard(
	editor: Editor,
	node: NodeType,
	x: number,
	y: number,
	opts: { keepExactPosition?: boolean } = {}
): TLShapeId {
	const id = createShapeId()
	editor.createShape({
		id,
		type: 'node',
		x,
		y,
		props: { node },
	})
	if (!opts.keepExactPosition) nudgeOutOfOverlap(editor, id, x, y)
	return id
}

/** Create a card centered on a point and select it (toolbar/shortcut path). */
export function createNodeShape(
	editor: Editor,
	shapeId: TLShapeId,
	center: { x: number; y: number },
	node: NodeType
) {
	const markId = editor.markHistoryStoppingPoint('create node')

	editor.run(() => {
		editor.createShape({
			id: shapeId,
			type: 'node',
			props: { node },
		})

		const shapeBounds = editor.getShapePageBounds(shapeId)!

		// centre on the requested point, then step aside if that spot is taken
		// (every toolbar / shortcut / slash card asks for the viewport centre,
		// so without this they would all stack on the same square)
		const x = center.x - shapeBounds.width / 2
		const y = center.y - shapeBounds.height / 2
		nudgeOutOfOverlap(editor, shapeId, x, y)

		editor.select(shapeId)
	})

	return markId
}

/** Create a Module section (a named frame, like a Figma section) on the canvas. */
export function createModuleFrame(
	editor: Editor,
	center: { x: number; y: number },
	name = 'New module',
	size = { w: 420, h: 320 }
) {
	const id = createShapeId()
	editor.markHistoryStoppingPoint('create module')
	editor.createShape({
		id,
		type: 'frame',
		x: center.x - size.w / 2,
		y: center.y - size.h / 2,
		props: { name, w: size.w, h: size.h },
	})
	editor.select(id)
	return id
}

/** Wire an output port of one card to an input port of another. */
export function connectCards(
	editor: Editor,
	fromId: TLShapeId,
	fromPort: string,
	toId: TLShapeId,
	toPort: string
): TLShapeId {
	const connectionId = createShapeId()
	editor.createShape({
		id: connectionId,
		type: 'connection',
		props: {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
		},
	})
	editor.createBinding({
		id: createBindingId(),
		type: 'connection',
		fromId: connectionId,
		toId: fromId,
		props: { terminal: 'start', portId: fromPort },
	})
	editor.createBinding({
		id: createBindingId(),
		type: 'connection',
		fromId: connectionId,
		toId: toId,
		props: { terminal: 'end', portId: toPort },
	})
	return connectionId
}

const FRAME_PADDING = 40
const FRAME_TOP_PADDING = 56

/** Wrap the given shapes in a named Module frame sized to their bounds. */
export function wrapInModuleFrame(
	editor: Editor,
	name: string,
	shapeIds: TLShapeId[]
): TLShapeId | null {
	let bounds: Box | null = null
	for (const id of shapeIds) {
		const shapeBounds = editor.getShapePageBounds(id)
		if (!shapeBounds) continue
		bounds = bounds ? bounds.union(shapeBounds) : Box.From(shapeBounds)
	}
	if (!bounds) return null

	const frameId = createShapeId()
	editor.createShape({
		id: frameId,
		type: 'frame',
		x: bounds.x - FRAME_PADDING,
		y: bounds.y - FRAME_TOP_PADDING,
		props: {
			name,
			w: bounds.w + FRAME_PADDING * 2,
			h: bounds.h + FRAME_TOP_PADDING + FRAME_PADDING,
		},
	})
	editor.sendToBack([frameId])
	editor.reparentShapes(shapeIds, frameId)
	return frameId
}

/**
 * Stamp a saved module onto the canvas at the given page position: cards +
 * connections wrapped in a named frame (an editable copy — editing it does not
 * affect the saved module).
 */
export function stampModule(
	editor: Editor,
	module: SavedModule,
	position: { x: number; y: number }
): TLShapeId | null {
	let frameId: TLShapeId | null = null
	editor.run(() => {
		editor.markHistoryStoppingPoint('insert module')

		const idByLocal = new Map<string, TLShapeId>()
		for (const node of module.nodes) {
			// a saved module's cards are laid out relative to each other, so
			// they keep their exact offsets
			const id = createCard(
				editor,
				node.node as NodeType,
				position.x + node.x,
				position.y + node.y,
				{ keepExactPosition: true }
			)
			idByLocal.set(node.localId, id)
		}

		const connectionIds: TLShapeId[] = []
		for (const conn of module.connections) {
			const fromId = idByLocal.get(conn.from)
			const toId = idByLocal.get(conn.to)
			if (!fromId || !toId) continue
			connectionIds.push(connectCards(editor, fromId, conn.fromPort, toId, conn.toPort))
		}

		frameId = wrapInModuleFrame(editor, module.name, [
			...idByLocal.values(),
			...connectionIds,
		])
		if (frameId) editor.select(frameId)
	})
	return frameId
}

/** Find the first shape of a node kind on the page (used by run helpers). */
export function findNodeOfKind(editor: Editor, kind: string): NodeShape | undefined {
	return editor
		.getCurrentPageShapes()
		.find(
			(shape): shape is NodeShape =>
				editor.isShapeOfType<NodeShape>(shape, 'node') &&
				(shape.props.node as { type: string }).type === kind
		)
}

const ENTITY_KINDS = new Set(['parameter', 'secret', 'totp', 'variable'])
/**
 * Push apart any cards that are sitting on top of each other.
 *
 * A card's width is a property of its type, and a type can change width — the
 * Click card did, from 260 to 360, so that its five click types stopped running
 * off the edge. Every card already on a saved canvas keeps the position it was
 * given when it was 100px narrower, which puts each wide card 40px under its
 * right-hand neighbour. Widening a card without this is a fix that breaks the
 * thing it fixed: the last option ends up hidden by the next card instead of by
 * the card's own edge.
 *
 * Only ever moves a card right, only when it genuinely overlaps something, and
 * only for cards at the page root — a card inside a module frame is positioned
 * relative to the frame and is left alone. Does nothing on a canvas with no
 * overlaps, so it is safe to run at every load.
 *
 * @returns how many cards were moved.
 */
export function separateOverlappingCards(editor: Editor): number {
	const pageId = editor.getCurrentPageId()
	const cards = editor
		.getCurrentPageShapes()
		.filter(
			(s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node') && s.parentId === pageId
		)

	const boxes = cards
		.map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape.id) }))
		.filter((entry): entry is { shape: NodeShape; bounds: Box } => !!entry.bounds)
		.sort((a, b) => a.bounds.x - b.bounds.x)

	const moved: { id: TLShapeId; type: 'node'; x: number }[] = []
	for (let i = 0; i < boxes.length; i++) {
		const right = boxes[i]
		let pushTo = right.bounds.x
		for (let j = 0; j < i; j++) {
			const left = boxes[j]
			const overlaps =
				left.bounds.x < right.bounds.maxX &&
				left.bounds.maxX > right.bounds.x &&
				left.bounds.y < right.bounds.maxY &&
				left.bounds.maxY > right.bounds.y
			if (overlaps) pushTo = Math.max(pushTo, left.bounds.maxX + CARD_GAP_PX)
		}
		if (pushTo === right.bounds.x) continue
		// A page-root card's own x is already page space, so the new left edge is
		// the new x. Its bounds are updated in place too, so a card further right
		// is separated from where this one ended up, not where it started.
		right.bounds = right.bounds.clone().translate({ x: pushTo - right.bounds.x, y: 0 })
		moved.push({ id: right.shape.id, type: 'node', x: pushTo })
	}

	if (moved.length > 0) editor.updateShapes(moved)
	return moved.length
}

const COL_GAP = 72
const ROW_GAP = 48
const DATA_GAP = 64
const COMPONENT_GAP = 180

/**
 * Beautify: lay the page-level cards out neatly — each connected workflow
 * becomes left-to-right columns by depth, data cards sit above the card they
 * feed, and separate workflows stack vertically. Cards inside module frames
 * are left alone (they move with their module). Animated.
 */
export function beautifyCanvas(editor: Editor): number {
	const pageId = editor.getCurrentPageId()
	const nodes = editor
		.getCurrentPageShapes()
		.filter(
			(s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node') && s.parentId === pageId
		)
	if (nodes.length === 0) return 0

	const ids = new Set(nodes.map((n) => n.id))
	const byId = new Map(nodes.map((n) => [n.id, n]))
	const isData = (id: TLShapeId) =>
		ENTITY_KINDS.has((byId.get(id)!.props.node as { type: string }).type)

	// Adjacency within page-level cards. `down` follows output → input direction.
	const adj = new Map<TLShapeId, Set<TLShapeId>>()
	const down = new Map<TLShapeId, Set<TLShapeId>>()
	for (const n of nodes) {
		adj.set(n.id, adj.get(n.id) ?? new Set())
		for (const c of getNodePortConnections(editor, n)) {
			if (!ids.has(c.connectedShapeId)) continue
			adj.get(n.id)!.add(c.connectedShapeId)
			if (c.terminal === 'start') {
				const set = down.get(n.id) ?? new Set()
				set.add(c.connectedShapeId)
				down.set(n.id, set)
			}
		}
	}

	// Connected components (undirected).
	const componentOf = new Map<TLShapeId, number>()
	const components: TLShapeId[][] = []
	for (const n of nodes) {
		if (componentOf.has(n.id)) continue
		const queue = [n.id]
		const component: TLShapeId[] = []
		componentOf.set(n.id, components.length)
		while (queue.length) {
			const id = queue.pop()!
			component.push(id)
			for (const next of adj.get(id) ?? []) {
				if (componentOf.has(next)) continue
				componentOf.set(next, components.length)
				queue.push(next)
			}
		}
		components.push(component)
	}

	// Keep the layout anchored roughly where the content already is.
	let minX = Infinity
	let minY = Infinity
	for (const n of nodes) {
		const b = editor.getShapePageBounds(n.id)
		if (!b) continue
		minX = Math.min(minX, b.x)
		minY = Math.min(minY, b.y)
	}
	if (minX === Infinity) return 0

	const updates: { id: TLShapeId; x: number; y: number }[] = []
	let yCursor = minY

	for (const component of components) {
		const flow = component.filter((id) => !isData(id))
		const data = component.filter((id) => isData(id))

		// Longest-path depth over flow edges only (the graph is cycle-free).
		const depth = new Map<TLShapeId, number>()
		const indegree = new Map<TLShapeId, number>()
		for (const id of flow) indegree.set(id, 0)
		for (const id of flow) {
			for (const next of down.get(id) ?? []) {
				if (isData(next) || !indegree.has(next)) continue
				indegree.set(next, (indegree.get(next) ?? 0) + 1)
			}
		}
		const queue = flow.filter((id) => (indegree.get(id) ?? 0) === 0)
		for (const id of queue) depth.set(id, 0)
		while (queue.length) {
			const id = queue.shift()!
			for (const next of down.get(id) ?? []) {
				if (isData(next) || !indegree.has(next)) continue
				depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1))
				indegree.set(next, indegree.get(next)! - 1)
				if (indegree.get(next) === 0) queue.push(next)
			}
		}
		for (const id of flow) if (!depth.has(id)) depth.set(id, 0)

		// Reserve headroom for data cards that sit above their consumers.
		const dataHeadroom = data.length
			? Math.max(...data.map((id) => getNodeHeightPx(editor, byId.get(id)!))) + DATA_GAP
			: 0
		const originY = yCursor + dataHeadroom
		let componentBottom = originY

		// Place flow cards in depth columns.
		const columns = new Map<number, TLShapeId[]>()
		for (const id of flow) {
			const d = depth.get(id) ?? 0
			const col = columns.get(d) ?? []
			col.push(id)
			columns.set(d, col)
		}
		// Each column starts after the widest card in the column before it. Cards
		// are no longer all one width — Click is wider than the rest, and a
		// resized card is whatever it was dragged to — so a fixed column pitch
		// would lay the wide ones over their neighbours.
		const columnX = new Map<number, number>()
		let columnCursor = minX
		for (const d of [...columns.keys()].sort((a, b) => a - b)) {
			columnX.set(d, columnCursor)
			const widest = Math.max(
				NODE_WIDTH_PX,
				...columns.get(d)!.map((id) => getNodeWidthPx(editor, byId.get(id)!))
			)
			columnCursor += widest + COL_GAP
		}

		const placed = new Map<TLShapeId, { x: number; y: number }>()
		for (const [d, col] of columns) {
			col.sort((a, b) => byId.get(a)!.y - byId.get(b)!.y)
			let colY = originY
			for (const id of col) {
				const x = columnX.get(d) ?? minX
				placed.set(id, { x, y: colY })
				const h = getNodeHeightPx(editor, byId.get(id)!)
				colY += h + ROW_GAP
				componentBottom = Math.max(componentBottom, colY)
			}
		}

		// Data cards go above the first card they feed (stacking if several).
		const stackOffset = new Map<TLShapeId, number>()
		for (const id of data) {
			const consumer = [...(down.get(id) ?? [])].find((c) => placed.has(c))
			const h = getNodeHeightPx(editor, byId.get(id)!)
			if (consumer) {
				const base = placed.get(consumer)!
				const offset = stackOffset.get(consumer) ?? 0
				placed.set(id, { x: base.x, y: base.y - h - DATA_GAP - offset })
				stackOffset.set(consumer, offset + h + 16)
			} else {
				placed.set(id, { x: minX, y: componentBottom })
				componentBottom += h + ROW_GAP
			}
		}

		for (const [id, pos] of placed) {
			updates.push({ id, x: pos.x, y: pos.y })
		}
		yCursor = componentBottom + COMPONENT_GAP
	}

	editor.markHistoryStoppingPoint('beautify layout')
	editor.animateShapes(
		updates.map(({ id, x, y }) => ({ id, type: 'node' as const, x, y })),
		{ animation: { duration: 360 } }
	)
	return updates.length
}
