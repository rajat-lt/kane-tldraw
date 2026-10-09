import { Box, Editor, TLShapeId } from 'tldraw'
import { DEFAULT_NODE_SPACING_PX, NODE_WIDTH_PX } from '../constants'
import { startExecution } from '../execution/executionState'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition, NodeType } from '../nodes/nodeTypes'
import { getNodePortConnections, getNodePorts } from '../nodes/nodePorts'
import { connectCards, createCard } from '../kane/graphOps'
import { ScrollDirection } from '../nodes/types/ScrollNode'
import { clearAiBuilding, markAiBuilding } from '../kane/uiState'
import { findWorkflowTail } from '../kane/workflowRules'
import { paced } from '../utils/pace'
import { sleep } from '../utils/sleep'

/**
 * The Kane planner: turns a high-level objective into a connected workflow of
 * cards, built live on the canvas one card and one wire at a time (each shape
 * shimmering while it is "under creation").
 *
 * Progress streams into the omnibox as Astryx-ChatToolCalls-style steps:
 * `ui.note` for narration lines, `ui.begin`/`ui.end` for each tool call.
 *
 * This is a deterministic client-side planner — a stand-in for the LLM backend
 * of the tldraw agent template, so the prototype runs with zero setup.
 */

export interface PlannerUi {
	/** The intended steps, published before any building starts. */
	plan(title: string, steps: string[]): void
	/** A narration line between tool calls ("Planning a login workflow…"). */
	note(text: string): void
	/** Start a tool-call step; returns its id. */
	begin(tool: string, target: string): number
	/** Complete a tool-call step. */
	end(id: number, status?: 'complete' | 'error'): void
	/** A milestone in the stream (workflow ready, run started). */
	checkpoint(label: string): void
}

/** What each template intends to do, shown up front as the plan. */
const PLANS: Record<Analysis['template'], { title: string; steps: string[] }> = {
	login: {
		title: 'Login workflow',
		steps: [
			'Open the login page',
			'Fill email and password from data cards',
			'Submit and assert the dashboard',
		],
	},
	search: {
		title: 'Search workflow',
		steps: ['Open the app', 'Enter the query', 'Assert results and open the first hit'],
	},
	checkout: {
		title: 'Checkout workflow',
		steps: ['Open the store', 'Add an item to the cart', 'Check out and assert the order'],
	},
	loop: {
		title: 'Loop workflow',
		steps: ['Open the app', 'Repeat the action with a While loop', 'Finish on the Done branch'],
	},
	scroll: {
		title: 'Scrolling workflow',
		steps: ['Open the page', 'Scroll to what the test needs', 'Interact with it and assert'],
	},
	generic: {
		title: 'Workflow',
		steps: ['Open the page', 'Interact with it', 'Assert the outcome'],
	},
}

/**
 * Arrival staging (Codrops "grid flow" pacing): cards land one at a time on a
 * deliberate beat rather than all at once. The beat is
 *   wire draws itself → short breath → card materializes → next
 * so each step reads as caused by the previous one.
 *
 * Everything here goes through `paced()` — see utils/pace. The base numbers are
 * the natural rhythm; the multiplier is what makes a room able to follow it.
 *
 * WIRE_MS must clear the 380ms DrawSVG self-draw in ConnectionShapeUtil, or
 * the shimmer would be cleared while the wire is still drawing.
 */
const CARD_MS = paced(460)
const WIRE_MS = paced(420)
/** Pause between a wire completing and the next card appearing. */
const BEAT_MS = paced(90)
/** How long a narration line sits on its own before the canvas starts moving. */
const THINK_MS = paced(520)
const DATA_ROW_OFFSET = 250

/**
 * Where the next card in a chain starts: a clear gap after the one before it.
 *
 * Cards are not all one width any more — Click is wider, and a resized card is
 * whatever it was dragged to — so stepping by a constant would lay the wide
 * ones on top of their neighbours.
 */
function nextColumnX(editor: Editor, afterId: TLShapeId, fallbackX: number): number {
	const bounds = editor.getShapePageBounds(afterId)
	return bounds ? bounds.maxX + DEFAULT_NODE_SPACING_PX : fallbackX
}

/** Say something, then leave it up long enough to be read. */
async function think(ui: PlannerUi, text: string, ms = THINK_MS) {
	ui.note(text)
	await sleep(ms)
}

