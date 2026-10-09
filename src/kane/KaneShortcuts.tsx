import { useEffect } from 'react'
import { createShapeId, useEditor } from 'tldraw'
import { getNodeDefinitions } from '../nodes/nodeTypes'
import { beautifyCanvas, createModuleFrame, createNodeShape } from './graphOps'
import { finderState, kaneToast } from './uiState'

/**
 * Global keyboard handling:
 * - Mac shortcuts for every command (⌥P/T/S/V data cards, ⌥I/W controls,
 *   ⌥C/O/N mostly-used, ⌥M module, ⌥B beautify, ⌘F find, V select).
 * - Disables tldraw's built-in tool shortcuts (R, T, K, L, G, F, D, A, B).
 */

const BLOCKED_TLDRAW_KEYS = new Set(['r', 't', 'k', 'l', 'g', 'f', 'd', 'a', 'b'])

const ALT_CREATE_BY_CODE: Record<string, string> = {
	KeyP: 'parameter',
	KeyT: 'totp',
	KeyS: 'secret',
	KeyV: 'variable',
	KeyI: 'ifelse',
	KeyW: 'while',
	KeyC: 'click',
	KeyO: 'open',
	KeyN: 'input',
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	return !!target.closest(
		'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
	)
}

export function KaneShortcuts() {
	const editor = useEditor()

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			// ⌘F — find on canvas
			if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF' && !e.altKey && !e.shiftKey) {
				e.preventDefault()
				e.stopPropagation()
				finderState.update(editor, (s) => ({ ...s, open: !s.open }))
				return
			}

			if (isEditableTarget(e.target)) return

			// ⌥ command shortcuts
			if (e.altKey && !e.metaKey && !e.ctrlKey) {
				const kind = ALT_CREATE_BY_CODE[e.code]
				if (kind) {
					e.preventDefault()
					e.stopPropagation()
					const defs = getNodeDefinitions(editor)
					const def = defs[kind as keyof typeof defs]
					createNodeShape(
						editor,
						createShapeId(),
						editor.getViewportPageBounds().center,
						def.getDefault()
					)
					return
				}
				if (e.code === 'KeyM') {
					e.preventDefault()
					e.stopPropagation()
					createModuleFrame(editor, editor.getViewportPageBounds().center)
					return
				}
				if (e.code === 'KeyB') {
					e.preventDefault()
					e.stopPropagation()
					const moved = beautifyCanvas(editor)
					if (moved > 0) {
						window.setTimeout(() => {
							editor.zoomToFit({ animation: { duration: 320 } })
						}, 380)
					}
					kaneToast(moved > 0 ? `Aligned ${moved} cards` : 'No loose cards to align', moved > 0 ? 'success' : 'info')
					return
				}
				return
			}

			// Block tldraw's default tool shortcuts (R/T/K/L/G/F/D/A/B).
			if (
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				BLOCKED_TLDRAW_KEYS.has(e.key.toLowerCase())
			) {
				e.preventDefault()
				e.stopPropagation()
			}
		}

		// Capture phase so this runs before tldraw's own listeners.
		window.addEventListener('keydown', onKeyDown, { capture: true })
		return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
	}, [editor])

	return null
}
