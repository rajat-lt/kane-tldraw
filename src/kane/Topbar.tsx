import {
	AlertTriangle,
	Copy,
	Info,
	Pause,
	Play,
	Redo2,
	Save,
	Share2,
	Split,
	Square,
	Undo2,
	X,
} from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, useValue } from 'tldraw'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	executionState,
	pauseExecution,
	resumeExecution,
	startExecution,
	stopExecution,
} from '../execution/executionState'
import { runPaused } from '../execution/runControl'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { CURRENT_USER, useKaneApp } from './KaneAppContext'
import { KaneLogo } from './KaneLogo'
import { SessionStatus } from './ModeCluster'
import { getRunCursorTarget } from './RunCursor'
import { Tip } from './Tooltip'
import { errorFlashState } from './uiState'

/**
 * Topbar (52px) — logo, inline-editable filename, info popover, canvas counts,
 * session status, undo/redo, theme toggle, Save/Create buttons, avatar menu.
 */

/** Quick counts of runnable / incomplete / assertion cards on the canvas. */
function CanvasStats() {
	const { editor } = useKaneApp()
	const stats = useValue(
		'canvas stats',
		() => {
			if (!editor) return { runnable: 0, error: 0, assertion: 0 }
			const nodes = editor
				.getCurrentPageShapes()
				.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
			let runnable = 0
			let error = 0
			let assertion = 0
			for (const shape of nodes) {
				const node = shape.props.node as { type: string; url?: string; target?: string }
				if (!getNodePortConnections(editor, shape).some((c) => c.terminal === 'end')) {
					runnable++
				}
				if (node.type === 'ifelse') assertion++
				if (
					(node.type === 'open' && !node.url?.trim()) ||
					((node.type === 'click' || node.type === 'input') && !node.target?.trim())
				) {
					error++
				}
			}
			return { runnable, error, assertion }
		},
		[editor]
	)

	// Clicking the error chip zooms out to show every incomplete card, flashes
	// them, and selects them.
	const revealErrors = () => {
		if (!editor) return
		const errorCards = editor
			.getCurrentPageShapes()
			.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
			.filter((s) => {
				const node = s.props.node as { type: string; url?: string; target?: string }
				return (
					(node.type === 'open' && !node.url?.trim()) ||
					((node.type === 'click' || node.type === 'input') && !node.target?.trim())
				)
			})
		if (errorCards.length === 0) return
		let bounds: Box | null = null
		for (const card of errorCards) {
			const b = editor.getShapePageBounds(card.id)
			if (!b) continue
			bounds = bounds ? bounds.union(b) : Box.From(b)
		}
		if (!bounds) return
		const ids = errorCards.map((c) => c.id)
		editor.setSelectedShapes(ids)
		editor.zoomToBounds(bounds.expandBy(160), { animation: { duration: 320 } })
		errorFlashState.set(editor, { ids, at: Date.now() })
		window.setTimeout(() => {
			errorFlashState.set(editor, { ids: [], at: 0 })
		}, 2000)
	}

	return (
		<div className="topbar-stats" aria-label="Canvas summary">
			<Tip label="Runnable start cards">
				<span className="stat-chip stat-chip_run">
					<Play size={12} />
					<NumberFlow value={stats.runnable} respectMotionPreference />
				</span>
			</Tip>
			<Tip label="Incomplete cards (missing target or URL) — click to reveal" wrap>
				<button
					className={`stat-chip stat-chip_button ${stats.error > 0 ? 'stat-chip_error' : ''}`}
					aria-label="Incomplete cards — click to reveal"
					onClick={revealErrors}
				>
					<AlertTriangle size={12} />
					<NumberFlow value={stats.error} respectMotionPreference />
				</button>
			</Tip>
			<Tip label="Assertion (If / Else) cards">
				<span className="stat-chip stat-chip_assert">
					<Split size={12} />
					<NumberFlow value={stats.assertion} respectMotionPreference />
				</span>
			</Tip>
		</div>
	)
}

