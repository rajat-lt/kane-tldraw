/**
 * KaneRuntime is the shared context for a workflow run.
 *
 * - `values` holds the data registered by Parameter / Secret / TOTP / Variable
 *   cards during a run, so downstream cards can resolve `{{name}}` references.
 * - Browser actions performed by cards (navigate / click / type) are published
 *   to listeners. The browser viewport subscribes and animates the mock page,
 *   so running a workflow is visible inside the browser window.
 *
 * This is a client-side prototype: there is no real automation backend.
 */

export interface BrowserAction {
	kind: 'navigate' | 'click' | 'type' | 'press' | 'flash' | 'api' | 'scroll'
	url?: string
	target?: string
	text?: string
	clickType?: 'single' | 'double' | 'multiple' | 'right' | 'hold'
	/** `click` with type `hold` — how long the button stays down. */
	holdMs?: number
	label?: string
	/** `api` only — the request an API card made, so it can join the Network pane. */
	method?: string
	status?: number
	/** `scroll` only — which way, how far, and in what. */
	direction?: 'down' | 'up' | 'left' | 'right'
	amount?: number
	unit?: '%' | 'px'
	container?: string
}

type BrowserActionListener = (action: BrowserAction) => void
type StepListener = (label: string) => void

/** The mock-page view a URL resolves to (mirrors the logic inside the mock page). */
export type MockView = 'login' | 'dashboard' | 'cart' | 'landing'
export function viewForUrl(url: string): MockView {
	const u = (url || '').toLowerCase()
	if (u.includes('login') || u.includes('signin') || u.includes('forgot')) return 'login'
	if (u.includes('dash') || u.startsWith('app.') || u.includes('result')) return 'dashboard'
	if (u.includes('cart') || u.includes('shop') || u.includes('checkout')) return 'cart'
	return 'landing'
}

class KaneRuntime {
	/** name → value, registered by data cards while a run is in progress. */
	readonly values = new Map<string, string>()

	private browserListeners = new Set<BrowserActionListener>()
	private stepListeners = new Set<StepListener>()

	/** Log of everything that happened in the last run (newest last). */
	readonly log: string[] = []

	/** Approximation of the page view currently shown in the browser. */
	currentView: MockView = 'login'

	reset() {
		this.values.clear()
		this.log.length = 0
	}

	setValue(name: string, value: string) {
		if (name.trim()) this.values.set(name.trim(), value)
	}

	/** Replace `{{name}}` references with registered values. */
	resolve(text: string): string {
		return text.replace(/\{\{\s*([\w .-]+?)\s*\}\}/g, (_, name) => {
			return this.values.get(String(name).trim()) ?? ''
		})
	}

	onBrowserAction(listener: BrowserActionListener) {
		this.browserListeners.add(listener)
		return () => {
			this.browserListeners.delete(listener)
		}
	}

	onStep(listener: StepListener) {
		this.stepListeners.add(listener)
		return () => {
			this.stepListeners.delete(listener)
		}
	}

	act(action: BrowserAction) {
		this.log.push(action.label ?? action.kind)
		// Keep the view approximation in sync (used by card screenshots).
		if (action.kind === 'navigate' && action.url) {
			this.currentView = viewForUrl(action.url)
		} else if (
			action.kind === 'click' &&
			/sign ?in|log ?in|submit/i.test(action.target ?? '')
		) {
			this.currentView = 'dashboard'
		}
		for (const listener of this.browserListeners) listener(action)
		for (const listener of this.stepListeners) listener(action.label ?? action.kind)
	}
}

export const kaneRuntime = new KaneRuntime()

/** A condition authored either in natural language or as operand/operator/operand. */
export interface KaneCondition {
	mode: 'nl' | 'structured'
	nl: string
	left: string
	op: string
	right: string
}

export const CONDITION_OPS = ['==', '!=', '>', '<', '>=', '<=', 'contains'] as const

/**
 * Deterministic mock evaluation of a condition. Structured conditions compare
 * for real (with `{{name}}` resolution); natural-language conditions use a
 * simple negation heuristic so demos behave predictably.
 */
export function evalCondition(cond: KaneCondition): boolean {
	if (cond.mode === 'structured') {
		const left = kaneRuntime.resolve(cond.left).trim()
		const right = kaneRuntime.resolve(cond.right).trim()
		const ln = Number(left)
		const rn = Number(right)
		const numeric = left !== '' && right !== '' && !Number.isNaN(ln) && !Number.isNaN(rn)
		switch (cond.op) {
			case '==':
				return numeric ? ln === rn : left === right
			case '!=':
				return numeric ? ln !== rn : left !== right
			case '>':
				return numeric ? ln > rn : left > right
			case '<':
				return numeric ? ln < rn : left < right
			case '>=':
				return numeric ? ln >= rn : left >= right
			case '<=':
				return numeric ? ln <= rn : left <= right
			case 'contains':
				return left.toLowerCase().includes(right.toLowerCase())
			default:
				return true
		}
	}
	const nl = kaneRuntime.resolve(cond.nl).toLowerCase()
	if (!nl.trim()) return true
	return !/\b(not|no|never|fail|failed|error|invalid|missing|absent)\b|n't\b/.test(nl)
}

/** Mock 6-digit TOTP code derived from the key + current 30s window. */
export function totpCode(key: string, at = Date.now()): string {
	const window30 = Math.floor(at / 30_000)
	let hash = 2166136261
	const input = `${key}:${window30}`
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return String(Math.abs(hash) % 1_000_000).padStart(6, '0')
}

/** Seconds remaining in the current 30s TOTP window. */
export function totpSecondsLeft(at = Date.now()): number {
	return 30 - Math.floor((at % 30_000) / 1000)
}
