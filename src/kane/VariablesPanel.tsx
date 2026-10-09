import {
	Braces,
	Check,
	Copy,
	Crosshair,
	Eye,
	EyeOff,
	KeyRound,
	MoreHorizontal,
	Pencil,
	Plus,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Trash2,
	Variable as VariableIcon,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, createShapeId, useValue } from 'tldraw'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { kaneRuntime, totpCode, totpSecondsLeft } from '../execution/runtime'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { EntityKind } from '../nodes/types/EntityNode'
import { createNodeShape } from './graphOps'
import { useKaneApp } from './KaneAppContext'

/**
 * Variables panel — every data card in the session as a table, grouped by kind
 * behind an underline nav.
 *
 * The table is the canvas: each row *is* a card, so editing a name or a value
 * here writes straight back to the shape, "Add new" drops a real card on the
 * canvas and opens it for editing inline, and Delete removes it. There is no
 * second store to drift out of sync.
 */

/** The tabs, in the order they're shown. */
type TabId = EntityKind | 'smart'

const TABS: { id: TabId; label: string; icon: typeof VariableIcon }[] = [
	{ id: 'variable', label: 'Variables', icon: VariableIcon },
	{ id: 'parameter', label: 'Parameters', icon: SlidersHorizontal },
	{ id: 'secret', label: 'Secrets', icon: KeyRound },
	{ id: 'smart', label: 'Smart Variables', icon: Sparkles },
	{ id: 'totp', label: 'TOTP Variables', icon: ShieldCheck },
]

/** Kinds whose value is masked until revealed. */
const MASKED: TabId[] = ['secret', 'totp']

interface Row {
	id: string
	kind: EntityKind
	name: string
	/** the value authored on the card */
	initial: string
	/** what the runtime holds after a run, if the card has executed */
	session: string | undefined
	/** the frame this card sits in, if any — its scope on the canvas */
	scope: string
}

/**
 * Smart variables aren't cards: they're `{{references}}` used somewhere on the
 * canvas that no data card defines, so the run has to supply them. Reading them
 * off the canvas keeps the tab honest — it lists what this workflow actually
 * expects, not a hardcoded catalogue.
 */
interface SmartRow {
	name: string
	usedBy: string
	session: string | undefined
}

function useCanvasRows() {
	const { editor } = useKaneApp()
	return useValue<{ rows: Row[]; smart: SmartRow[] }>(
		'variable rows',
		() => {
			if (!editor) return { rows: [], smart: [] }
			const shapes = editor
				.getCurrentPageShapes()
				.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
				.sort((a, b) => a.x - b.x || a.y - b.y)

			const rows: Row[] = []
			const defined = new Set<string>()
			for (const shape of shapes) {
				const node = shape.props.node as { type: string; name?: string; value?: string }
				if (!['parameter', 'secret', 'totp', 'variable'].includes(node.type)) continue
				const name = String(node.name ?? '')
				if (name.trim()) defined.add(name.trim())
				const parent = editor.getShape(shape.parentId)
				rows.push({
					id: shape.id,
					kind: node.type as EntityKind,
					name,
					initial: String(node.value ?? ''),
					session: name.trim() ? kaneRuntime.values.get(name.trim()) : undefined,
					// a card inside a frame belongs to that frame; otherwise it's global
					scope: parent && parent.type === 'frame' ? String((parent.props as { name?: string }).name ?? 'Frame') : 'Global',
				})
			}

			// every {{reference}} on the canvas that no card above defines
			const smartByName = new Map<string, SmartRow>()
			for (const shape of shapes) {
				const node = shape.props.node as Record<string, unknown> & { type: string }
				for (const value of Object.values(node)) {
					if (typeof value !== 'string') continue
					for (const match of value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
						const name = match[1].trim()
						if (defined.has(name) || smartByName.has(name)) continue
						smartByName.set(name, {
							name,
							usedBy: getNodeDefinition(editor, shape.props.node).title,
							session: kaneRuntime.values.get(name),
						})
					}
				}
			}

			return { rows, smart: [...smartByName.values()] }
		},
		[editor]
	)
}

