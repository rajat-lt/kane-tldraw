import { MeshGradient } from '@paper-design/shaders-react'
import { useValue } from 'tldraw'
import { executionState } from '../execution/executionState'
import { useKaneApp } from './KaneAppContext'

/**
 * Ambient shader wash behind the infinite canvas.
 *
 * Sits underneath tldraw's grid and shapes at very low opacity. Its speed and
 * palette shift when the agent is generating (violet, livelier) versus idle
 * (near-still, neutral), so the canvas feels alive without competing with the
 * cards.
 *
 * Rendered outside the tldraw container and pointer-events:none, so it can
 * never intercept canvas input.
 */

const IDLE_COLORS_LIGHT = ['#eef2f8', '#e7edf6', '#f3f0fb', '#eef4f1']
const BUSY_COLORS_LIGHT = ['#e3d9fb', '#dbe7fb', '#f0e6ff', '#e7f0ff']
const IDLE_COLORS_DARK = ['#171b22', '#161a21', '#1a1826', '#151a20']
const BUSY_COLORS_DARK = ['#241d3a', '#1a2440', '#2a2046', '#1b2742']

export function AmbientShader() {
	const { editor, generating, theme } = useKaneApp()

	const running = useValue(
		'workflow running',
		() => (editor ? executionState.get(editor).runningGraph !== null : false),
		[editor]
	)

	const reduce =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches

	const busy = generating || running
	const dark = theme === 'dark'
	const colors = dark
		? busy
			? BUSY_COLORS_DARK
			: IDLE_COLORS_DARK
		: busy
			? BUSY_COLORS_LIGHT
			: IDLE_COLORS_LIGHT

	return (
		<div className="kane-ambient" aria-hidden data-busy={busy ? 'true' : 'false'}>
			<MeshGradient
				colors={colors}
				distortion={busy ? 0.9 : 0.55}
				swirl={busy ? 0.7 : 0.35}
				speed={reduce ? 0 : busy ? 0.28 : 0.06}
				style={{ width: '100%', height: '100%' }}
			/>
		</div>
	)
}