/** Short human description of a card for the step rows. */
function describeNode(editor: Editor, node: NodeType): { title: string; detail: string } {
	const title = getNodeDefinition(editor, node).title
	const n = node as Record<string, unknown>
	let detail = ''
	switch ((node as { type: string }).type) {
		case 'open':
			detail = String(n.url ?? '')
			break
		case 'click':
		case 'input':
			detail = String(n.target ?? '')
			break
		case 'ifelse': {
			const blocks = n.blocks as { nl?: string }[] | undefined
			detail = blocks?.[0]?.nl ?? ''
			break
		}
		case 'while':
			detail = String(n.condition ?? '')
			break
		case 'scroll':
			detail = `${String(n.direction ?? '')} ${String(n.amount ?? '')}${String(n.unit ?? '')}`
			break
		default:
			detail = String(n.name ?? '')
	}
	return { title, detail }
}

class WorkflowBuilder {
	private prevId: TLShapeId | null = null
	private prevPort = 'output'
	private prevTitle = 'previous card'
	private x: number
	private readonly createdIds: TLShapeId[] = []

	constructor(
		private readonly editor: Editor,
		private readonly ui: PlannerUi,
		private readonly signal: AbortSignal,
		private readonly origin: { x: number; y: number },
		anchor?: { id: TLShapeId; port: string }
	) {
		this.x = origin.x
		if (anchor) {
			this.prevId = anchor.id
			this.prevPort = anchor.port
			this.prevTitle = this.titleOf(anchor.id)
		}
	}

	get aborted() {
		return this.signal.aborted
	}

	get created() {
		return this.createdIds
	}

	get lastId() {
		return this.prevId
	}

	private titleOf(id: TLShapeId): string {
		const shape = this.editor.getShape(id)
		if (!shape || !this.editor.isShapeOfType<NodeShape>(shape, 'node')) return 'card'
		const node = shape.props.node as { label?: string }
		return node.label?.trim() || getNodeDefinition(this.editor, shape.props.node).title
	}

	private track(id: TLShapeId) {
		this.createdIds.push(id)
		this.editor.centerOnPoint(
			{ x: this.x + 130, y: this.origin.y + 120 },
			{ animation: { duration: 200 } }
		)
	}

	/** Materialize one card with the AI shimmer, reporting it as a step. */
	private async makeCard(node: NodeType, x: number, y: number): Promise<TLShapeId | null> {
		if (this.aborted) return null
		const { title, detail } = describeNode(this.editor, node)
		const step = this.ui.begin('add_card', detail ? `${title} · ${detail}` : title)
		const id = createCard(this.editor, node, x, y)
		markAiBuilding(this.editor, id)
		try {
			await sleep(CARD_MS)
		} finally {
			clearAiBuilding(this.editor, id)
		}
		this.ui.end(step)
		return id
	}

	/** Materialize one wire with the AI shimmer, reporting it as a step. */
	private async makeWire(
		fromId: TLShapeId,
		fromPort: string,
		toId: TLShapeId,
		toPort: string,
		label: string
	): Promise<void> {
		if (this.aborted) return
		const step = this.ui.begin('connect', label)
		const connectionId = connectCards(this.editor, fromId, fromPort, toId, toPort)
		markAiBuilding(this.editor, connectionId)
		try {
			await sleep(WIRE_MS)
		} finally {
			clearAiBuilding(this.editor, connectionId)
		}
		this.ui.end(step)
	}

	/**
	 * Add a card to the main chain and connect it to the previous one.
	 *
	 * Beat: card materializes (conic ring) → wire reaches back to the previous
	 * card and draws itself → short pause → next card. One arrival at a time,
	 * never a batch.
	 *
	 * The card has to exist before the wire: a connection binding needs a real
	 * target shape, so a literal wire-then-card order isn't possible here.
	 */
	async chain(node: NodeType, outPort = 'output') {
		const id = await this.makeCard(node, this.x, this.origin.y)
		if (!id) return null
		this.track(id)
		const title = this.titleOf(id)
		if (this.prevId && getNodePorts(this.editor, id)?.input) {
			await this.makeWire(this.prevId, this.prevPort, id, 'input', `${this.prevTitle} → ${title}`)
			await sleep(BEAT_MS)
		}
		this.prevId = id
		this.prevPort = outPort
		this.prevTitle = title
		this.x = nextColumnX(this.editor, id, this.x + NODE_WIDTH_PX + DEFAULT_NODE_SPACING_PX)
		return id
	}

