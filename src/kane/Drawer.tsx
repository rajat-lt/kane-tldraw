import {
	BookOpen,
	BoxSelect,
	ClipboardList,
	CornerUpLeft,
	Folder,
	Frame,
	Layers,
	ListTree,
	Sparkles,
	StickyNote,
	Ticket,
	Trash2,
	UserRound,
	X,
	Zap,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useValue } from 'tldraw'
import {
	Attachment,
	AttachmentInfo,
	AttachmentPreview,
	Attachments,
} from '@/components/ai-elements/attachments'
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from '@/components/ai-elements/task'
import { Tool, ToolContent, ToolHeader, ToolInput } from '@/components/ai-elements/tool'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { formatDay, formatStamp } from '../utils/formatDate'
import { RIGHTBAR_BOTTOM, RIGHTBAR_TOP, SAVED_MODULES } from './catalog'
import { CodePanel } from './CodePanel'
import { VariablesPanel } from './VariablesPanel'
import { VersionsPanel } from './VersionsPanel'
import { stampModule } from './graphOps'
import { ContextItemKind, useKaneApp } from './KaneAppContext'
import { Tip } from './Tooltip'

const ALL = [...RIGHTBAR_TOP, ...RIGHTBAR_BOTTOM]

const CTX_ICONS: Record<ContextItemKind, typeof Ticket> = {
	file: Folder,
	cards: BoxSelect,
	area: Frame,
	jira: Ticket,
	ado: ClipboardList,
	confluence: BookOpen,
	notion: StickyNote,
}

/**
 * Context panel — every objective sent to the agent, stored with its date &
 * time and whatever context rode along with it (files, canvas context,
 * Jira/ADO tickets, Confluence/Notion pages).
 */
