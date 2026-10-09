import {
	ArrowLeft,
	Globe,
	Lock,
	PictureInPicture2,
	PanelRightClose,
	Plus,
	RotateCw,
	SquareTerminal,
	TextSelect,
	WifiOff,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TLShapeId } from 'tldraw'
import { kaneRuntime } from '../../execution/runtime'
import { NodeType } from '../../nodes/nodeTypes'
import { URL_SUGGESTIONS } from '../catalog'
import { connectCards, createCard } from '../graphOps'
import { useKaneApp } from '../KaneAppContext'
import { Tip } from '../Tooltip'
import { ConsoleEntry, DevTools, NetworkEntry } from './DevTools'
import { ElementPick, InspectorPopup } from './InspectorPopup'
import { mockPageHtml } from './mockPage'
import { randomSampleHost } from './samplePages'

/**
 * Browser chrome shared by the docked split view and the floating popout
 * window: Chrome-like sub-topbar (back / refresh / URL bar / record toggle /
 * popout-dock switch / mode cluster) + the device viewport with the mock page.
 */

function UrlBar({ onNavigate }: { onNavigate: (url: string) => void }) {
	const { url } = useKaneApp()
	const [focused, setFocused] = useState(false)
	const [draft, setDraft] = useState(url)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!focused) return
		function onDown(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false)
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [focused])

	const suggestions = focused && draft
		? URL_SUGGESTIONS.filter(
				(s) => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft
			).slice(0, 5)
		: []

	function commit(value: string) {
		setDraft(value)
		setFocused(false)
		onNavigate(value)
		ref.current?.querySelector('input')?.blur()
	}

	return (
		<div className={`urlbar ${focused ? 'focused' : ''}`} ref={ref}>
			<span className="scheme">https://</span>
			<input
				value={focused ? draft : url}
				onFocus={() => {
					setDraft(url)
					setFocused(true)
				}}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') commit(draft)
					if (e.key === 'Escape') {
						setFocused(false)
						e.currentTarget.blur()
					}
				}}
				aria-label="Address bar"
				spellCheck={false}
			/>
			{focused && draft && (
				<button
					className="icon-btn"
					style={{ padding: 2 }}
					onMouseDown={(e) => {
						e.preventDefault()
						setDraft('')
					}}
					aria-label="Clear"
				>
					<X size={14} />
				</button>
			)}
			{suggestions.length > 0 && (
				<div className="url-autocomplete">
					{suggestions.map((s) => (
						<div
							key={s}
							className="url-suggest"
							onMouseDown={(e) => {
								e.preventDefault()
								commit(s)
							}}
						>
							<Globe size={14} />
							<span>{s}</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

function RecordingToggle({ onToggle }: { onToggle: (next: boolean) => void }) {
	const { recording } = useKaneApp()
	return (
		<button
			className={`rec-toggle ${recording ? 'active' : ''}`}
			onClick={() => onToggle(!recording)}
			aria-pressed={recording}
		>
			<span className="rec-dot" />
			{recording ? 'Stop' : 'Record'}
		</button>
	)
}

interface RecordedEvent {
	kind: 'click' | 'type' | 'navigated' | 'scrolled'
	target?: string
	text?: string
	url?: string
	label?: string
	/** `scrolled` — what the page reported about the gesture. */
	direction?: 'down' | 'up' | 'left' | 'right'
	amount?: number
	unit?: '%' | 'px'
	container?: string
}

/** Turns recorded browser events into connected cards on the canvas. */
function useRecorder() {
	const { editor, recording } = useKaneApp()
	const lastCard = useRef<{ id: TLShapeId; x: number; y: number } | null>(null)

	const place = useCallback((): { x: number; y: number } => {
		if (lastCard.current) return { x: lastCard.current.x + 320, y: lastCard.current.y }
		if (!editor) return { x: 0, y: 0 }
		const center = editor.getViewportPageBounds().center
		return { x: center.x - 130, y: center.y - 100 }
	}, [editor])

	const addCard = useCallback(
		(node: NodeType, hasInput: boolean) => {
			if (!editor) return
			const { x, y } = place()
			editor.run(() => {
				const id = createCard(editor, node, x, y)
				if (hasInput && lastCard.current) {
					connectCards(editor, lastCard.current.id, pickOutPort(editor, lastCard.current.id), id, 'input')
				}
				lastCard.current = { id, x, y }
			})
			editor.centerOnPoint({ x: x + 130, y: y + 100 }, { animation: { duration: 220 } })
		},
		[editor, place]
	)

	useEffect(() => {
		if (!recording) {
			lastCard.current = null
		}
	}, [recording])

	const onEvent = useCallback(
		(event: RecordedEvent) => {
			if (!recording) return
			switch (event.kind) {
				case 'click':
					addCard(
						{ type: 'click', target: event.target ?? 'element', clickType: 'single' } as NodeType,
						true
					)
					break
				case 'type':
					addCard(
						{
							type: 'input',
							target: event.target ?? 'field',
							text: event.text ?? '',
							pressEnter: false,
						} as NodeType,
						true
					)
					break
				case 'navigated':
					addCard({ type: 'open', url: event.url ?? '' } as NodeType, false)
					break
				case 'scrolled':
					// `detected` because the container came from the page — it is the
					// element that actually moved, not a guess made afterwards
					addCard(
						{
							type: 'scroll',
							direction: event.direction ?? 'down',
							amount: event.amount ?? 50,
							unit: event.unit ?? '%',
							container: event.container ?? '',
							detected: !!event.container,
						} as NodeType,
						true
					)
					break
			}
		},
		[recording, addCard]
	)

	const seedStart = useCallback(
		(url: string) => {
			addCard({ type: 'open', url } as NodeType, false)
		},
		[addCard]
	)

	return { onEvent, seedStart }
}

function pickOutPort(editor: NonNullable<ReturnType<typeof useKaneApp>['editor']>, id: TLShapeId) {
	const shape = editor.getShape(id)
	if (!shape || !editor.isShapeOfType(shape, 'node')) return 'output'
	const node = (shape.props as { node: { type: string; blocks?: unknown[] } }).node
	if (node.type === 'ifelse') return 'out0'
	if (node.type === 'while') return 'body'
	return 'output'
}

export function BrowserSubTopbar({
	variant,
	onNavigate,
	onBack,
	canBack,
	onRefresh,
	onToggleRecording,
	devtoolsOpen,
	onToggleDevtools,
	inspecting,
	onToggleInspect,
}: {
	variant: 'split' | 'window'
	onNavigate: (url: string) => void
	onBack: () => void
	canBack: boolean
	onRefresh: () => void
	onToggleRecording: (next: boolean) => void
	devtoolsOpen?: boolean
	onToggleDevtools?: () => void
	inspecting?: boolean
	onToggleInspect?: () => void
}) {
	const { setBrowserView } = useKaneApp()
	return (
		<div className="subtopbar">
			<button className="icon-btn" onClick={onBack} disabled={!canBack} aria-label="Back">
				<ArrowLeft size={17} />
			</button>
			<button className="icon-btn" onClick={onRefresh} aria-label="Refresh">
				<RotateCw size={16} />
			</button>
			<UrlBar onNavigate={onNavigate} />
			<RecordingToggle onToggle={onToggleRecording} />
			{onToggleInspect && (
				<Tip label="Inspector — pick any element to read its properties and write an AI step for it" wrap>
					<button
						className={`icon-btn ${inspecting ? 'is-active' : ''}`}
						onClick={onToggleInspect}
						aria-label="Inspector"
						aria-pressed={inspecting}
					>
						<TextSelect size={16} />
					</button>
				</Tip>
			)}
			{/* DevTools only exist while docked — a popped-out window closes them */}
			{variant === 'split' && onToggleDevtools && (
				<Tip label="Inspect — Console & Network" wrap>
					<button
						className={`icon-btn ${devtoolsOpen ? 'is-active' : ''}`}
						onClick={onToggleDevtools}
						aria-label="Toggle DevTools"
						aria-pressed={devtoolsOpen}
					>
						<SquareTerminal size={16} />
					</button>
				</Tip>
			)}
			{variant === 'split' ? (
				<Tip label="Pop out into a window" wrap>
					<button
						className="icon-btn"
						onClick={() => setBrowserView('window')}
						aria-label="Pop out browser"
					>
						<PictureInPicture2 size={16} />
					</button>
				</Tip>
			) : (
				<Tip label="Dock next to canvas" wrap>
					<button
						className="icon-btn"
						onClick={() => setBrowserView('split')}
						aria-label="Dock browser"
					>
						<PanelRightClose size={16} />
					</button>
				</Tip>
			)}
			{/* No mode switch here either — there is exactly one, in the omnibox,
			    which stays visible in both modes. */}
		</div>
	)
}

/**
 * The browser surface: sub-topbar + desktop device chrome + mock page iframe.
 * Subscribes to run actions (animates them in the page) and emits recorded
 * events as cards while Record is on.
 */
let tabSeq = 0

export function BrowserSurface({ variant }: { variant: 'split' | 'window' }) {
	const { url, setUrl, loading, loadUrl, disconnected, recording, setRecording } = useKaneApp()
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [hist, setHist] = useState<{ stack: string[]; idx: number }>({ stack: [url], idx: 0 })
	const { onEvent, seedStart } = useRecorder()
	const [srcdoc, setSrcdoc] = useState(() => mockPageHtml(url.split('/')[0] || 'example.com'))
	const hostRef = useRef(url.split('/')[0])

	// ---- tabs --------------------------------------------------------------
	const [tabs, setTabs] = useState<{ id: number; url: string }[]>(() => [
		{ id: ++tabSeq, url },
	])
	const [activeTab, setActiveTab] = useState(() => tabs[0].id)

	// ---- inspector ---------------------------------------------------------
	const [inspecting, setInspecting] = useState(false)
	const [pick, setPick] = useState<ElementPick | null>(null)
	/** The viewport box the popup is positioned inside. */
	const viewportRef = useRef<HTMLDivElement>(null)

	// ---- devtools ----------------------------------------------------------
	const [devtoolsOpen, setDevtoolsOpen] = useState(false)
	const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
	const [networkEntries, setNetworkEntries] = useState<NetworkEntry[]>([])

	// Detaching into the floating window closes the drawer: the popout is a
	// small preview surface and has no room for it.
	useEffect(() => {
		if (variant === 'window') setDevtoolsOpen(false)
	}, [variant])

	const postToPage = useCallback((message: unknown) => {
		iframeRef.current?.contentWindow?.postMessage(message, '*')
	}, [])

	const navigate = useCallback(
		(next: string, pushHistory = true) => {
			const host = next.split('/')[0] || 'example.com'
			if (host !== hostRef.current) {
				hostRef.current = host
				setSrcdoc(mockPageHtml(host))
			} else {
				postToPage({ type: 'kane-nav', url: next })
			}
			loadUrl(next)
			if (pushHistory) {
				setHist((h) => {
					const stack = h.stack.slice(0, h.idx + 1)
					stack.push(next)
					return { stack, idx: stack.length - 1 }
				})
			}
		},
		[loadUrl, postToPage]
	)

	// Run actions → animate in the page (and drive the URL bar on navigate).
	useEffect(() => {
		return kaneRuntime.onBrowserAction((action) => {
			if (action.kind === 'navigate' && action.url) {
				navigate(action.url)
				window.setTimeout(() => postToPage({ type: 'kane-action', action }), 350)
				return
			}
			postToPage({ type: 'kane-action', action })
		})
	}, [navigate, postToPage])

	// Recorded events + devtools telemetry from the page.
	useEffect(() => {
		let consoleSeq = 0
		let netSeq = 0
		function onMessage(e: MessageEvent) {
			const data = e.data as {
				type?: string
				event?: RecordedEvent
				payload?: Record<string, unknown>
			}
			if (data?.type === 'kane-console' && data.payload) {
				const p = data.payload as Omit<ConsoleEntry, 'id'>
				setConsoleEntries((prev) => [...prev.slice(-299), { ...p, id: ++consoleSeq }])
				return
			}
			if (data?.type === 'kane-network' && data.payload) {
				const p = data.payload as Omit<NetworkEntry, 'id'>
				setNetworkEntries((prev) => [...prev.slice(-299), { ...p, id: ++netSeq }])
				return
			}
			if (data?.type === 'kane-inspect-pick' && data.payload) {
				setPick(data.payload as unknown as ElementPick)
				return
			}
			if (data?.type !== 'kane-event' || !data.event) return
			if (data.event.kind === 'navigated' && data.event.url) {
				setUrl(data.event.url)
				setTabs((prev) =>
					prev.map((t) => (t.id === activeTab ? { ...t, url: data.event!.url! } : t))
				)
			}
			onEvent(data.event)
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [onEvent, setUrl, activeTab])

	return (
		<div className="browser-surface">
			<BrowserSubTopbar
				variant={variant}
				devtoolsOpen={devtoolsOpen}
				onToggleDevtools={() => setDevtoolsOpen((v) => !v)}
				inspecting={inspecting}
				onToggleInspect={() => {
					const next = !inspecting
					setInspecting(next)
					if (!next) setPick(null)
					postToPage({ type: 'kane-inspect', on: next })
				}}
				onNavigate={navigate}
				onBack={() => {
					setHist((h) => {
						if (h.idx === 0) return h
						const idx = h.idx - 1
						navigate(h.stack[idx], false)
						return { ...h, idx }
					})
				}}
				canBack={hist.idx > 0}
				onRefresh={() => loadUrl(url)}
				onToggleRecording={(next) => {
					setRecording(next)
					if (next) seedStart(url)
				}}
			/>
			<div className="viewport">
				<div className="device desktop">
					{disconnected && (
						<div className="wifi-off" title="Wifi disconnected. Trying to reconnect">
							<WifiOff size={14} />
						</div>
					)}
					<div className="device-tabbar">
						{tabs.map((t) => (
							<div
								key={t.id}
								className={`device-tab ${t.id === activeTab ? 'is-active' : ''}`}
								onClick={() => {
									setActiveTab(t.id)
									navigate(t.url)
								}}
								title={t.url}
							>
								<Lock size={11} />
								<span className="device-tab-host">{t.url.split('/')[0] || 'new tab'}</span>
								{tabs.length > 1 && (
									<button
										className="device-tab-close"
										aria-label="Close tab"
										onClick={(e) => {
											e.stopPropagation()
											setTabs((prev) => {
												const next = prev.filter((x) => x.id !== t.id)
												if (t.id === activeTab && next[0]) {
													setActiveTab(next[0].id)
													navigate(next[0].url)
												}
												return next
											})
										}}
									>
										<X size={10} />
									</button>
								)}
							</div>
						))}
						<button
							className="device-tab-new"
							aria-label="New tab"
							title="New tab"
							onClick={() => {
								// a new tab lands on one of the sample pages, so there is
								// always something with real widgets to inspect
								const tab = { id: ++tabSeq, url: randomSampleHost() }
								setTabs((prev) => [...prev, tab])
								setActiveTab(tab.id)
								navigate(tab.url)
							}}
						>
							<Plus size={12} />
						</button>
						{recording && <span className="device-rec-hint">recording</span>}
					</div>
					{/* An info bar in the browser's own chrome, the way Chrome announces
					    that it is being driven by test software. It used to float over
					    the bottom of the page, where it covered the very content
					    someone had turned the Inspector on to look at. */}
					{inspecting && (
						<div className="inspect-bar" role="status">
							<TextSelect size={13} />
							<span>Inspector is on — click any element on the page to inspect it</span>
							<button
								className="inspect-bar-off"
								onClick={() => {
									setInspecting(false)
									setPick(null)
									postToPage({ type: 'kane-inspect', on: false })
								}}
							>
								Turn off
							</button>
						</div>
					)}
					<div className="iframe-host" ref={viewportRef}>
						{loading && (
							<div className="spinner-host">
								<div className="spinner" />
							</div>
						)}
						<iframe ref={iframeRef} title="browser" srcDoc={srcdoc} />
						{pick && (
							<InspectorPopup
								pick={pick}
								iframeRef={iframeRef}
								hostRef={viewportRef}
								onClose={() => setPick(null)}
							/>
						)}
					</div>
					{variant === 'split' && devtoolsOpen && (
						<DevTools
							consoleEntries={consoleEntries}
							networkEntries={networkEntries}
							onClear={() => {
								setConsoleEntries([])
								setNetworkEntries([])
							}}
							onClose={() => setDevtoolsOpen(false)}
						/>
					)}
				</div>
			</div>
		</div>
	)
}
