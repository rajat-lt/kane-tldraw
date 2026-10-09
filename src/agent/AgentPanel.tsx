import {
	AtSign,
	BookOpen,
	BoxSelect,
	Check,
	ClipboardList,
	Flag,
	Frame,
	HardDrive,
	Link2,
	Maximize2,
	Minimize2,
	Rocket,
	Slash,
	Sparkles,
	Square,
	StickyNote,
	Ticket,
	X,
} from 'lucide-react'
import gsap from 'gsap'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createShapeId, TLShapeId } from 'tldraw'
import {
	Attachment,
	AttachmentInfo,
	AttachmentPreview,
	AttachmentRemove,
	Attachments,
} from '@/components/ai-elements/attachments'
import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint'
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from '@/components/ai-elements/task'
import {
	Plan,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
	PlanTrigger,
} from '@/components/ai-elements/plan'
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemContent,
	QueueItemDescription,
	QueueItemIndicator,
	QueueList,
} from '@/components/ai-elements/queue'
import {
	PromptInput,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuItem,
	PromptInputActionMenuTrigger,
	PromptInputBody,
	PromptInputButton,
	PromptInputCommand,
	PromptInputCommandEmpty,
	PromptInputCommandGroup,
	PromptInputCommandInput,
	PromptInputCommandItem,
	PromptInputCommandList,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import {
	MessageScroller,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { SLASH_GROUPS, SlashCommand } from '../kane/catalog'
import { createNodeShape } from '../kane/graphOps'
import { ContextEntryItem, ContextItemKind, useKaneApp } from '../kane/KaneAppContext'
import { ModeSegmented } from '../kane/ModeCluster'
import { Tip } from '../kane/Tooltip'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { paced } from '../utils/pace'
import { sleep } from '../utils/sleep'
import { AttachMenu } from './AttachMenu'
import { BlurInText } from './BlurInText'
import { planWorkflow, PlannerUi, runWholeCanvas } from './planner'

/**
 * The Kane omnibox, built on AI Elements' PromptInput.
 *
 * PromptInput supplies the composer shell, the cmdk-backed slash menu, and
 * attachment handling (global document drop + file constraints). Kane keeps
 * its own behaviours on top: the objective → Context-sidebar lifecycle,
 * linked Jira/ADO/Confluence/Notion context, #TC mentions, and maximize.
 *
 * While the agent works, the sent objective and its streamed thinking sit
 * above the composer in a MessageScroller, rendered as AI Elements
 * ChainOfThought steps.
 */

interface ContextItem {
	id: number
	kind: ContextItemKind
	label: string
	shapeIds?: TLShapeId[]
}

/** One line of the agent's streamed thinking. */
type ThinkItem =
	| { id: number; kind: 'note'; text: string }
	| { id: number; kind: 'checkpoint'; text: string }
	| {
			id: number
			kind: 'step'
			tool: string
			target: string
			status: 'running' | 'complete' | 'error'
			ms?: number
	  }

interface RunState {
	objective: string
	items: ContextEntryItem[]
	thinking: ThinkItem[]
	plan: { title: string; steps: string[] } | null
	/**
	 * The work has finished and been filed to Context. The run stays on screen
	 * after this — it is the only place the thinking and the steps were ever
	 * shown, and wiping it the instant the last card landed left people with no
	 * idea where any of it had gone.
	 */
	done: boolean
}

/** Placeholder rotates through these so the composer hints at what it accepts. */
const PLACEHOLDER_EXAMPLES = [
	'Describe what to test…',
	'Test the login flow with a 2FA OTP code',
	'Search for a wireless mouse and assert the results',
	'Add an item to the cart, check out, and run it',
	'Loop through every row until the list is empty',
	'Reset the password and verify the email link',
	'Sign in, open Settings, and assert the plan name',
]
/**
 * Typing rhythm for the placeholder, in seconds. The hold dominates: a hint
 * that swaps too eagerly is harder to read than one that sits still, so each
 * example stays up long enough to finish reading before it clears.
 */
const TYPE_IN_S = 1.8
const HOLD_S = 4.5
const ERASE_S = 0.8
const BETWEEN_S = 0.5

/**
 * Types each placeholder in a character at a time, holds it, erases it and
 * moves on. GSAP drives the timing — a timeline tweening a character count,
 * which is what makes the in and out phases keep their own easing instead of
 * both marching at one fixed interval.
 *
 * Returns the text to show; the caller stops calling it when the composer is
 * in use, so the placeholder never moves under the user.
 */
function useTypedPlaceholder(examples: string[], active: boolean) {
	const [text, setText] = useState(examples[0] ?? '')

	useEffect(() => {
		if (!active) return
		const counter = { chars: 0 }
		const timeline = gsap.timeline({ repeat: -1 })

		examples.forEach((example) => {
			timeline
				.set(counter, { chars: 0 })
				.call(() => setText(''))
				.to(counter, {
					chars: example.length,
					duration: TYPE_IN_S,
					ease: 'none',
					onUpdate: () => setText(example.slice(0, Math.round(counter.chars))),
				})
				.to(counter, {
					chars: 0,
					duration: ERASE_S,
					ease: 'power1.in',
					delay: HOLD_S,
					onUpdate: () => setText(example.slice(0, Math.round(counter.chars))),
				})
				.to({}, { duration: BETWEEN_S })
		})

		return () => {
			timeline.kill()
		}
	}, [examples, active])

	return text
}

const CONTEXT_CHIP_ICONS: Record<ContextItemKind, typeof Ticket> = {
	file: HardDrive,
	cards: BoxSelect,
	area: Frame,
	jira: Ticket,
	ado: ClipboardList,
	confluence: BookOpen,
	notion: StickyNote,
}

const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Composer writing-area heights. Maximizing grows the composer downward only —
 * the panel keeps its resting width so the canvas beside it never shifts.
 */
const TEXTAREA_H = 64
/** Share of the viewport the writing area takes when maximized. */
const TEXTAREA_MAX_VH = 0.42

/** Motion spring driving the maximize height transition. */
const SIZE_SPRING = { type: 'spring', stiffness: 240, damping: 30, mass: 0.9 } as const

/** Typing "/" at the start of a word opens the command palette … */
const SLASH_TOKEN_OPEN = /(?:^|\s)\/$/
/** … and it stays open while that token could still match a command. */
const SLASH_TOKEN_ALIVE = /(?:^|\s)\/[\w& ]*$/

/** Viewport height, tracked live, so the maximized writing area follows it. */
function useViewportHeight() {
	const [height, setHeight] = useState(() => window.innerHeight)
	useEffect(() => {
		const read = () => setHeight(window.innerHeight)
		window.addEventListener('resize', read)
		read()
		return () => window.removeEventListener('resize', read)
	}, [])
	return height
}

function formatMs(ms: number) {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

let ctxSeq = 0
let thinkSeq = 0

/**
 * Attachments the user has staged. PromptInput owns the files (validation,
 * global document drop, the file dialog) but ships no display surface, so they
 * are rendered with the AI Elements Attachments primitives — its `files` are
 * already `FileUIPart & { id }`, which is exactly `AttachmentData`. The inline
 * variant keeps them as small chips above the composer; images preview, other
 * types fall back to their media-category icon. Must live inside <PromptInput>
 * for the hook's context.
 */
function StagedAttachments() {
	const attachments = usePromptInputAttachments()
	if (attachments.files.length === 0) return null
	return (
		<Attachments variant="inline" className="staged-attachments">
			{attachments.files.map((file) => (
				<Attachment data={file} key={file.id} onRemove={() => attachments.remove(file.id)}>
					<AttachmentPreview />
					<AttachmentInfo />
					<AttachmentRemove />
				</Attachment>
			))}
		</Attachments>
	)
}

export function AgentPanel() {
	const {
		editor,
		generating,
		setGenerating,
		openDrawer,
		pushToast,
		addContextEntry,
		composerRequest,
	} = useKaneApp()
	const reduceMotion = useReducedMotion()

	const [text, setText] = useState('')
	const [contextItems, setContextItems] = useState<ContextItem[]>([])
	const [maximized, setMaximized] = useState(false)
	const [slashOpen, setSlashOpen] = useState(false)
	const [run, setRun] = useState<RunState | null>(null)
	const [queued, setQueued] = useState<string[]>([])
	const [composerFocused, setComposerFocused] = useState(false)
	const abortRef = useRef<AbortController | null>(null)
	const stepStart = useRef<Map<number, number>>(new Map())
	const slashRef = useRef<HTMLDivElement>(null)
	const slashPopRef = useRef<HTMLDivElement>(null)
	const shellRef = useRef<HTMLDivElement>(null)
	// handleSubmit files the entry after the run finishes, by which point its
	// own `run` closure is stale — this always holds the latest
	const runRef = useRef<RunState | null>(null)
	useEffect(() => {
		runRef.current = run
	}, [run])

	// ---- maximize sizing ---------------------------------------------------
	// Height only: a Motion spring drives --omni-text-h, which the writing area
	// reads as its min-height, so the panel grows and shrinks smoothly upward
	// from the bottom-left stack. The width never changes.
	const viewportHeight = useViewportHeight()
	const targetTextHeight = maximized
		? Math.round(viewportHeight * TEXTAREA_MAX_VH)
		: TEXTAREA_H

	useEffect(() => {
		if (!slashOpen) return
		function onDown(e: MouseEvent) {
			if (!(e.target instanceof Node) || !e.target.isConnected) return
			// the trigger and the list are siblings now, so check both
			if (slashRef.current?.contains(e.target)) return
			if (slashPopRef.current?.contains(e.target)) return
			setSlashOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [slashOpen])

	// ---- context (@ and the + menu) ----------------------------------------
	function addSelectedCardsContext() {
		if (!editor) return
		const nodes = editor
			.getSelectedShapes()
			.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
		if (nodes.length === 0) {
			pushToast('Select one or more cards on the canvas first', 'error')
			return
		}
		const label =
			nodes.length === 1
				? getNodeDefinition(editor, nodes[0].props.node).title
				: `${nodes.length} cards`
		setContextItems((prev) => [
			...prev,
			{ id: ++ctxSeq, kind: 'cards', label, shapeIds: nodes.map((n) => n.id) },
		])
	}

	function addAreaContext() {
		setContextItems((prev) => [...prev, { id: ++ctxSeq, kind: 'area', label: 'Visible area' }])
	}

	function addLinkContext(kind: ContextItemKind, label: string) {
		setContextItems((prev) => [...prev, { id: ++ctxSeq, kind, label }])
	}

	// ---- slash commands (cmdk via PromptInputCommand) ----------------------
	const applyCommand = useCallback(
		(cmd: SlashCommand) => {
			if (!editor) return
			if (cmd.action.kind === 'module') {
				openDrawer('module')
				return
			}
			if (cmd.action.kind === 'node') {
				const definition = getNodeDefinition(editor, cmd.action.nodeType as never)
				createNodeShape(
					editor,
					createShapeId(),
					editor.getViewportPageBounds().center,
					definition.getDefault()
				)
				pushToast(`Added a “${definition.title}” card`, 'success')
			}
		},
		[editor, openDrawer, pushToast]
	)

	function pickCommand(cmd: SlashCommand) {
		setSlashOpen(false)
		// drop a trailing "/query" token if the user typed one
		setText((t) => t.replace(/(?:^|\s)\/[\w& ]*$/, (m) => (m.startsWith(' ') ? ' ' : '')))
		applyCommand(cmd)
	}

	// ---- submit ------------------------------------------------------------
	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const value = (message.text ?? text).trim()
			if (!value || !editor) return

			// A second objective sent mid-build joins the queue instead of being
			// dropped; it is picked up when the current build finishes. A run
			// that's already finished is only still on screen to be read — it
			// doesn't hold anything up, and sending replaces it.
			if (generating || (run && !run.done)) {
				setQueued((q) => [...q, value])
				setText('')
				pushToast('Queued — it will run when the current build finishes', 'info')
				return
			}

			setText('')
			setSlashOpen(false)
			const attached = message.files ?? []
			const context = contextItems
			setContextItems([])

			if (/^run( it| workflow| the (test|workflow))?$/i.test(value)) {
				pushToast(
					runWholeCanvas(editor)
						? 'Running the workflow — watch the cards light up'
						: 'There is nothing to run yet — give me an objective first'
				)
				return
			}

			// Attachments carry their file metadata through so the Context panel
			// can render them as real attachments beside the objective they rode
			// in with, rather than as bare labels.
			const entryItems: ContextEntryItem[] = [
				...context.map((c) => ({ kind: c.kind, label: c.label })),
				...attached.map((f) => ({
					kind: 'file' as const,
					label: f.filename ?? 'attachment',
					file: { filename: f.filename, mediaType: f.mediaType, url: f.url },
				})),
			]

			const anchorId = context
				.filter((c) => c.kind === 'cards')
				.flatMap((c) => c.shapeIds ?? [])
				.at(-1)

			const controller = new AbortController()
			abortRef.current = controller
			setGenerating(true)
			stepStart.current.clear()
			// this also clears whatever the previous prompt left on screen
			setRun({ objective: value, items: entryItems, thinking: [], plan: null, done: false })

			const ui: PlannerUi = {
				plan: (title, steps) => setRun((r) => (r ? { ...r, plan: { title, steps } } : r)),
				checkpoint: (text) =>
					setRun((r) =>
						r
							? { ...r, thinking: [...r.thinking, { id: ++thinkSeq, kind: 'checkpoint', text }] }
							: r
					),
				note: (t) =>
					setRun((r) =>
						r ? { ...r, thinking: [...r.thinking, { id: ++thinkSeq, kind: 'note', text: t }] } : r
					),
				begin: (tool, target) => {
					const id = ++thinkSeq
					stepStart.current.set(id, performance.now())
					setRun((r) =>
						r
							? {
									...r,
									thinking: [
										...r.thinking,
										{ id, kind: 'step', tool, target, status: 'running' },
									],
								}
							: r
					)
					return id
				},
				end: (id, status = 'complete') => {
					const started = stepStart.current.get(id)
					const ms = started === undefined ? undefined : Math.round(performance.now() - started)
					setRun((r) =>
						r
							? {
									...r,
									thinking: r.thinking.map((t) =>
										t.kind === 'step' && t.id === id ? { ...t, status, ms } : t
									),
								}
							: r
					)
				},
			}

			try {
				await planWorkflow(editor, value, ui, controller.signal, { anchorId })
			} finally {
				setGenerating(false)
				abortRef.current = null
				setRun((r) =>
					r
						? {
								...r,
								thinking: r.thinking.map((t) =>
									t.kind === 'step' && t.status === 'running' ? { ...t, status: 'complete' } : t
								),
							}
						: r
				)
			}

			// let the finished steps land, then file the objective away — with the
			// work it produced, so the Context panel can show what the agent
			// thought and did, not just what was asked
			await sleep(paced(800))
			const finished = runRef.current
			addContextEntry(value, entryItems, {
				reasoning:
					finished?.thinking
						.filter((t) => t.kind === 'note')
						.map((t) => (t as { text: string }).text)
						.join('\n\n') || undefined,
				steps: finished?.thinking
					.filter((t): t is Extract<ThinkItem, { kind: 'step' }> => t.kind === 'step')
					.map((t) => ({ tool: t.tool, target: t.target, ms: t.ms })),
				plan: finished?.plan ?? undefined,
			})
			// mark it read-only rather than tearing it down — see RunState.done
			setRun((r) => (r ? { ...r, done: true } : r))
			pushToast('Saved to Context — open the Context tab to revisit it', 'success')

			// hand off to the next queued objective, if any
			setQueued((q) => {
				const [next, ...rest] = q
				if (next) window.setTimeout(() => submitRef.current?.(next), 60)
				return rest
			})
		},
		[text, contextItems, editor, generating, run, setGenerating, addContextEntry, pushToast]
	)

	// Lets the queue drain without handleSubmit depending on itself.
	// PromptInput doesn't forward a ref, so the form is reached through an
	// element known to live inside it.
	const submitRef = useRef<((text: string) => void) | null>(null)
	useEffect(() => {
		submitRef.current = (t: string) => {
			setText(t)
			window.setTimeout(() => slashRef.current?.closest('form')?.requestSubmit(), 0)
		}
	}, [])

	// The placeholder types itself while the composer is idle, empty and
	// unfocused — it stops the moment the user engages, so it never moves under
	// them, and reduced motion gets a plain static hint. A finished run left on
	// screen counts as engaged: there is already something to read there.
	const placeholderIdle = !generating && run === null && text.length === 0 && !composerFocused
	const typedPlaceholder = useTypedPlaceholder(PLACEHOLDER_EXAMPLES, placeholderIdle && !reduceMotion)

	const stop = useCallback(() => abortRef.current?.abort(), [])

	// A prompt reused from the Context panel arrives here.
	useEffect(() => {
		if (!composerRequest) return
		setText(composerRequest.text)
		// focus after the controlled value has been committed — placing the caret
		// any earlier would measure it against the text that was there before
		const id = window.setTimeout(() => {
			const textarea = shellRef.current?.querySelector('textarea')
			if (!textarea) return
			textarea.focus()
			const end = textarea.value.length
			textarea.setSelectionRange(end, end)
		}, 0)
		return () => window.clearTimeout(id)
	}, [composerRequest])

	// "/" from anywhere puts the cursor in the composer, the way a search
	// shortcut does — unless the user is already typing somewhere, in which case
	// the slash is theirs.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
			const active = document.activeElement
			if (
				active instanceof HTMLElement &&
				(active.tagName === 'INPUT' ||
					active.tagName === 'TEXTAREA' ||
					active.isContentEditable)
			) {
				return
			}
			const textarea = shellRef.current?.querySelector('textarea')
			if (!textarea) return
			// swallow the keystroke so the composer doesn't also receive it and
			// open the command palette on an otherwise empty objective
			e.preventDefault()
			textarea.focus()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [])

	// "busy" means work is actually in flight. A finished run still on screen is
	// not busy — the composer, the + / slash / @ menus and Send all stay live.
	const busy = generating || (run !== null && !run.done)

	// The run splits in two: prose goes to Reasoning as streamed markdown,
	// tool calls and checkpoints go to Task as an ordered list.
	const reasoningText = (run?.thinking ?? [])
		.filter((t): t is Extract<ThinkItem, { kind: 'note' }> => t.kind === 'note')
		.map((t) => t.text)
		.join('\n\n')
	const taskItems = (run?.thinking ?? []).filter((t) => t.kind !== 'note')
	const stepCount = taskItems.filter((t) => t.kind === 'step').length
	const doneCount = taskItems.filter((t) => t.kind === 'step' && t.status !== 'running').length
	const taskTitle = generating
		? `${doneCount} of ${stepCount} step${stepCount === 1 ? '' : 's'}`
		: `${stepCount} step${stepCount === 1 ? '' : 's'}`

	return (
		<motion.div
			ref={shellRef}
			className="agent-shell"
			// no entrance animation — only the maximize transition
			initial={false}
			animate={{ '--omni-text-h': `${targetTextHeight}px` }}
			transition={reduceMotion ? { duration: 0 } : SIZE_SPRING}
		>
		<PromptInput
			className={`agent-panel kane-ui ${run ? 'is-thinking' : ''} ${maximized ? 'is-max' : ''}`}
			globalDrop
			multiple
			accept=".pdf,.docx,.jpg,.png,.xlsx,.csv"
			maxFiles={8}
			maxFileSize={MAX_FILE_BYTES}
			onError={(err) => pushToast(err.message || 'file is invalid or over upload limit', 'error')}
			onSubmit={handleSubmit}
		>
			{/* the sent objective + streamed thinking */}
			{run && (
				<div className="run-area thin-scroll">
					{/* the objective stays pinned; only the thinking scrolls under it */}
					<BlurInText className="run-objective" text={run.objective} />
					{run.items.length > 0 && (
						<div className="run-ctx">
							{run.items.map((item, i) => {
								const Icon = CONTEXT_CHIP_ICONS[item.kind] ?? Link2
								return (
									<span className="run-ctx-chip" key={i} title={item.label}>
										<Icon size={11} />
										{item.label}
									</span>
								)
							})}
						</div>
					)}
					{run.plan && (
						<Plan defaultOpen isStreaming={generating} className="run-plan">
							<PlanHeader>
								<PlanTitle>{run.plan.title}</PlanTitle>
								<PlanDescription>{`${run.plan.steps.length} steps planned`}</PlanDescription>
								<PlanTrigger />
							</PlanHeader>
							<PlanContent>
								<ol className="run-plan-steps">
									{run.plan.steps.map((s, i) => (
										<li key={i}>{s}</li>
									))}
								</ol>
							</PlanContent>
						</Plan>
					)}
					{/* The agent's narrative — Reasoning owns the "Thinking…" /
					    "Thought for Ns" trigger and the collapse behaviour, and streams
					    the notes in as markdown. It sits above the scroller, not inside
					    it: auto-scroll pins to the newest step, which would carry the
					    trigger out of view exactly while it matters most. */}
					{reasoningText && (
						<Reasoning className="run-reasoning" isStreaming={generating} defaultOpen>
							<ReasoningTrigger />
							<ReasoningContent>{reasoningText}</ReasoningContent>
						</Reasoning>
					)}

					{/* Tool calls as a Task list. Its trigger stays put and the steps
					    stream inside a MessageScroller, so the running count is readable
					    while the newest step stays in view. */}
					{taskItems.length > 0 && (
						<>
							<Marker variant="separator" className="run-marker">
								<MarkerIcon>
									<Sparkles size={12} />
								</MarkerIcon>
								<MarkerContent>
									{generating ? (
										<Shimmer as="span">Building the workflow…</Shimmer>
									) : (
										'Workflow built'
									)}
								</MarkerContent>
							</Marker>
							<Task className="run-task" defaultOpen>
								<TaskTrigger title={taskTitle} />
								<TaskContent>
									<MessageScrollerProvider autoScroll>
										<MessageScroller className="run-think">
											<MessageScrollerViewport>
												<MessageScrollerContent>
													<MessageScrollerItem>
													<AnimatePresence initial={false}>
														{taskItems.map((t, i) => (
															<motion.div
																key={t.id}
																initial={reduceMotion ? false : { opacity: 0, y: 6 }}
																animate={{ opacity: 1, y: 0 }}
																transition={{
																	type: 'spring',
																	stiffness: 380,
																	damping: 28,
																	delay: reduceMotion ? 0 : Math.min(i, 4) * 0.03,
																}}
															>
																{t.kind === 'checkpoint' ? (
																	<TaskItem>
																		<Checkpoint className="run-checkpoint">
																			<CheckpointIcon>
																				<Flag size={11} />
																			</CheckpointIcon>
																			{t.text}
																		</Checkpoint>
																	</TaskItem>
																) : (
																	<TaskItem className="task-step">
																		<span
																			className="task-step-dot"
																			data-status={t.status}
																			aria-hidden
																		/>
																		{t.status === 'running' ? (
																			<Shimmer as="span">{`${t.tool} · ${t.target}`}</Shimmer>
																		) : (
																			<>
																				<span className="task-step-tool">{t.tool}</span>
																				<TaskItemFile className="task-step-target">
																					{t.target}
																				</TaskItemFile>
																				{t.ms !== undefined && (
																					<span className="task-step-ms">
																						{formatMs(t.ms)}
																					</span>
																				)}
																			</>
																		)}
																	</TaskItem>
																)}
															</motion.div>
														))}
													</AnimatePresence>
													</MessageScrollerItem>
												</MessageScrollerContent>
											</MessageScrollerViewport>
										</MessageScroller>
									</MessageScrollerProvider>
								</TaskContent>
							</Task>
						</>
					)}

					{/* Where all of the above just went, and how to put it away. The
					    next prompt clears it on its own — this is for clearing it
					    sooner. */}
					{run.done && (
						<div className="run-done" role="status">
							<span className="run-done-text">
								<Check size={12} />
								Saved. Every prompt, with its thinking and steps, is kept in the Context tab.
							</span>
							<span className="run-done-actions">
								<button
									type="button"
									className="run-done-link"
									onClick={() => openDrawer('context')}
								>
									<BookOpen size={12} />
									Open Context
								</button>
								<button
									type="button"
									className="run-done-clear"
									onClick={() => setRun(null)}
								>
									Clear
								</button>
							</span>
						</div>
					)}
				</div>
			)}

			{/* objectives waiting behind the current build */}
			{queued.length > 0 && (
				<Queue className="run-queue">
					<QueueList>
						{queued.map((q, i) => (
							<QueueItem key={`${q}-${i}`}>
								<QueueItemIndicator />
								<QueueItemContent>
									<QueueItemDescription>{q}</QueueItemDescription>
								</QueueItemContent>
								<QueueItemActions>
									<QueueItemAction
										aria-label="Remove from queue"
										onClick={() => setQueued((prev) => prev.filter((_, j) => j !== i))}
									>
										<X size={12} />
									</QueueItemAction>
								</QueueItemActions>
							</QueueItem>
						))}
					</QueueList>
				</Queue>
			)}

			{/* attachments (PromptInput-managed) + Kane context chips */}
			<PromptInputHeader>
				<StagedAttachments />
				{contextItems.length > 0 && (
					<div className="chip-strip">
						{contextItems.map((c) => {
							const Icon = CONTEXT_CHIP_ICONS[c.kind] ?? Link2
							return (
								<span className="chip chip_context" key={c.id}>
									<Icon size={13} />
									<span className="c-name" title={c.label}>
										{c.label}
									</span>
									<button
										type="button"
										className="icon-btn"
										style={{ padding: 2 }}
										onClick={() => setContextItems((p) => p.filter((x) => x.id !== c.id))}
										aria-label="Remove context"
									>
										<X size={12} />
									</button>
								</span>
							)
						})}
					</div>
				)}
			</PromptInputHeader>

			<PromptInputBody>
				<PromptInputTextarea
					className="omni-textarea"
					// stays typable while building so a second objective can be
					// queued with Enter; the submit button is a Stop control then
					placeholder={
						busy
							? 'Building… type to queue the next one'
							: placeholderIdle && !reduceMotion
								? typedPlaceholder
								: PLACEHOLDER_EXAMPLES[0]
					}
					value={text}
					onChange={(e) => {
						const next = e.currentTarget.value
						setText(next)
						// A "/" that starts a word opens the command palette — the same
						// token pickCommand() strips when a command is chosen. Erasing
						// it, or typing past anything it could match, closes it again.
						if (SLASH_TOKEN_OPEN.test(next)) setSlashOpen(true)
						else if (!SLASH_TOKEN_ALIVE.test(next)) setSlashOpen(false)
					}}
					onKeyDown={(e) => {
						if (e.key === 'Escape' && slashOpen) {
							e.preventDefault()
							setSlashOpen(false)
						}
					}}
					onFocus={() => setComposerFocused(true)}
					onBlur={() => setComposerFocused(false)}
				/>
			</PromptInputBody>

			<PromptInputFooter>
				<PromptInputTools>
					{/* + — attachments and linked context. Shared with the AI
					    composer on a card, so both offer the same sources. */}
					<AttachMenu disabled={busy} onLink={addLinkContext} />

					{/* / — cmdk command palette (the list itself renders outside the
					    footer, which AI Elements' InputGroup clips) */}
					<div className="slash-anchor" ref={slashRef}>
						<PromptInputButton
							type="button"
							disabled={busy}
							onClick={() => setSlashOpen((v) => !v)}
							aria-label="Commands"
						>
							<Slash size={18} />
						</PromptInputButton>
					</div>

					{/* @ — canvas context */}
					<PromptInputActionMenu>
						<PromptInputActionMenuTrigger disabled={busy}>
							<AtSign size={17} />
						</PromptInputActionMenuTrigger>
						<PromptInputActionMenuContent align="start">
							<PromptInputActionMenuItem onSelect={addSelectedCardsContext}>
								<BoxSelect size={16} />
								<span>Selected cards</span>
							</PromptInputActionMenuItem>
							<PromptInputActionMenuItem onSelect={addAreaContext}>
								<Frame size={16} />
								<span>Visible area</span>
							</PromptInputActionMenuItem>
						</PromptInputActionMenuContent>
					</PromptInputActionMenu>
				</PromptInputTools>

				<div className="omni-right">
					<Tip label={maximized ? 'Minimize' : 'Maximize'}>
						<PromptInputButton
							type="button"
							onClick={() => setMaximized((v) => !v)}
							aria-label={maximized ? 'Minimize' : 'Maximize'}
						>
							{maximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
						</PromptInputButton>
					</Tip>
					{/* Canvas ↔ Browser — the only one in the app now */}
					<ModeSegmented compact />
					<PromptInputSubmit
						status={generating ? 'streaming' : 'ready'}
						onStop={stop}
						disabled={!busy && text.trim().length === 0}
					>
						{/* the component's default is a return arrow; sending an
						    objective is a launch, so it gets a rocket */}
						{generating ? <Square size={15} fill="currentColor" /> : <Rocket size={16} />}
					</PromptInputSubmit>
				</div>
			</PromptInputFooter>

			{slashOpen && (
				<div className="slash-popover" ref={slashPopRef}>
					<PromptInputCommand>
						{/* takes focus so typing straight after "/" filters the list */}
						<PromptInputCommandInput autoFocus placeholder="Search commands" />
						<PromptInputCommandList>
							<PromptInputCommandEmpty>No matching commands</PromptInputCommandEmpty>
							{SLASH_GROUPS.map((group) => (
								<PromptInputCommandGroup key={group.heading} heading={group.heading}>
									{group.commands.map((c) => {
										const Icon = c.icon
										return (
											<PromptInputCommandItem
												key={c.id}
												value={c.label}
												onSelect={() => pickCommand(c)}
											>
												<Icon size={16} />
												<span>{c.label}</span>
											</PromptInputCommandItem>
										)
									})}
								</PromptInputCommandGroup>
							))}
						</PromptInputCommandList>
					</PromptInputCommand>
				</div>
			)}
		</PromptInput>
		</motion.div>
	)
}
