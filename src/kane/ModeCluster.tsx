import { Frame, Globe } from 'lucide-react'
import { useValue } from 'tldraw'
import { executionState } from '../execution/executionState'
import { SESSION_STATES, SessionKey } from './catalog'
import { useKaneApp } from './KaneAppContext'
import { Tip } from './Tooltip'

/**
 * Session status + Canvas/Browser segmented control — always shown together
 * (top-right in Canvas mode, in the browser sub-topbar in Browser mode).
 * Same as the previous build; the segmented control is a faithful custom
 * re-implementation (no Primer dependency).
 */

export function SessionStatus() {
	const { editor, recording, generating, disconnected } = useKaneApp()

	const running = useValue(
		'workflow running',
		() => (editor ? executionState.get(editor).runningGraph !== null : false),
		[editor]
	)

	const key: SessionKey = disconnected
		? 'disconnected'
		: recording
			? 'recording'
			: generating
				? 'generating'
				: running
					? 'running'
					: 'idle'
	const s = SESSION_STATES[key]
	return (
		<span
			className="session-status"
			style={{ color: s.color, borderColor: s.color }}
			aria-label={`Session status: ${s.label}`}
		>
			<span className="dot" />
			{s.label}
		</span>
	)
}

/**
 * Canvas ↔ Browser. `compact` drops the labels down to icons, for the omnibox
 * footer where it sits among the other icon controls.
 */
export function ModeSegmented({ compact = false }: { compact?: boolean }) {
	const { browserView, setBrowserView } = useKaneApp()
	const browserOn = browserView !== 'closed'

	const canvas = (
		<button
			type="button"
			role="tab"
			aria-selected={!browserOn}
			aria-label="Canvas"
			className={`seg-btn ${!browserOn ? 'is-selected' : ''}`}
			onClick={() => setBrowserView('closed')}
		>
			<Frame size={14} />
			{!compact && 'Canvas'}
		</button>
	)
	const browser = (
		<button
			type="button"
			role="tab"
			aria-selected={browserOn}
			aria-label="Browser"
			className={`seg-btn ${browserOn ? 'is-selected' : ''}`}
			onClick={() => setBrowserView('split')}
		>
			<Globe size={14} />
			{!compact && 'Browser'}
		</button>
	)

	return (
		<div className={`seg ${compact ? 'seg_compact' : ''}`} role="tablist" aria-label="Mode">
			{compact ? (
				<>
					<Tip label="Canvas">{canvas}</Tip>
					<Tip label="Browser">{browser}</Tip>
				</>
			) : (
				<>
					{canvas}
					{browser}
				</>
			)}
		</div>
	)
}

export function ModeCluster({ className = '' }: { className?: string }) {
	return (
		<div className={`mode-cluster ${className}`}>
			<SessionStatus />
			<ModeSegmented />
		</div>
	)
}
