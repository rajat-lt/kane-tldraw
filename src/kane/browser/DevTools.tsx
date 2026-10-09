import { Ban, ChevronDown, ChevronRight, Terminal, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	generalRows,
	HeaderRow,
	queryParams,
	requestHeaders,
	responseBody,
	responseHeaders,
	statusText,
} from './netDetail'

/**
 * A Chrome-DevTools-style drawer docked under the browser viewport, with
 * Console and Network panes.
 *
 * Console entries are real: the mock page's `console.*` is patched and every
 * call is forwarded here. Network entries describe the page's own mock traffic
 * — it issues no real requests — so the rows are generated alongside the
 * behaviour they represent (page load, sign-in POST, click beacons).
 *
 * The drawer is resizable by dragging its top edge, between a floor that keeps
 * the toolbar plus a couple of rows readable and a ceiling that always leaves
 * the page itself visible above it.
 */

/** Height bounds for the drawer, in px. Dragging cannot pass either. */
const MIN_H = 132
const MAX_H = 460
const DEFAULT_H = 190

export interface ConsoleEntry {
	id: number
	level: 'log' | 'info' | 'warn' | 'error' | 'debug'
	text: string
	at: number
}

export interface NetworkEntry {
	id: number
	method: string
	url: string
	status: number
	type: string
	size: number
	ms: number
	at: number
	/** The page host the request went out from — used to build an absolute URL. */
	host?: string
	/** The JSON a request sent, when it sent one. */
	reqBody?: string
	/** The body that came back, when the page has a real one to report. */
	resBody?: string
}

const LEVEL_LABEL: Record<ConsoleEntry['level'], string> = {
	log: 'log',
	info: 'info',
	warn: 'warn',
	error: 'error',
	debug: 'debug',
}

function formatBytes(n: number) {
	if (n <= 0) return '—'
	if (n < 1024) return `${n} B`
	return `${(n / 1024).toFixed(1)} kB`
}