	/** Add a data card above a consumer and wire its value port. */
	async data(node: NodeType, consumerId: TLShapeId, consumerPort: string) {
		if (this.aborted) return null
		const consumer = this.editor.getShape(consumerId)
		const cx = consumer?.x ?? this.x
		const id = await this.makeCard(node, cx, this.origin.y - DATA_ROW_OFFSET)
		if (!id) return null
		this.track(id)
		await this.makeWire(
			id,
			'output',
			consumerId,
			consumerPort,
			`${this.titleOf(id)} → ${this.titleOf(consumerId)}`
		)
		return id
	}

	/** Add a card branching off a specific port of a given card (not chained). */
	async branch(fromId: TLShapeId, fromPort: string, node: NodeType, dy = 0) {
		if (this.aborted) return null
		const from = this.editor.getShape(fromId)
		const id = await this.makeCard(
			node,
			nextColumnX(this.editor, fromId, (from?.x ?? this.x) + NODE_WIDTH_PX + DEFAULT_NODE_SPACING_PX),
			(from?.y ?? this.origin.y) + dy
		)
		if (!id) return null
		this.track(id)
		await this.makeWire(
			fromId,
			fromPort,
			id,
			'input',
			`${this.titleOf(fromId)} (${fromPort}) → ${this.titleOf(id)}`
		)
		return id
	}

	finishCamera() {
		let bounds: Box | null = null
		for (const id of this.createdIds) {
			const b = this.editor.getShapePageBounds(id)
			if (!b) continue
			bounds = bounds ? bounds.union(b) : Box.From(b)
		}
		if (bounds) {
			this.editor.zoomToBounds(bounds.expandBy(80), {
				animation: { duration: 320 },
				targetZoom: Math.min(1, this.editor.getZoomLevel()),
			})
		}
	}
}

/** Find a clear area below existing content to build the new workflow. */
function findBuildOrigin(editor: Editor): { x: number; y: number } {
	const shapes = editor.getCurrentPageShapes()
	if (shapes.length === 0) {
		const center = editor.getViewportPageBounds().center
		return { x: center.x - 640, y: center.y - 120 }
	}
	let minX = Infinity
	let maxY = -Infinity
	for (const s of shapes) {
		const b = editor.getShapePageBounds(s.id)
		if (!b) continue
		minX = Math.min(minX, b.x)
		maxY = Math.max(maxY, b.y + b.h)
	}
	return { x: minX === Infinity ? 120 : minX, y: maxY + 160 + DATA_ROW_OFFSET }
}

/** Run every starting card on the page (cards with no incoming connections). */
export function runWholeCanvas(editor: Editor): boolean {
	const starting = editor
		.getCurrentPageShapes()
		.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
		.filter((s) => !getNodePortConnections(editor, s).some((c) => c.terminal === 'end'))
	if (starting.length === 0) return false
	startExecution(editor, new Set(starting.map((s) => s.id)))
	return true
}

interface Analysis {
	template: 'login' | 'search' | 'checkout' | 'loop' | 'scroll' | 'generic'
	wantsOtp: boolean
	wantsRun: boolean
	url: string | null
	/** A scroll asked for anywhere in the objective, in any template. */
	scroll: { direction: ScrollDirection; amount: number; unit: '%' | 'px' } | null
}

/**
 * A scroll named in the objective. This is the only way a Scroll card is
 * reached other than performing one in the browser with Record on — it has no
 * slash command, because a scroll with no page behind it targets nothing.
 */
function analyzeScroll(objective: string): Analysis['scroll'] {
	if (!/\bscroll/i.test(objective)) return null
	const directions: ScrollDirection[] = ['down', 'up', 'left', 'right']
	const direction = directions.find((d) => new RegExp(`\\b${d}\\b`, 'i').test(objective)) ?? 'down'
	const px = objective.match(/(\d+)\s*px/i)
	const pct = objective.match(/(\d+)\s*(?:%|percent)/i)
	if (px) return { direction, amount: Number(px[1]), unit: 'px' }
	if (pct) return { direction, amount: Number(pct[1]), unit: '%' }
	// "scroll to the bottom" is the whole view; anything else is half of one
	return { direction, amount: /bottom|end|all the way/i.test(objective) ? 100 : 50, unit: '%' }
}

