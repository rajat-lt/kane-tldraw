/**
 * How fast the prototype pretends to work.
 *
 * Every simulated delay — a card being executed, a wire drawing itself, the
 * planner "thinking" — runs through `paced()`, so the whole demo speeds up or
 * slows down from one number. It is deliberately slower than a real automation
 * run would be: this is shown to a room, and a step that completes in 200ms is
 * over before anyone has found it on screen.
 *
 * Raise it for a larger room, lower it toward 1 to get back to real-ish speed.
 */
export const DEMO_PACE = 1.9

/** A base duration in ms, stretched to demo speed. */
export function paced(ms: number): number {
	return Math.round(ms * DEMO_PACE)
}