function formatTime(at: number) {
	const d = new Date(at)
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/** The last path segment, which is what Chrome puts in the Name column. */
function requestName(url: string) {
	const withoutQuery = url.split('?')[0]
	const segments = withoutQuery.split('/').filter(Boolean)
	return segments[segments.length - 1] || withoutQuery || '/'
}

/**
 * One `name: value` block, collapsible the way Chrome's are. `<details>` does
 * the disclosure natively — no state, and it keeps working for a keyboard.
 */
function HeaderSection({
	title,
	rows,
	empty,
}: {
	title: string
	rows: HeaderRow[]
	empty?: string
}) {
	if (rows.length === 0 && !empty) return null
	return (
		<details className="net-section" open>
			<summary className="net-section-title">
				<ChevronRight size={11} className="net-section-caret" />
				{title}
			</summary>
			{rows.length === 0 ? (
				<div className="net-section-empty">{empty}</div>
			) : (
				<dl className="net-headers">
					{rows.map((row) => (
						<div className="net-header" key={row.name}>
							<dt>{row.name}:</dt>
							<dd>{row.value}</dd>
						</div>
					))}
				</dl>
			)}
		</details>
	)
}

const DETAIL_TABS = [
	{ id: 'headers', label: 'Headers' },
	{ id: 'request', label: 'Request' },
	{ id: 'response', label: 'Response' },
] as const

type DetailTab = (typeof DETAIL_TABS)[number]['id']

/**
 * The right-hand pane for the selected request, modelled on Chrome's: a tab
 * strip with a close button, then Headers (General + the two header blocks),
 * what was sent, and what came back.
 */
function NetworkDetail({ entry, onClose }: { entry: NetworkEntry; onClose: () => void }) {
	const [tab, setTab] = useState<DetailTab>('headers')
	const query = queryParams(entry)
	const body = responseBody(entry)

	return (
		<div className="net-detail">
			<div className="net-detail-bar">
				<button className="net-detail-close" onClick={onClose} aria-label="Close request details">
					<X size={13} />
				</button>
				{DETAIL_TABS.map((t) => (
					<button
						key={t.id}
						className={`net-detail-tab ${tab === t.id ? 'is-active' : ''}`}
						aria-pressed={tab === t.id}
						onClick={() => setTab(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>
			<div className="net-detail-body thin-scroll">
				{tab === 'headers' && (
					<>
						<HeaderSection title="General" rows={generalRows(entry)} />
						<HeaderSection title="Request Headers" rows={requestHeaders(entry)} />
						<HeaderSection title="Response Headers" rows={responseHeaders(entry)} />
					</>
				)}
				{tab === 'request' && (
					<>
						<HeaderSection
							title="Query String Parameters"
							rows={query}
							empty={query.length === 0 ? 'No query string parameters.' : undefined}
						/>
						<details className="net-section" open>
							<summary className="net-section-title">
								<ChevronRight size={11} className="net-section-caret" />
								Request Payload
							</summary>
							{entry.reqBody ? (
								<pre className="net-body">{entry.reqBody}</pre>
							) : (
								<div className="net-section-empty">
									This {entry.method} request had no body.
								</div>
							)}
						</details>
					</>
				)}
				{tab === 'response' &&
					(body ? (
						<pre className="net-body">{body}</pre>
					) : (
						<div className="net-section-empty">
							This request finished {entry.status} and returned no content.
						</div>
					))}
			</div>
		</div>
	)
}

export function DevTools({
	consoleEntries,
	networkEntries,
	onClear,
	onClose,
}: {
	consoleEntries: ConsoleEntry[]
	networkEntries: NetworkEntry[]
	onClear: () => void
	onClose: () => void
}) {
	const [pane, setPane] = useState<'console' | 'network'>('console')
	const [filter, setFilter] = useState('')
	/** The request whose detail pane is open, by id. */
	const [selectedId, setSelectedId] = useState<number | null>(null)
	const bodyRef = useRef<HTMLDivElement>(null)
	/** The network list scrolls on its own, so it follows the tail on its own. */
	const netListRef = useRef<HTMLDivElement>(null)

	// ---- resizable height --------------------------------------------------
	const [height, setHeight] = useState(DEFAULT_H)
	const [resizing, setResizing] = useState(false)
	/** Pointer y and drawer height at the moment the drag started. */
	const dragFrom = useRef<{ y: number; h: number } | null>(null)

	const onHandleDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault()
			dragFrom.current = { y: e.clientY, h: height }
			setResizing(true)
			// keep receiving moves even when the pointer leaves the handle
			e.currentTarget.setPointerCapture(e.pointerId)
		},
		[height]
	)

	const onHandleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const from = dragFrom.current
		if (!from) return
		// dragging up (smaller clientY) makes the drawer taller
		const next = from.h + (from.y - e.clientY)
		setHeight(Math.min(MAX_H, Math.max(MIN_H, next)))
	}, [])

	const onHandleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragFrom.current) return
		dragFrom.current = null
		setResizing(false)
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId)
		}
	}, [])

	/** Keyboard resizing, so the handle isn't pointer-only. */
	const onHandleKey = useCallback((e: React.KeyboardEvent) => {
		const step = e.shiftKey ? 48 : 16
		if (e.key === 'ArrowUp') {
			e.preventDefault()
			setHeight((h) => Math.min(MAX_H, h + step))
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			setHeight((h) => Math.max(MIN_H, h - step))
		} else if (e.key === 'Home') {
			e.preventDefault()
			setHeight(MAX_H)
		} else if (e.key === 'End') {
			e.preventDefault()
			setHeight(MIN_H)
		}
	}, [])

	// follow the tail like a real console does — but not while a request is open
	// for reading, or the list would scroll out from under it
	useEffect(() => {
		if (selectedId !== null) return
		for (const el of [bodyRef.current, netListRef.current]) {
			if (el) el.scrollTop = el.scrollHeight
		}
	}, [consoleEntries.length, networkEntries.length, pane, selectedId])

	const q = filter.trim().toLowerCase()
	const rows = consoleEntries.filter((e) => !q || e.text.toLowerCase().includes(q))
	const reqs = networkEntries.filter((e) => !q || e.url.toLowerCase().includes(q))
	// a cleared log, or a filter that hides the open request, closes the pane
	const selected = reqs.find((r) => r.id === selectedId) ?? null

	const errorCount = consoleEntries.filter((e) => e.level === 'error').length
	const warnCount = consoleEntries.filter((e) => e.level === 'warn').length
	const transferred = networkEntries.reduce((sum, r) => sum + r.size, 0)

	// height is the dragged value; the CSS ceiling is the second guard, keeping
	// the page itself visible on a short viewport
	return (
		<div className={`devtools ${resizing ? 'is-resizing' : ''}`} style={{ height }}>
			<div
				className="devtools-resize"
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize DevTools"
				aria-valuenow={height}
				aria-valuemin={MIN_H}
				aria-valuemax={MAX_H}
				tabIndex={0}
				onPointerDown={onHandleDown}
				onPointerMove={onHandleMove}
				onPointerUp={onHandleUp}
				onPointerCancel={onHandleUp}
				onKeyDown={onHandleKey}
				onDoubleClick={() => setHeight(DEFAULT_H)}
				title="Drag to resize · double-click to reset"
			>
				<span className="devtools-resize-grip" />
			</div>
			<div className="devtools-bar">
				<button
					className={`devtools-tab ${pane === 'console' ? 'is-active' : ''}`}
					onClick={() => setPane('console')}
				>
					Console
					{errorCount > 0 && <span className="devtools-badge devtools-badge_error">{errorCount}</span>}
					{warnCount > 0 && <span className="devtools-badge devtools-badge_warn">{warnCount}</span>}
				</button>
				<button
					className={`devtools-tab ${pane === 'network' ? 'is-active' : ''}`}
					onClick={() => setPane('network')}
				>
					Network
					{networkEntries.length > 0 && (
						<span className="devtools-badge">{networkEntries.length}</span>
					)}
				</button>
				<input
					className="devtools-filter"
					placeholder="Filter"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					spellCheck={false}
				/>
				<button className="icon-btn" onClick={onClear} title="Clear" aria-label="Clear">
					<Ban size={14} />
				</button>
				<button className="icon-btn" onClick={onClose} title="Close DevTools" aria-label="Close DevTools">
					<ChevronDown size={16} />
				</button>
			</div>

			<div className="devtools-body thin-scroll" ref={bodyRef}>
				{pane === 'console' ? (
					rows.length === 0 ? (
						<div className="devtools-empty">
							<Terminal size={14} /> No console output yet
						</div>
					) : (
						rows.map((e) => (
							<div key={e.id} className={`console-row console-row_${e.level}`}>
								<span className="console-level">{LEVEL_LABEL[e.level]}</span>
								<span className="console-text">{e.text}</span>
								<span className="console-time">{formatTime(e.at)}</span>
							</div>
						))
					)
				) : reqs.length === 0 ? (
					<div className="devtools-empty">
						<X size={14} /> No requests yet
					</div>
				) : (
					/* With a request open the list narrows to its Name column and the
					   detail takes the rest, the way Chrome splits this pane. */
					<div className={`net-split ${selected ? 'is-open' : ''}`}>
						<div className="net-list thin-scroll" ref={netListRef}>
						<table className="net-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Status</th>
									<th>Type</th>
									<th>Size</th>
									<th>Time</th>
								</tr>
							</thead>
							<tbody>
								{reqs.map((r) => (
									<tr
										key={r.id}
										className={`${r.status >= 400 ? 'net-row_error' : ''} ${
											selected?.id === r.id ? 'is-selected' : ''
										}`}
										aria-selected={selected?.id === r.id}
										onClick={() => setSelectedId((id) => (id === r.id ? null : r.id))}
									>
										<td className="net-name">
											<span className="net-method">{r.method}</span>
											{selected ? requestName(r.url) : r.url}
										</td>
										<td>
											{r.status}
											{statusText(r.status) ? ` ${statusText(r.status)}` : ''}
										</td>
										<td>{r.type}</td>
										<td>{formatBytes(r.size)}</td>
										<td>{r.ms} ms</td>
									</tr>
								))}
							</tbody>
						</table>
						</div>
						{selected && (
							<NetworkDetail entry={selected} onClose={() => setSelectedId(null)} />
						)}
					</div>
				)}
			</div>

			<div className="devtools-status">
				{pane === 'console'
					? `${rows.length} message${rows.length === 1 ? '' : 's'}`
					: `${reqs.length} request${reqs.length === 1 ? '' : 's'} · ${formatBytes(transferred)} transferred`}
			</div>
		</div>
	)
}