function analyze(objective: string): Analysis {
	const text = objective.toLowerCase()
	const urlMatch = objective.match(/(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,}(?:\/[\w\-./]*)?)/i)
	const wantsOtp = /\botp\b|2fa|totp|two.factor|authenticator/.test(text)
	const wantsRun = /\b(and|then)?\s*run( it| the (test|workflow))?\b/.test(text)
	const scroll = analyzeScroll(objective)
	let template: Analysis['template'] = 'generic'
	if (/log ?in|sign ?in|credential|auth/.test(text)) template = 'login'
	else if (/search|find|look ?up|filter/.test(text)) template = 'search'
	else if (/cart|checkout|buy|purchase|order/.test(text)) template = 'checkout'
	else if (/loop|while|repeat|each|every|until/.test(text)) template = 'loop'
	else if (scroll) template = 'scroll'
	return { template, wantsOtp, wantsRun, url: urlMatch ? urlMatch[1] : null, scroll }
}

const node = {
	open: (url: string): NodeType => ({ type: 'open', url }) as NodeType,
	click: (target: string): NodeType =>
		({ type: 'click', target, clickType: 'single' }) as NodeType,
	input: (target: string, text: string, pressEnter = false): NodeType =>
		({ type: 'input', target, text, pressEnter }) as NodeType,
	ifelse: (condition: string): NodeType =>
		({
			type: 'ifelse',
			mode: 'nl',
			blocks: [{ nl: condition, left: '', op: '==', right: '' }],
			lastTaken: null,
		}) as NodeType,
	while: (condition: string, maxIterations = 3): NodeType =>
		({
			type: 'while',
			mode: 'nl',
			condition,
			maxIterations,
			lastIterations: null,
		}) as NodeType,
	scroll: (
		s: NonNullable<Analysis['scroll']>,
		container = '',
		detected = false
	): NodeType => ({ type: 'scroll', ...s, container, detected }) as NodeType,
	entity: (kind: 'parameter' | 'secret' | 'totp' | 'variable', name: string, value: string) =>
		({ type: kind, name, value }) as unknown as NodeType,
}

/** The port a chained connection should leave a card from. */
function outPortOf(editor: Editor, id: TLShapeId): string {
	const shape = editor.getShape(id)
	if (!shape || !editor.isShapeOfType<NodeShape>(shape, 'node')) return 'output'
	const kind = (shape.props.node as { type: string }).type
	if (kind === 'ifelse') return 'out0'
	if (kind === 'while') return 'body'
	return 'output'
}

/**
 * Process an objective: stream thinking steps into the omnibox while building
 * the workflow on the canvas card-by-card and wire-by-wire, then (optionally)
 * run it. With `anchorId` (from an @-context card), the new workflow chains
 * off that card instead of starting fresh.
 */