function UndoRedo() {
	const { editor } = useKaneApp()
	const canUndo = useValue('can undo', () => editor?.getCanUndo() ?? false, [editor])
	const canRedo = useValue('can redo', () => editor?.getCanRedo() ?? false, [editor])
	return (
		<>
			<Tip label="Undo">
				<button
					className="icon-btn"
					aria-label="Undo"
					disabled={!canUndo}
					onClick={() => editor?.undo()}
				>
					<Undo2 size={17} />
				</button>
			</Tip>
			<Tip label="Redo">
				<button
					className="icon-btn"
					aria-label="Redo"
					disabled={!canRedo}
					onClick={() => editor?.redo()}
				>
					<Redo2 size={17} />
				</button>
			</Tip>
		</>
	)
}

/**
 * Save — cuts a new version of the test case.
 *
 * Saving is deliberate here, not automatic: a test case is versioned, and every
 * version carries a message saying what changed. So the button opens a small
 * composer for that message rather than writing silently, and it stays disabled
 * until there is something to save.
 */
function SaveButton() {
	const { testCase, unsaved, versions, saveVersion, draftCommitMessage, pushToast } = useKaneApp()
	const [open, setOpen] = useState(false)
	const [message, setMessage] = useState('')
	const anchorRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	const close = useCallback(() => {
		setOpen(false)
		setMessage('')
	}, [])
	useOutsideClick([anchorRef], close, open)
	useEscape(close, open)

	// The message is drafted from the diff against the last saved version, so
	// the common case is reading one line and pressing Save. It is ordinary text
	// in an ordinary textarea — select all and type over it, or edit a word.
	useEffect(() => {
		if (!open) return
		const draft = draftCommitMessage()
		if (draft) setMessage(draft)
		window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 20)
	}, [open, draftCommitMessage])

	const commit = () => {
		if (!message.trim()) return
		saveVersion(message)
		pushToast(`Saved v${testCase.version + 1} — “${message.trim()}”`, 'success')
		close()
	}

	return (
		<div style={{ position: 'relative' }} ref={anchorRef}>
			<Tip label={unsaved ? 'Save a new version' : 'No changes since the last version'} wrap>
				<button
					className="btn btn-secondary"
					disabled={!unsaved}
					onClick={() => setOpen((v) => !v)}
				>
					<Save size={13} />
					Save
					{unsaved && <span className="save-dot" aria-hidden />}
				</button>
			</Tip>
			{open && (
				<div
					className="popover save-popover"
					role="dialog"
					aria-label="Save a new version"
					style={{ top: 'calc(var(--topbar-h) - 6px)', right: 0 }}
				>
					<span className="popover-caret" style={{ top: -6, right: 26 }} />
					<div className="save-head">
						<strong>Save a new version</strong>
						<span className="save-bump">
							v{testCase.version} → v{testCase.version + 1}
						</span>
					</div>
					<textarea
						ref={inputRef}
						className="save-message"
						value={message}
						placeholder="What changed in this version?"
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={(e) => {
							// ⌘↵ / Ctrl+↵ saves, matching every other commit box
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								e.preventDefault()
								commit()
							}
						}}
						rows={3}
						spellCheck
					/>
					<div className="save-actions">
						{versions.length > 0 && (
							<span className="save-last" title={versions[0].message}>
								Last: {versions[0].message}
							</span>
						)}
						<button className="btn btn-secondary" onClick={close}>
							Cancel
						</button>
						<button className="btn btn-primary" onClick={commit} disabled={!message.trim()}>
							Save version
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

/** Share — a link to this test case, for whoever needs to look at it. */
function ShareButton() {
	const { testCase, pushToast } = useKaneApp()
	const [open, setOpen] = useState(false)
	const anchorRef = useRef<HTMLDivElement>(null)
	const close = useCallback(() => setOpen(false), [])
	useOutsideClick([anchorRef], close, open)
	useEscape(close, open)

	const link = `https://app.lambdatest.com/kane/test-cases/${testCase.id}`

	return (
		<div style={{ position: 'relative' }} ref={anchorRef}>
			<Tip label="Share this test case">
				<button
					className={`icon-btn ${open ? 'is-active' : ''}`}
					aria-label="Share this test case"
					onClick={() => setOpen((v) => !v)}
				>
					<Share2 size={17} />
				</button>
			</Tip>
			{open && (
				<div
					className="popover share-popover"
					role="dialog"
					aria-label="Share"
					style={{ top: 'calc(var(--topbar-h) - 6px)', right: 0 }}
				>
					<span className="popover-caret" style={{ top: -6, right: 14 }} />
					<div className="share-head">Anyone in your org with the link can view</div>
					<div className="share-row">
						<input className="share-link" value={link} readOnly onFocus={(e) => e.target.select()} />
						<button
							className="btn btn-secondary"
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(link)
									pushToast('Link copied', 'success')
								} catch {
									pushToast('Could not reach the clipboard — select and copy', 'error')
								}
							}}
						>
							<Copy size={13} />
							Copy
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

/**
 * The primary action. This test case already exists (it has an id and a
 * version), so there is nothing to create — the useful action is running it.
 * It starts from whichever card is currently wearing the Run label, exactly
 * like pressing play on the label itself.
 *
 * Once it is running the same button holds the run instead: Run steps → Pause →
 * Resume. The three states are one control because they are one question — is
 * this thing going or not — and the label morphs between them rather than
 * swapping, so the button reads as changing its mind rather than being replaced.
 * Stopping is a different question, and gets its own button beside it.
 */
type RunMode = 'idle' | 'running' | 'paused'

const RUN_MODE_LABELS: Record<RunMode, string> = {
	idle: 'Run steps',
	running: 'Pause',
	paused: 'Resume',
}

function RunStepsButton() {
	const { editor } = useKaneApp()
	const running = useValue(
		'is running',
		() => (editor ? executionState.get(editor).runningGraph !== null : false),
		[editor]
	)
	const paused = useValue('is paused', () => runPaused.get(), [])
	const target = useValue(
		'run target',
		() => (editor ? getRunCursorTarget(editor) : null),
		[editor]
	)

	const mode: RunMode = !running ? 'idle' : paused ? 'paused' : 'running'

	return (
		<>
			{running && (
				<Tip label="Stop the run">
					<button
						className="icon-btn"
						aria-label="Stop the run"
						onClick={() => editor && stopExecution(editor)}
					>
						<Square size={15} fill="currentColor" />
					</button>
				</Tip>
			)}
			<Tip
				wrap
				label={
					mode === 'running'
						? 'Hold the run where it is'
						: mode === 'paused'
							? 'Carry on from where the run stopped'
							: target
								? 'Run the workflow from the card holding the Run label'
								: 'Connect some cards first — the Run label marks where a run starts'
				}
			>
				<motion.button
					layout
					transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
					className="btn btn-primary"
					disabled={mode === 'idle' && !target}
					onClick={() => {
						if (!editor) return
						if (mode === 'running') pauseExecution(editor)
						else if (mode === 'paused') resumeExecution(editor)
						else if (target) startExecution(editor, new Set([target]))
					}}
				>
					{/* Both labels share one grid cell, so the outgoing one fades up
					    and out while the incoming one rises into its place and the
					    button's width springs between the two. */}
					<span className="run-morph">
						<AnimatePresence initial={false}>
							<motion.span
								key={mode}
								className="run-morph-item"
								initial={{ opacity: 0, y: 9, filter: 'blur(4px)' }}
								animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
								exit={{ opacity: 0, y: -9, filter: 'blur(4px)' }}
								transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
							>
								{mode === 'running' ? (
									<Pause size={13} fill="currentColor" />
								) : (
									<Play size={13} fill="currentColor" />
								)}
								{RUN_MODE_LABELS[mode]}
							</motion.span>
						</AnimatePresence>
					</span>
				</motion.button>
			</Tip>
		</>
	)
}

/** Where this test case lives, plus the device it targets. */
const FILE_INFO: Record<string, string> = {
	Project: 'LambdaTest Web',
	Folder: 'Regression / Checkout',
	Device: 'Samsung Galaxy S26+',
	// OS type and version read as one fact, so they're one field
	OS: 'Android 16.0',
}

type Priority = 'low' | 'medium' | 'high'
type Status = 'ready' | 'live' | 'unverified' | 'faulty' | 'archived'

const PRIORITIES: { value: Priority; label: string }[] = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
]

const STATUSES: { value: Status; label: string }[] = [
	{ value: 'ready', label: 'Ready' },
	{ value: 'live', label: 'Live' },
	{ value: 'unverified', label: 'Unverified' },
	{ value: 'faulty', label: 'Faulty' },
	{ value: 'archived', label: 'Archived' },
]

/**
 * A labelled dropdown in the info popover, opening on the current value. Used
 * for both priority and status; the value tints the trigger through a modifier
 * class so the setting is readable without opening it.
 */
function InfoSelect<T extends string>({
	label,
	value,
	options,
	onChange,
	kind,
}: {
	label: string
	value: T
	options: { value: T; label: string }[]
	onChange: (next: T) => void
	kind: 'priority' | 'status'
}) {
	return (
		<div className={`info-select-field kane-ui`}>
			<div className="info-label">{label}</div>
			<Select value={value} onValueChange={(next) => onChange(next as T)}>
				<SelectTrigger
					aria-label={label}
					className={`info-select info-select_${kind} info-select_${value}`}
					size="sm"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="kane-ui info-select-menu">
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

function useOutsideClick(
	refs: React.RefObject<HTMLElement | null>[],
	handler: () => void,
	active = true
) {
	useEffect(() => {
		if (!active) return
		function onDown(e: MouseEvent) {
			const target = e.target as Node
			for (const r of refs) {
				if (r.current && r.current.contains(target)) return
			}
			// Radix renders select/dropdown content in a portal on <body>, so a
			// click on an option is "outside" this popover by DOM containment —
			// which would tear the popover down mid-selection and swallow the
			// change. Anything inside a portalled layer belongs to the popover.
			if (
				target instanceof Element &&
				target.closest('[data-radix-popper-content-wrapper], [data-slot="select-content"]')
			) {
				return
			}
			handler()
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handler, active])
}

function useEscape(handler: () => void, active = true) {
	useEffect(() => {
		if (!active) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') handler()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [handler, active])
}

function InfoPopover({
	anchorRef,
	onClose,
	priority,
	setPriority,
	status,
	setStatus,
	testCase,
}: {
	anchorRef: React.RefObject<HTMLElement | null>
	onClose: () => void
	priority: Priority
	setPriority: (p: Priority) => void
	status: Status
	setStatus: (s: Status) => void
	testCase: { id: string; version: number }
}) {
	const ref = useRef<HTMLDivElement>(null)
	useOutsideClick([ref, anchorRef], onClose)
	useEscape(onClose)
	return (
		<div
			ref={ref}
			className="popover info-popover"
			role="dialog"
			aria-label="File info"
			style={{ top: 'calc(var(--topbar-h) - 6px)', left: 0 }}
		>
			<span className="popover-caret" style={{ top: -6, left: 20 }} />
			<button className="icon-btn popover-close" onClick={onClose} aria-label="Close">
				<X size={14} />
			</button>
			{/* An existing test case identifies itself first — id and version. */}
			<div className="info-identity">
				<span className="info-tc-id">{testCase.id}</span>
				<span className="info-tc-version">v{testCase.version}</span>
			</div>
			<div className="info-grid">
				{Object.entries(FILE_INFO).map(([label, value]) => (
					<div key={label}>
						<div className="info-label">{label}</div>
						<div className="info-value">{value}</div>
					</div>
				))}
			</div>
			{/* Changing either setting leaves the popover open — closing it is the
			    user's call, not a side effect of picking a value. */}
			<div className="info-selects">
				<InfoSelect
					kind="status"
					label="Status"
					value={status}
					options={STATUSES}
					onChange={setStatus}
				/>
				<InfoSelect
					kind="priority"
					label="Priority"
					value={priority}
					options={PRIORITIES}
					onChange={setPriority}
				/>
			</div>
		</div>
	)
}

function AvatarMenu({
	anchorRef,
	onClose,
}: {
	anchorRef: React.RefObject<HTMLElement | null>
	onClose: () => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	useOutsideClick([ref, anchorRef], onClose)
	useEscape(onClose)
	return (
		<div
			ref={ref}
			className="popover menu"
			role="menu"
			style={{ top: 'calc(var(--topbar-h) - 6px)', right: 0 }}
		>
			<button className="menu-item" role="menuitem">
				Account settings
			</button>
			<button className="menu-item" role="menuitem">
				Org settings
			</button>
			<div className="menu-divider" />
			<button className="menu-item" role="menuitem">
				Logout
			</button>
		</div>
	)
}

export function Topbar() {
	const { markUnsaved, testCase } = useKaneApp()
	const [name, setName] = useState('Checkout regression suite')
	const [editing, setEditing] = useState(false)
	const [infoOpen, setInfoOpen] = useState(false)
	const [priority, setPriorityRaw] = useState<Priority>(
		() => (localStorage.getItem('kane-priority') as Priority) || 'medium'
	)
	const setPriority = (p: Priority) => {
		setPriorityRaw(p)
		localStorage.setItem('kane-priority', p)
		markUnsaved()
	}
	const [status, setStatusRaw] = useState<Status>(
		() => (localStorage.getItem('kane-status') as Status) || 'ready'
	)
	const setStatus = (s: Status) => {
		setStatusRaw(s)
		localStorage.setItem('kane-status', s)
		markUnsaved()
	}
	const [menuOpen, setMenuOpen] = useState(false)
	const infoRef = useRef<HTMLButtonElement>(null)
	const avatarRef = useRef<HTMLButtonElement>(null)

	return (
		<header className="topbar">
			<div className="logo">
				<KaneLogo size={28} />
			</div>

			<div className="filename-wrap">
				{editing ? (
					<input
						className="filename-input"
						value={name}
						autoFocus
						onChange={(e) => setName(e.target.value)}
						onBlur={() => setEditing(false)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === 'Escape') setEditing(false)
						}}
					/>
				) : (
					<Tip label={`${name} — click to rename`} wrap>
						<span className="filename" onClick={() => setEditing(true)}>
							{name}
						</span>
					</Tip>
				)}
			</div>

			{/* The test case wears its id and current version. */}
			<Tip label={`Test case ${testCase.id}, version ${testCase.version}`} wrap>
				<span className="tc-badge">
					<span className="tc-badge-id">{testCase.id}</span>
					<span className="tc-badge-sep" />
					<span className="tc-badge-version">v{testCase.version}</span>
				</span>
			</Tip>

			<div style={{ position: 'relative' }}>
				<Tip label="Test case details">
					<button
						ref={infoRef}
						className={`icon-btn ${infoOpen ? 'is-active' : ''}`}
						aria-label="File info"
						onClick={() => {
							setInfoOpen((v) => !v)
							setMenuOpen(false)
						}}
					>
						<Info size={18} />
					</button>
				</Tip>
				{infoOpen && (
					<InfoPopover
						anchorRef={infoRef}
						onClose={() => setInfoOpen(false)}
						priority={priority}
						setPriority={setPriority}
						status={status}
						setStatus={setStatus}
						testCase={testCase}
					/>
				)}
			</div>

			<div className="spacer" />

			<CanvasStats />
			<SessionStatus />
			<span className="topbar-divider" />
			<UndoRedo />
			<span className="topbar-divider" />

			<ShareButton />
			<RunStepsButton />
			<SaveButton />

			<div style={{ position: 'relative' }}>
				<Tip label={`Account — ${CURRENT_USER.name}`} side="left" wrap>
					<button
						ref={avatarRef}
						className="avatar"
						aria-label={`Account menu — ${CURRENT_USER.name}`}
						onClick={() => {
							setMenuOpen((v) => !v)
							setInfoOpen(false)
						}}
					>
						{CURRENT_USER.initials}
					</button>
				</Tip>
				{menuOpen && <AvatarMenu anchorRef={avatarRef} onClose={() => setMenuOpen(false)} />}
			</div>
		</header>
	)
}
