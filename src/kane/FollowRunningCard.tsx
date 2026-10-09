import { useEffect, useRef } from 'react'
import { useEditor, useValue } from 'tldraw'
import { executionState } from '../execution/executionState'
import { useKaneApp } from './KaneAppContext'

/**
 * Keeps the card being executed inside the visible canvas while a run is in
 * flight and the browser is docked beside it.
 *
 * With the browser open the canvas is only a few hundred pixels wide, so the
 * run walks off-screen within a couple of steps and you lose track of which
 * card the page is acting on. This pans to follow it.
 *
 * It only nudges when the card is actually out of view (or close to the edge),
 * so a run that stays inside the viewport doesn't jitter, and it never changes
 * the zoom — the user's chosen scale is theirs.
 */

/** Keep this much clear space around the card before panning. */
const EDGE_MARGIN = 48

export function FollowRunningCard() {
	const editor = useEditor()
	const { browserView } = useKaneApp()
	const lastFollowed = useRef<string | null>(null)

	const runningId = useValue(
		'following executing card',
		() => executionState.get(editor).runningGraph?.currentExecuting.get() ?? null,
		[editor]
	)

	useEffect(() => {
		// only while the canvas is squeezed next to the browser
		if (browserView !== 'split' || !runningId) {
			lastFollowed.current = null
			return
		}
		if (lastFollowed.current === runningId) return
		lastFollowed.current = runningId

		const bounds = editor.getShapePageBounds(runningId)
		if (!bounds) return
		const viewport = editor.getViewportPageBounds()

		// how much of the margin is available in page units at this zoom
		const margin = EDGE_MARGIN / editor.getZoomLevel()
		const inView =
			bounds.minX >= viewport.minX + margin &&
			bounds.maxX <= viewport.maxX - margin &&
			bounds.minY >= viewport.minY + margin &&
			bounds.maxY <= viewport.maxY - margin
		if (inView) return

		// The eased pan is driven by requestAnimationFrame, which a hidden tab
		// throttles to a standstill — the camera would never arrive, and coming
		// back to the tab mid-run would show the wrong part of the canvas. Jump
		// straight there instead when there's nobody watching it move.
		editor.centerOnPoint(
			bounds.center,
			document.hidden ? undefined : { animation: { duration: 260 } }
		)
	}, [editor, runningId, browserView])

	return null
}