export async function planWorkflow(
	editor: Editor,
	objective: string,
	ui: PlannerUi,
	signal: AbortSignal,
	opts: { anchorId?: TLShapeId } = {}
): Promise<void> {
	const analysis = analyze(objective)

	const planStep = ui.begin('plan', `${analysis.template} workflow`)
	await sleep(paced(600))
	ui.end(planStep)
	const plan = PLANS[analysis.template]
	ui.plan(plan.title, plan.steps)
	// the plan is the first thing worth reading — let it land before cards start
	// appearing and pull the eye onto the canvas
	await sleep(THINK_MS)

	let anchor: { id: TLShapeId; port: string } | undefined
	let origin = findBuildOrigin(editor)
	if (opts.anchorId) {
		const anchorShape = editor.getShape(opts.anchorId)
		if (anchorShape && editor.isShapeOfType<NodeShape>(anchorShape, 'node')) {
			const bounds = editor.getShapePageBounds(anchorShape.id)
			anchor = { id: anchorShape.id, port: outPortOf(editor, anchorShape.id) }
			origin = {
				x: (bounds?.x ?? anchorShape.x) + 320,
				y: bounds?.y ?? anchorShape.y,
			}
			ui.note('Chaining the new steps off your selected card.')
		}
	}

	// Only one workflow may exist on the canvas: if one is already there and no
	// anchor was chosen, chain the new steps off its last card.
	if (!anchor) {
		const tail = findWorkflowTail(editor)
		if (tail) {
			const bounds = editor.getShapePageBounds(tail.id)
			anchor = { id: tail.id, port: outPortOf(editor, tail.id) }
			origin = {
				x: (bounds?.x ?? tail.x) + 320,
				y: bounds?.y ?? tail.y,
			}
			ui.note('A workflow already exists — continuing it from its last card.')
		}
	}

	const b = new WorkflowBuilder(editor, ui, signal, origin, anchor)

	editor.markHistoryStoppingPoint('agent workflow')

	switch (analysis.template) {
		case 'login': {
			await think(ui, 'Building a login workflow from your objective…')

			const open = await b.chain(node.open(analysis.url ?? 'app.lambdatest.com/login'))
			if (!open) break

			const email = await b.chain(node.input('Email field', ''))
			if (!email) break
			await b.data(node.entity('variable', 'email', 'you@company.com'), email, 'text')

			const password = await b.chain(node.input('Password field', ''))
			if (!password) break
			await b.data(node.entity('secret', 'password', 'hunter2-secret'), password, 'text')

			if (analysis.wantsOtp) {
				const otp = await b.chain(node.input('2FA code field', ''))
				if (!otp) break
				await b.data(node.entity('totp', 'otp', 'JBSWY3DPEHPK3PXP'), otp, 'text')
			}

			const submit = await b.chain(node.click('“Sign in” button'))
			if (!submit) break

			const check = await b.chain(node.ifelse('dashboard is visible'), 'out0')
			if (!check) break
			await b.chain(node.input('Search bar', 'smoke suite', true))
			await b.branch(check, 'else', node.open('app.lambdatest.com/login'), 170)
			break
		}

		case 'search': {
			await think(ui, 'Building a search workflow…')

			await b.chain(node.open(analysis.url ?? 'app.lambdatest.com/dashboard'))
			const q = objective.match(/(?:search|find|look ?up)\s+(?:for\s+)?["“]?([\w -]{2,40})/i)
			const search = await b.chain(node.input('Search bar', q ? q[1].trim() : 'wireless mouse', true))
			if (!search) break
			await b.chain(node.ifelse('results are shown'), 'out0')
			await b.chain(node.click('First result'))
			break
		}

		case 'checkout': {
			await think(ui, 'Building a checkout workflow…')

			await b.chain(node.open(analysis.url ?? 'staging.shop.example.com'))
			await b.chain(node.input('Search bar', 'wireless mouse', true))
			await b.chain(node.click('“Add to cart” button'))
			await b.chain(node.click('Cart'))
			const checkout = await b.chain(node.click('“Checkout” button'))
			if (!checkout) break
			await b.chain(node.ifelse('order was placed'), 'out0')
			await b.chain(node.open('staging.shop.example.com/orders'))
			break
		}

		case 'loop': {
			await think(ui, 'Building a loop workflow…')

			await b.chain(node.open(analysis.url ?? 'app.lambdatest.com/dashboard'))
			const loop = await b.chain(node.while('items remain in the list', 3), 'body')
			if (!loop) break
			await b.chain(node.click('Next item'))
			await b.branch(loop, 'done', node.click('“Finish” button'), 240)
			break
		}

		case 'scroll': {
			await think(ui, 'Building a workflow that scrolls to what you need…')

			await b.chain(node.open(analysis.url ?? 'shop.demo.test'))
			// the container is left empty: the page is what scrolls unless a
			// recorded gesture says otherwise, and inventing a selector here would
			// be a locator nobody chose
			await b.chain(node.scroll(analysis.scroll!))
			await b.chain(node.click('the element you scrolled to'))
			await b.chain(node.ifelse('it is visible'), 'out0')
			break
		}

		default: {
			await think(ui, 'Breaking your objective into steps…')

			await b.chain(node.open(analysis.url ?? 'example.com'))
			await b.chain(node.click('“Get started” button'))
			await b.chain(node.input('Email field', 'you@company.com'))
			await b.chain(node.ifelse('the flow succeeded'), 'out0')
			break
		}
	}

	// A scroll asked for inside another kind of objective ("log in, then scroll
	// to the plan table") still gets its card, appended to whatever was built.
	if (analysis.scroll && analysis.template !== 'scroll') {
		await b.chain(node.scroll(analysis.scroll))
	}

	// Never leave a stale shimmer behind (e.g. after an abort mid-step).
	clearAiBuilding(editor)

	if (signal.aborted) {
		ui.note('Stopped — kept everything generated so far.')
		return
	}

	b.finishCamera()

	ui.checkpoint(`Workflow ready — ${b.created.length} cards`)

	if (analysis.wantsRun && b.created.length > 0) {
		const runStep = ui.begin('run', 'workflow')
		await sleep(paced(400))
		ui.end(runStep)
		runWholeCanvas(editor)
		ui.note('Running it now.')
	} else {
		ui.note('Press ▶ on the run label to execute it.')
	}
}