/**
 * What a row must contain before it can be saved. A half-filled data card
 * silently breaks a run — an unnamed one can't be referenced at all, and a TOTP
 * card without a valid base32 key generates nothing — so the row refuses to
 * commit until it holds something usable.
 */
const NAME_RE = /^[A-Za-z_][\w.-]*$/
const BASE32_RE = /^[A-Z2-7]+=*$/i

function validate(kind: EntityKind, name: string, value: string, takenNames: Set<string>) {
	const n = name.trim()
	if (!n) return 'Name is required'
	if (!NAME_RE.test(n)) return 'Use letters, digits, _ . - and start with a letter'
	if (takenNames.has(n)) return 'That name is already used'
	if (!value.trim()) return kind === 'totp' ? 'Shared key is required' : 'Value is required'
	if (kind === 'totp') {
		const key = value.replace(/\s+/g, '')
		if (!BASE32_RE.test(key)) return 'TOTP key must be base32 (A–Z, 2–7)'
		if (key.replace(/=+$/, '').length < 16) return 'TOTP key looks too short'
	}
	return null
}

/** A value cell — read-only display, or an input while the row is being edited. */
function ValueCell({
	value,
	masked,
	editing,
	placeholder,
	onChange,
}: {
	value: string
	masked: boolean
	editing: boolean
	placeholder: string
	onChange: (next: string) => void
}) {
	const [shown, setShown] = useState(false)

	if (editing) {
		return (
			<input
				className="vt-input"
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
			/>
		)
	}

	if (!value) return <span className="vt-muted">—</span>
	const display = masked && !shown ? '•'.repeat(Math.min(value.length, 10)) : value
	return (
		<span className="vt-value">
			<span className="vt-value-text">{display}</span>
			{masked && (
				<button
					className="vt-icon-btn"
					aria-label={shown ? 'Hide value' : 'Show value'}
					aria-pressed={shown}
					onClick={() => setShown((v) => !v)}
				>
					{shown ? <EyeOff size={13} /> : <Eye size={13} />}
				</button>
			)}
		</span>
	)
}

/** Copy-to-clipboard that reports back briefly. */
function CopyButton({ text, label }: { text: string; label: string }) {
	const [done, setDone] = useState(false)
	const timer = useRef(0)
	useEffect(() => () => window.clearTimeout(timer.current), [])
	return (
		<button
			className="vt-icon-btn"
			aria-label={`Copy ${label}`}
			title={`Copy ${label}`}
			disabled={!text}
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(text)
					setDone(true)
					window.clearTimeout(timer.current)
					timer.current = window.setTimeout(() => setDone(false), 1200)
				} catch {
					// clipboard can be blocked by permissions — the row still works
				}
			}}
		>
			{done ? <Check size={13} /> : <Copy size={13} />}
		</button>
	)
}

