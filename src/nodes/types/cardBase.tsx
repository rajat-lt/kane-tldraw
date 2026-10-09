import { T } from 'tldraw'

/**
 * The fields every card carries, whatever it does.
 *
 * Kept in its own module with no imports beyond tldraw's validators, so card
 * validators can spread it at module-evaluation time without pulling
 * `shared`/`nodeTypes` into an import cycle — the same reason `lastShot` lives
 * apart.
 *
 * Everything here is optional: documents saved before any of it existed have to
 * keep loading.
 */

/** What a card's last run left behind, for the Screenshot and Thought tabs. */
export const CardRun = T.object({
	/** How long the step took, in ms — "Thought for 4s." */
	ms: T.number,
	/** The agent's narration of this one step. */
	thought: T.string,
	/** Which mock-page view to draw in the Screenshot tab. */
	view: T.string,
	/** What the step acted on, marked on the screenshot. */
	target: T.string.optional(),
})
	.nullable()
	.optional()
export type CardRun = T.TypeOf<typeof CardRun>

/** What a step does when it fails. */
export const FAILURE_MODES = ['fail', 'continue', 'retry'] as const
export type FailureMode = (typeof FAILURE_MODES)[number]

export const FAILURE_LABELS: Record<FailureMode, string> = {
	fail: 'Fail Immediately',
	continue: 'Continue on failure',
	retry: 'Retry once, then fail',
}

export const DEFAULT_TIMEOUT_MS = 10_000

/** Which tab of the card's panel is open. Absent or null = the panel is closed. */
export const CardPanelTab = T.literalEnum('screenshot', 'thought', 'settings')
	.nullable()
	.optional()
export type CardPanelTab = T.TypeOf<typeof CardPanelTab>

/**
 * Spread into every card's validator:
 *
 *   T.object({ type: T.literal('click'), ...CARD_BASE, target: T.string })
 */
export const CARD_BASE = {
	/** The card's own title, when it has been renamed. */
	label: T.string.optional(),
	/** Which panel tab is open below the body. */
	panel: CardPanelTab,
	/** What to do when this step fails. */
	failure: T.literalEnum(...FAILURE_MODES).optional(),
	/** How long to wait for the step before giving up, in ms. */
	timeoutMs: T.number.optional(),
	/** What the last run produced. */
	run: CardRun,
}

/** A card as the shell sees it — every field optional, none of them its own. */
export interface CardBaseFields {
	label?: string
	panel?: CardPanelTab
	failure?: FailureMode
	timeoutMs?: number
	run?: CardRun
}
