import { atom, react } from 'tldraw'
import { sleep } from '../utils/sleep'

/**
 * Whether the run is paused.
 *
 * A pause has to reach two places. The scheduler won't start the next card
 * while it is set — but a step in this prototype is deliberately slow, so
 * waiting for the current one to finish would leave Pause feeling broken for a
 * second or two. Every wait *inside* a step goes through {@link runSleep} as
 * well, which is what makes a pause land more or less when it is pressed.
 *
 * It lives outside the editor because it is a property of the run, and the run
 * already owns it: `startExecution` clears it, and so do stopping and finishing.
 */
export const runPaused = atom<boolean>('run paused', false)

/** Resolves as soon as the run isn't paused — immediately, if it never was. */
export function whenResumed(): Promise<void> {
	if (!runPaused.get()) return Promise.resolve()
	return new Promise<void>((resolve) => {
		let stop: (() => void) | undefined
		stop = react('wait for resume', () => {
			if (runPaused.get()) return
			// react() runs its effect once on subscribe, before `stop` has been
			// assigned — so unsubscribing is deferred a tick either way.
			queueMicrotask(() => {
				stop?.()
				resolve()
			})
		})
	})
}

/**
 * A wait inside a running step: the delay itself, plus however long the run is
 * paused around it. Cards use this rather than the bare {@link sleep} so that
 * pausing holds them mid-step; the agent's own pacing is unaffected.
 */
export async function runSleep(ms: number): Promise<void> {
	await whenResumed()
	await sleep(ms)
	await whenResumed()
}