export function VariablesPanel() {
	const { editor, pushToast } = useKaneApp()
	const { rows, smart } = useCanvasRows()
	const [tab, setTab] = useState<TabId>('variable')
	const [query, setQuery] = useState('')
	/**
	 * The row being edited, held as a draft rather than written straight to the
	 * card. Save commits it, Cancel throws it away — and for a row that was just
	 * added, Cancel removes the card it created, so a cancelled "Add new" leaves
	 * nothing behind.
	 */
	const [draft, setDraft] = useState<{
		id: string
		name: string
		value: string
		isNew: boolean
	} | null>(null)
	// TOTP codes roll every 30s and the runtime map isn't reactive
	const [tick, setTick] = useState(() => Date.now())
	useEffect(() => {
		const t = window.setInterval(() => setTick(Date.now()), 1000)
		return () => window.clearInterval(t)
	}, [])

	const counts = useMemo(() => {
		const c: Record<string, number> = { smart: smart.length }
		for (const r of rows) c[r.kind] = (c[r.kind] ?? 0) + 1
		return c
	}, [rows, smart.length])

	const q = query.trim().toLowerCase()
	const matches = (...fields: (string | undefined)[]) =>
		!q || fields.some((f) => (f ?? '').toLowerCase().includes(q))

	const visible = rows.filter((r) => r.kind === tab && matches(r.name, r.initial, r.session, r.scope))
	const visibleSmart = smart.filter((s) => matches(s.name, s.usedBy, s.session))

	/** Write the draft back to the card this row came from. */
	const commit = (id: string, name: string, value: string) => {
		if (!editor) return
		const shape = editor.getShape(id as NodeShape['id'])
		if (!shape) return
		const node = (shape.props as { node: Record<string, unknown> }).node
		editor.updateShape({
			id: shape.id,
			type: 'node',
			props: { ...shape.props, node: { ...node, name: name.trim(), value } },
		} as never)
	}

	/** Names already in use, excluding the row being edited. */
	const takenNames = new Set(
		rows.filter((r) => r.id !== draft?.id && r.name.trim()).map((r) => r.name.trim())
	)
	const draftError = draft ? validate(tab as EntityKind, draft.name, draft.value, takenNames) : null

	const saveDraft = () => {
		if (!draft || draftError) return
		commit(draft.id, draft.name, draft.value)
		setDraft(null)
		pushToast(draft.isNew ? 'Variable added' : 'Variable updated', 'success')
	}

	const cancelDraft = () => {
		if (!draft) return
		// a cancelled "Add new" shouldn't leave a blank card behind
		if (draft.isNew && editor) editor.deleteShapes([draft.id as NodeShape['id']])
		setDraft(null)
	}

	const locate = (id: string) => {
		if (!editor) return
		const shape = editor.getShape(id as NodeShape['id'])
		if (!shape) return
		const bounds = editor.getShapePageBounds(shape.id)
		editor.setSelectedShapes([shape.id])
		if (bounds) editor.zoomToBounds(Box.From(bounds).expandBy(220), { animation: { duration: 320 } })
	}

	const remove = (id: string) => {
		if (!editor) return
		editor.deleteShapes([id as NodeShape['id']])
		pushToast('Card deleted', 'success')
	}

	/** Add a card of the current kind and open its row for editing. */
	const addNew = () => {
		if (!editor || tab === 'smart' || draft) return
		const definition = getNodeDefinition(editor, tab as never)
		const id = createShapeId()
		const bounds = editor.getViewportPageBounds()
		createNodeShape(editor, id, { x: bounds.center.x, y: bounds.center.y }, definition.getDefault())
		setDraft({ id, name: '', value: '', isNew: true })
	}

	const startEdit = (row: Row) => {
		setDraft({ id: row.id, name: row.name, value: row.initial, isNew: false })
	}

	const isSmart = tab === 'smart'
	const masked = MASKED.includes(tab)
	const rowsShown = isSmart ? visibleSmart.length : visible.length

	return (
		<div className="drawer-body vars-panel">
			<nav className="vt-nav" role="tablist" aria-label="Variable types">
				{TABS.map((t) => {
					const Icon = t.icon
					return (
						<button
							key={t.id}
							role="tab"
							aria-selected={tab === t.id}
							className={`vt-tab ${tab === t.id ? 'is-active' : ''}`}
							onClick={() => {
								cancelDraft()
								setTab(t.id)
							}}
						>
							<Icon size={14} />
							{t.label}
							{counts[t.id] ? <span className="vt-tab-count">{counts[t.id]}</span> : null}
						</button>
					)
				})}
			</nav>

			<div className="vt-toolbar">
				<div className="vt-search">
					<Search size={14} />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={`Search ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}`}
						aria-label="Search variables"
						spellCheck={false}
					/>
					{query && (
						<button className="vt-icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
							<X size={13} />
						</button>
					)}
				</div>
				{!isSmart && (
					<button className="btn btn-primary vt-add" onClick={addNew} disabled={!!draft}>
						<Plus size={15} />
						Add new
					</button>
				)}
			</div>

			<div className="vt-scroll">
				{/* An empty tab shows its empty state alone — a header row over
				    nothing is just furniture. */}
				{rowsShown > 0 && (
				<table className="vt-table">
					<thead>
						<tr>
							<th className="vt-col-num">#</th>
							<th className="vt-col-key">{isSmart ? 'Name' : 'Key'}</th>
							<th className="vt-col-scope">{isSmart ? 'Used by' : 'Scope'}</th>
							{!isSmart && <th className="vt-col-val">Initial Value</th>}
							<th className="vt-col-val">Session Value</th>
							<th className="vt-col-actions" aria-label="Actions" />
						</tr>
					</thead>
					<tbody>
						{isSmart
							? visibleSmart.map((s, i) => (
									<tr key={s.name}>
										<td className="vt-col-num">{i + 1}</td>
										<td className="vt-key">
											<Braces size={12} />
											{s.name}
										</td>
										<td>
											<span className="vt-scope vt-scope_runtime">Runtime</span>
										</td>
										<td className="vt-col-val">
											<span className="vt-muted">{s.usedBy}</span>
										</td>
										<td className="vt-col-actions">
											<CopyButton text={s.session ?? s.name} label={s.name} />
										</td>
									</tr>
								))
							: visible.map((row, i) => {
									const editing = draft?.id === row.id
									return (
										<tr key={row.id} className={editing ? 'is-editing' : ''}>
											<td className="vt-col-num">{i + 1}</td>
											<td className="vt-key">
												{editing ? (
													<input
														className="vt-input"
														autoFocus
														value={draft.name}
														placeholder="name"
														aria-invalid={!!draftError}
														onChange={(e) => setDraft({ ...draft, name: e.target.value })}
														onKeyDown={(e) => {
															if (e.key === 'Enter') saveDraft()
															if (e.key === 'Escape') cancelDraft()
														}}
														spellCheck={false}
													/>
												) : (
													row.name || <span className="vt-muted">unnamed</span>
												)}
											</td>
											<td>
												<span className="vt-scope">{row.scope}</span>
											</td>
											<td className="vt-col-val">
												<ValueCell
													value={editing ? draft.value : row.initial}
													masked={masked}
													editing={editing}
													placeholder={row.kind === 'totp' ? 'shared key' : 'value'}
													onChange={(next) => editing && setDraft({ ...draft, value: next })}
												/>
											</td>
											<td className="vt-col-val">
												{editing ? (
													/* the reason Save is disabled, said in the row itself */
													<span className={`vt-hint ${draftError ? 'is-error' : 'is-ok'}`}>
														{draftError ?? 'Ready to save'}
													</span>
												) : row.kind === 'totp' && row.initial ? (
													<span className="vt-totp">
														<span className="vt-totp-code">{totpCode(row.initial, tick)}</span>
														<span className="vt-totp-left">{totpSecondsLeft(tick)}s</span>
													</span>
												) : row.session !== undefined ? (
													<ValueCell
														value={row.session}
														masked={masked}
														editing={false}
														placeholder=""
														onChange={() => {}}
													/>
												) : (
													<span className="vt-muted">not run yet</span>
												)}
											</td>
											<td className="vt-col-actions">
												{editing ? (
													<span className="vt-row-actions">
														<button className="vt-cancel" onClick={cancelDraft}>
															Cancel
														</button>
														<button
															className="vt-save"
															onClick={saveDraft}
															disabled={!!draftError}
															title={draftError ?? 'Save'}
														>
															Save
														</button>
													</span>
												) : (
													<>
														<CopyButton
															text={row.session ?? row.initial}
															label={row.name || 'value'}
														/>
														<button
															className="vt-icon-btn"
															aria-label="Show on canvas"
															title="Show on canvas"
															onClick={() => locate(row.id)}
														>
															<Crosshair size={13} />
														</button>
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<button className="vt-icon-btn" aria-label="More actions">
																	<MoreHorizontal size={14} />
																</button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end" className="kane-ui">
																<DropdownMenuItem onSelect={() => startEdit(row)}>
																	<Pencil size={14} />
																	Edit
																</DropdownMenuItem>
																<DropdownMenuItem
																	variant="destructive"
																	onSelect={() => remove(row.id)}
																>
																	<Trash2 size={14} />
																	Delete
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</>
												)}
											</td>
										</tr>
									)
								})}
					</tbody>
				</table>
				)}

				{(isSmart ? visibleSmart.length : visible.length) === 0 && (
					<div className="ctx-empty vt-empty">
						{isSmart ? <Sparkles size={18} /> : <VariableIcon size={18} />}
						<p>
							{query
								? 'Nothing matches that search.'
								: isSmart
									? 'No smart variables. A {{reference}} used on the canvas that no card defines shows up here.'
									: `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet. Add one, or drop a card on the canvas.`}
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