function ContextLog() {
	const { contextEntries, clearContextEntries, requestComposerText, closeDrawer, pushToast } =
		useKaneApp()

	/** Put an already-run prompt back in the omnibox, ready to send again. */
	const reuse = (objective: string) => {
		requestComposerText(objective)
		// the omnibox is behind this panel — get out of its way
		closeDrawer()
		pushToast('Prompt loaded into the omnibox', 'success')
	}

	if (contextEntries.length === 0) {
		return (
			<div className="drawer-body">
				<div className="ctx-empty">
					<Sparkles size={18} />
					<p>
						Objectives you send to the agent land here, with their date &amp; time and any
						attached context.
					</p>
				</div>
			</div>
		)
	}
	return (
		<div className="drawer-body kane-ui">
			<div className="ctx-toolbar">
				<span className="ctx-count">
					{contextEntries.length} prompt{contextEntries.length === 1 ? '' : 's'}
				</span>
				<button className="ctx-clear" onClick={clearContextEntries}>
					<Trash2 size={12} />
					Clear all
				</button>
			</div>
			{contextEntries.map((entry) => {
				// Attachments render as attachments; everything else (canvas
				// selections, linked tickets and pages) stays a compact chip.
				const files = entry.items.filter((item) => item.kind === 'file')
				const links = entry.items.filter((item) => item.kind !== 'file')
				return (
					<div key={entry.id} className="ctx-entry">
						<div className="ctx-head">
							<span className="ctx-when">{formatStamp(entry.at)}</span>
							<Tip label="Send this prompt again — loads it into the omnibox" wrap side="left">
								<button
									className="ctx-reuse"
									onClick={() => reuse(entry.objective)}
									aria-label="Reuse this prompt"
								>
									<CornerUpLeft size={12} />
									Reuse
								</button>
							</Tip>
						</div>
						<div className="ctx-objective">{entry.objective}</div>
						{files.length > 0 && (
							<Attachments variant="list" className="ctx-attachments">
								{files.map((item, i) => (
									<Attachment
										key={`f${i}`}
										data={{
											id: `${entry.id}-${i}`,
											type: 'file',
											filename: item.file?.filename ?? item.label,
											mediaType: item.file?.mediaType ?? 'application/octet-stream',
											// dropped when the log was persisted — the preview
											// then falls back to the media-category icon
											url: item.file?.url ?? '',
										}}
									>
										<AttachmentPreview />
										<AttachmentInfo showMediaType />
									</Attachment>
								))}
							</Attachments>
						)}
						{links.length > 0 && (
							<div className="ctx-items">
								{links.map((item, i) => {
									const Icon = CTX_ICONS[item.kind] ?? Folder
									return (
										<span className="ctx-item" key={i} title={item.label}>
											<Icon size={11} />
											{item.label}
										</span>
									)
								})}
							</div>
						)}

						{/* What the agent thought and did, folded away. The entry stays a
						    one-line objective until you ask for more — the log is long,
						    and most of the time the objective is the whole answer. */}
						{(entry.reasoning || entry.steps?.length || entry.plan) && (
							<div className="ctx-work">
								{entry.plan && (
									/* everything here starts folded — the objective is the
									   entry, the rest is available on request */
									<Task className="ctx-task" defaultOpen={false}>
										<TaskTrigger title={`Plan · ${entry.plan.title}`} />
										<TaskContent>
											<ol className="ctx-plan-steps">
												{entry.plan.steps.map((s, i) => (
													<li key={i}>{s}</li>
												))}
											</ol>
										</TaskContent>
									</Task>
								)}
								{entry.reasoning && (
									<Reasoning className="ctx-reasoning" isStreaming={false} defaultOpen={false}>
										<ReasoningTrigger />
										<ReasoningContent>{entry.reasoning}</ReasoningContent>
									</Reasoning>
								)}
								{entry.steps && entry.steps.length > 0 && (
									<Task className="ctx-task" defaultOpen={false}>
										<TaskTrigger
											title={`${entry.steps.length} step${entry.steps.length === 1 ? '' : 's'} run`}
										/>
										<TaskContent>
											{entry.steps.map((step, i) => (
												<TaskItem className="ctx-step" key={i}>
													<span className="ctx-step-tool">{step.tool}</span>
													<TaskItemFile className="ctx-step-target">{step.target}</TaskItemFile>
													{step.ms !== undefined && (
														<span className="ctx-step-ms">
															{step.ms < 1000 ? `${step.ms}ms` : `${(step.ms / 1000).toFixed(1)}s`}
														</span>
													)}
												</TaskItem>
											))}
										</TaskContent>
									</Task>
								)}
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}

/**
 * Modules drawer — the functional panel. Click a module to stamp an editable
 * copy onto the canvas.
 *
 * Each row carries what you need to pick between two modules with similar
 * names: which version you're about to stamp, whether it can run unattended,
 * where it lives in the library, and how stale it is.
 */
function ModuleList() {
	const { editor, closeDrawer, pushToast } = useKaneApp()
	return (
		<div className="drawer-body modules-panel">
			{SAVED_MODULES.map((m) => (
				<div
					key={m.id}
					className="module-row"
					onClick={() => {
						if (!editor) return
						const center = editor.getViewportPageBounds().center
						stampModule(editor, m, { x: center.x - 400, y: center.y - 100 })
						pushToast(`Inserted module “${m.name}” — editable copy`, 'success')
						closeDrawer()
					}}
				>
					<span className="module-row-icon">
						<Layers size={15} />
					</span>
					<div className="module-main">
						<div className="module-title">
							<span className="m-name">{m.name}</span>
							<span className="m-version">v{m.version}</span>
							<span className={`m-automation ${m.automated ? 'is-auto' : 'is-manual'}`}>
								{m.automated ? <Zap size={10} /> : <UserRound size={10} />}
								{m.automated ? 'Automated' : 'Non-automated'}
							</span>
						</div>
						<div className="m-sub">
							<span className="m-folder">
								<Folder size={11} />
								{m.folder}
							</span>
							<span className="m-dot">·</span>
							<span>{m.nodes.length} steps</span>
						</div>
						<div className="m-sub m-updated">Updated {formatDay(m.updatedAt)}</div>
					</div>
				</div>
			))}
		</div>
	)
}

/**
 * Steps list — every card in the workflow, in execution order, as AI Elements
 * Task items with an expandable Tool row carrying each card's properties.
 */
function StepsList() {
	const { editor } = useKaneApp()
	const steps = useValue(
		'workflow steps',
		() => {
			if (!editor) return []
			const pageId = editor.getCurrentPageId()
			return editor
				.getCurrentPageShapes()
				.filter(
					(s): s is NodeShape =>
						editor.isShapeOfType<NodeShape>(s, 'node') && s.parentId === pageId
				)
				.sort((a, b) => a.x - b.x || a.y - b.y)
				.map((s) => {
					const node = s.props.node as Record<string, unknown> & { type: string; label?: string }
					const { type: _t, label: _l, ...rest } = node
					return {
						id: s.id,
						kind: node.type,
						title: node.label?.trim() || getNodeDefinition(editor, s.props.node).title,
						props: rest,
					}
				})
		},
		[editor]
	)

	if (steps.length === 0) {
		return (
			<div className="drawer-body">
				<div className="ctx-empty">
					<ListTree size={18} />
					<p>No cards on the canvas yet. Give the agent an objective to build a workflow.</p>
				</div>
			</div>
		)
	}

	return (
		<div className="drawer-body kane-ui">
			<Task defaultOpen className="steps-task">
				<TaskTrigger title={`${steps.length} steps in this workflow`} />
				<TaskContent>
					{steps.map((step, i) => (
						<TaskItem key={step.id}>
							<Tool className="steps-tool">
								<ToolHeader
									type={`tool-${step.kind}` as never}
									state="output-available"
									title={`${i + 1}. ${step.title}`}
								/>
								<ToolContent>
									<ToolInput input={step.props} />
								</ToolContent>
							</Tool>
						</TaskItem>
					))}
				</TaskContent>
			</Task>
		</div>
	)
}

function PendingPanel({ label }: { label?: string }) {
	return (
		<div className="drawer-body">
			<div
				style={{
					padding: 24,
					color: 'var(--gray-500)',
					fontSize: 13,
					textAlign: 'center',
				}}
			>
				The “{label}” panel is not yet specified.
				<br />
				Shown here is the confirmed slide-in container behavior.
			</div>
		</div>
	)
}

export function Drawer() {
	const { drawerId, closeDrawer } = useKaneApp()
	const reduceMotion = useReducedMotion()
	const item = ALL.find((i) => i.id === drawerId)
	// AnimatePresence keeps the panel mounted long enough to slide back out —
	// without it a close is instant while an open is animated, which reads as a
	// glitch rather than a transition.
	return (
		<AnimatePresence initial={false}>
			{drawerId && (
				<motion.aside
					key={drawerId}
					className="drawer"
					aria-label={`${item?.label} panel`}
					initial={{ x: '100%' }}
					animate={{ x: 0 }}
					exit={{ x: '100%' }}
					transition={
						reduceMotion
							? { duration: 0 }
							: { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }
					}
				>
			<div className="drawer-head">
				<span className="drawer-title">{item?.label}</span>
				<button className="icon-btn" onClick={closeDrawer} aria-label="Close panel">
					<X size={16} />
				</button>
			</div>
			{drawerId === 'module' ? (
				<ModuleList />
			) : drawerId === 'variables' ? (
				<VariablesPanel />
			) : drawerId === 'code' ? (
				<CodePanel />
			) : drawerId === 'context' ? (
				<ContextLog />
			) : drawerId === 'list' ? (
				<StepsList />
			) : drawerId === 'versions' ? (
				<VersionsPanel />
			) : (
				<PendingPanel label={item?.label} />
			)}
				</motion.aside>
			)}
		</AnimatePresence>
	)
}
