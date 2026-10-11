import { Editor, TLShapeId } from 'tldraw'
import { EditorAtom } from '../utils'

/** Cross-component UI signals. */

/**
 * Shapes (cards + connection wires) the AI agent is currently materializing.
 * While a shape id is in here it renders with the "under creation" shimmer.
 */
export const aiBuildState = new EditorAtom<{ ids: TLShapeId[] }>('ai building', () => ({
	ids: [],
}))

export function markAiBuilding(editor: Editor, id: TLShapeId) {
	aiBuildState.update(editor, (s) => (s.ids.includes(id) ? s : { ids: [...s.ids, id] }))
}

export function clearAiBuilding(editor: Editor, id?: TLShapeId) {
	aiBuildState.update(editor, (s) =>
		id === undefined ? { ids: [] } : { ids: s.ids.filter((x) => x !== id) }
	)
}

/** Cards to flash with the error highlight (set by the topbar error chip). */
export const errorFlashState = new EditorAtom<{ ids: TLShapeId[]; at: number }>(
	'error flash',
	() => ({ ids: [], at: 0 })
)

/** Card whose heading is being renamed (set from the context menu). */
export const renameState = new EditorAtom<TLShapeId | null>('rename card', () => null)

/**
 * The card whose AI composer is open, if any.
 *
 * It lives here rather than inside the card because the composer is a popover
 * beside the card, not part of it: it is drawn on the canvas overlay in
 * viewport pixels so it stays a readable size at any zoom, which means it
 * cannot be a child of a shape that scales with the camera.
 */
export const cardAiState = new EditorAtom<TLShapeId | null>('card ai composer', () => null)

/** Cmd+F finder visibility. */
export const finderState = new EditorAtom<{ open: boolean }>('finder', () => ({ open: false }))

/** Fire a Kane toast from outside React (side effects, overlays). */
/**
 * Toast from outside React. The tone travels with the message so a rule that
 * blocked something reads as an error and a completed action reads as success.
 */
export function kaneToast(message: string, tone: 'success' | 'info' | 'error' = 'info') {
	window.dispatchEvent(new CustomEvent('kane-toast', { detail: { msg: message, tone } }))
}

/** What a run that went through to its end actually did. */
export interface RunSummary {
	/** Cards that ran to completion. */
	steps: number
	/** Wall-clock time, left out when the run sat paused (it would overstate it). */
	ms?: number
}

function formatRunTime(ms: number) {
	const s = ms / 1000
	if (s < 10) return `${s.toFixed(1)}s`
	if (s < 60) return `${Math.round(s)}s`
	return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/** Report a finished run: the toast that carries the run tray (see RunTray). */
export function kaneRunToast(run: RunSummary) {
	const steps = `${run.steps} step${run.steps === 1 ? '' : 's'} passed`
	const msg = run.ms === undefined ? steps : `${steps} in ${formatRunTime(run.ms)}`
	window.dispatchEvent(new CustomEvent('kane-toast', { detail: { msg, tone: 'success', run } }))
}
