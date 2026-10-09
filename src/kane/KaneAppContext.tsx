import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Editor } from 'tldraw'
import { CanvasSnapshot, snapshotCanvas, summarizeChanges } from './changeSummary'
import {
	canvasSignature,
	CodeFramework,
	CodeLanguage,
	generateCode,
	readCanvas,
} from './codegen'

/**
 * App-level state shared by the Kane chrome (topbar, right bar, agent panel,
 * browser views, minimap) around the tldraw canvas.
 */

export type BrowserView = 'closed' | 'split' | 'window'
export type KaneTheme = 'light' | 'dark'

/**
 * Saving is explicit, not automatic. A test case is a versioned artefact: each
 * save cuts a new version and carries a message explaining what changed, so the
 * author decides when a version exists. Auto-save would have produced a stream
 * of unlabelled versions nobody asked for.
 */
export interface TestCaseVersion {
	version: number
	/**
	 * What this version is called. It starts as the message it was saved with —
	 * which is what anyone would call it anyway — and can be renamed afterwards,
	 * because the useful name for a version is often only obvious later.
	 */
	name: string
	/** The message it was saved with. Kept even after a rename. */
	message: string
	at: number
	/** Who cut it. */
	author: string
}

const TEST_CASE_ID = 'TC-3342'
/** The version this test case was already on when the session opened. */
const BASE_VERSION = 4

/** Whoever is signed in. The avatar in the topbar is their initials. */
export const CURRENT_USER = { name: 'Aditi Bhatt', initials: 'AB' }

/**
 * The versions this test case already had before the session opened.
 *
 * A version history that starts empty says the test case was created a moment
 * ago, when the topbar has been saying v4 all along. These are dated backwards
 * from load, so the list reads sensibly whenever the prototype is opened.
 */
const DAY_MS = 24 * 60 * 60 * 1000
function seedVersions(now: number): TestCaseVersion[] {
	const seed: { version: number; message: string; daysAgo: number; author: string }[] = [
		{ version: 4, message: 'Assert the order number on the confirmation page', daysAgo: 2, author: 'Aditi Bhatt' },
		{ version: 3, message: 'Retry the 2FA step once before failing', daysAgo: 6, author: 'Rowan Silva' },
		{ version: 2, message: 'Add the guest checkout branch', daysAgo: 11, author: 'Priya Nair' },
		{ version: 1, message: 'First pass — login through to payment', daysAgo: 19, author: 'Aditi Bhatt' },
	]
	return seed.map((v) => ({
		version: v.version,
		name: v.message,
		message: v.message,
		at: now - v.daysAgo * DAY_MS,
		author: v.author,
	}))
}

/**
 * Code generation. It writes the file out a few lines at a time so it reads as
 * being authored rather than pasted, and it lives at app level so closing the
 * drawer — or switching to the browser — leaves it running.
 */
export interface CodegenState {
	status: 'empty' | 'generating' | 'ready'
	language: CodeLanguage
	framework: CodeFramework
	/** what has been written so far; the full text once `ready` */
	code: string
	highlight: string
	filename: string
	/** 0–1, for the in-progress indicator in the right bar */
	progress: number
	/**
	 * The canvas fingerprint this code was generated from. If the canvas no
	 * longer matches, the code on screen is stale.
	 */
	signature: string | null
	generatedAt: number | null
}

/** Lines revealed per tick, and the gap between ticks. */
const CODEGEN_CHUNK = 2
const CODEGEN_TICK_MS = 55

const EMPTY_CODEGEN: CodegenState = {
	status: 'empty',
	language: 'javascript',
	framework: 'playwright',
	code: '',
	highlight: 'javascript',
	filename: '',
	progress: 0,
	signature: null,
	generatedAt: null,
}

/**
 * What a toast is telling you. Every toast used to render a red warning
 * triangle inside `role="alert"`, so "Objective saved to Context" announced
 * itself as a problem. Tone picks the icon, the colour and the ARIA role.
 */
export type ToastTone = 'success' | 'info' | 'error'

export interface KaneToast {
	id: number
	msg: string
	tone: ToastTone
}

/** A context item attached to an objective (file, canvas context, ticket, page). */
export type ContextItemKind =
	| 'file'
	| 'cards'
	| 'area'
	| 'jira'
	| 'ado'
	| 'confluence'
	| 'notion'

export interface ContextEntryItem {
	kind: ContextItemKind
	label: string
	/**
	 * For `file` items: enough to render the attachment properly in the
	 * Context panel. `url` is a blob/data URL and is deliberately dropped
	 * before persisting — see `stripForStorage` below.
	 */
	file?: { filename?: string; mediaType?: string; url?: string }
}

/**
 * An objective the user sent to the agent, stored (with its attached context
 * and a timestamp) in the Context right-sidebar panel.
 */
/** One tool call the agent made while working on an objective. */
export interface ContextEntryStep {
	tool: string
	target: string
	ms?: number
}

export interface ContextEntry {
	id: number
	objective: string
	at: number
	items: ContextEntryItem[]
	/** the agent's prose while it worked, as markdown */
	reasoning?: string
	/** the tool calls it made */
	steps?: ContextEntryStep[]
	/** the plan it announced, if any */
	plan?: { title: string; steps: string[] }
}

/**
 * The log's storage key. It carries a generation suffix: bumping it starts
 * everyone with an empty Context panel, which is how the demo prompts left over
 * from earlier builds were cleared. The previous key is removed on the way
 * past so it isn't left sitting in storage forever.
 */
const CONTEXT_LOG_KEY = 'kane-context-log-v2'
const CONTEXT_LOG_KEY_LEGACY = 'kane-context-log'

function loadContextLog(): ContextEntry[] {
	try {
		localStorage.removeItem(CONTEXT_LOG_KEY_LEGACY)
		const raw = localStorage.getItem(CONTEXT_LOG_KEY)
		const parsed = raw ? (JSON.parse(raw) as ContextEntry[]) : []
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/**
 * Attachment previews are blob/data URLs. They are worth keeping in memory —
 * the Context panel shows real thumbnails for this session — but writing them
 * to localStorage would exhaust the quota within a few images, taking the whole
 * log with them. So the url is stripped on the way to storage; a reloaded entry
 * falls back to its file-type icon.
 */
function stripForStorage(entries: ContextEntry[]): ContextEntry[] {
	return entries.map((entry) => ({
		...entry,
		items: entry.items.map((item) =>
			item.file?.url ? { ...item, file: { ...item.file, url: undefined } } : item
		),
	}))
}

interface KaneAppState {
	editor: Editor | null
	setEditor(editor: Editor | null): void

	theme: KaneTheme
	setTheme(theme: KaneTheme): void

	/** 'closed' = Canvas mode. 'split' = browser docked next to canvas. 'window' = floating popout. */
	browserView: BrowserView
	setBrowserView(view: BrowserView): void

	recording: boolean
	setRecording(recording: boolean | ((prev: boolean) => boolean)): void
	generating: boolean
	setGenerating(generating: boolean): void
	disconnected: boolean
	setDisconnected(disconnected: boolean): void

	drawerId: string | null
	openDrawer(id: string): void
	closeDrawer(): void

	/** The test case being edited, and its version history (newest first). */
	testCase: { id: string; version: number }
	versions: TestCaseVersion[]
	/** Canvas has changed since the last saved version. */
	unsaved: boolean
	/** Cut a new version with a message describing what changed. */
	saveVersion(message: string): void
	/** Give a saved version a different name. */
	renameVersion(version: number, name: string): void
	/** Mark the test case as edited — for changes tldraw's store can't see. */
	markUnsaved(): void
	/**
	 * A commit message drafted from what has actually changed since the last
	 * save. The Save popover offers it as a starting point.
	 */
	draftCommitMessage(): string

	/** Code generation — lives here so closing the drawer doesn't cancel it. */
	codegen: CodegenState
	setCodeTarget(language: CodeLanguage, framework: CodeFramework): void
	startCodegen(): void
	cancelCodegen(): void

	/** Objectives (+ attached context) sent to the agent, newest first. */
	contextEntries: ContextEntry[]
	addContextEntry(
		objective: string,
		items: ContextEntryItem[],
		work?: Pick<ContextEntry, 'reasoning' | 'steps' | 'plan'>
	): void
	clearContextEntries(): void

	/**
	 * Text pushed into the omnibox from somewhere else — reusing a prompt from
	 * the Context panel. The stamp is what makes it fire: sending the same text
	 * twice has to reach the composer both times.
	 */
	composerRequest: { text: string; at: number } | null
	requestComposerText(text: string): void

	toasts: KaneToast[]
	pushToast(msg: string, tone?: ToastTone): void
	dismissToast(id: number): void

	url: string
	setUrl(url: string): void
	loading: boolean
	loadUrl(url?: string): void
}

const KaneAppContext = createContext<KaneAppState | null>(null)

export function useKaneApp(): KaneAppState {
	const value = useContext(KaneAppContext)
	if (!value) throw new Error('useKaneApp must be used inside KaneAppProvider')
	return value
}

export function KaneAppProvider({ children }: { children: ReactNode }) {
	const [editor, setEditor] = useState<Editor | null>(null)
	// The topbar toggle is gone, so the app always starts light: honouring a
	// previously-saved 'dark' would strand anyone who had toggled it with no way
	// back. The theme plumbing and its CSS stay, ready if a switch returns.
	const [theme, setThemeRaw] = useState<KaneTheme>('light')
	const [browserView, setBrowserViewRaw] = useState<BrowserView>('closed')
	const [recording, setRecording] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [disconnected, setDisconnected] = useState(false)
	const [drawerId, setDrawerId] = useState<string | null>(null)
	const [contextEntries, setContextEntries] = useState<ContextEntry[]>(loadContextLog)
	const [toasts, setToasts] = useState<KaneToast[]>([])
	const [url, setUrl] = useState('app.lambdatest.com/login')
	const [loading, setLoading] = useState(false)

	const setBrowserView = useCallback((view: BrowserView) => {
		setBrowserViewRaw(view)
		if (view === 'closed') setRecording(false)
	}, [])

	const setTheme = useCallback(
		(next: KaneTheme) => {
			setThemeRaw(next)
			localStorage.setItem('kane-theme', next)
			editor?.user.updateUserPreferences({ colorScheme: next })
		},
		[editor]
	)

	const openDrawer = useCallback((id: string) => {
		setDrawerId((cur) => (cur === id ? null : id))
	}, [])
	const closeDrawer = useCallback(() => setDrawerId(null), [])

	// ---- versions -----------------------------------------------------------
	// The current version number is read off the newest entry rather than held
	// as its own state, so there is one source of truth and no way for the two
	// to drift apart.
	const [versions, setVersions] = useState<TestCaseVersion[]>(() => seedVersions(Date.now()))
	const [unsaved, setUnsaved] = useState(false)

	const testCase = useMemo(
		() => ({ id: TEST_CASE_ID, version: versions[0]?.version ?? BASE_VERSION }),
		[versions]
	)

	const markUnsaved = useCallback(() => setUnsaved(true), [])

	/**
	 * What the canvas looked like at the last save — the other half of the diff
	 * the commit message is drafted from. It is a ref, not state: nothing renders
	 * from it, and re-rendering the whole app on every save to store it would be
	 * work for nobody.
	 */
	const savedSnapshot = useRef<CanvasSnapshot>(new Map())
	useEffect(() => {
		if (!editor) return
		// the session opens on an already-saved version, so this is the baseline
		savedSnapshot.current = snapshotCanvas(editor)
	}, [editor])

	const saveVersion = useCallback(
		(message: string) => {
			setVersions((prev) => [
				{
					version: (prev[0]?.version ?? BASE_VERSION) + 1,
					name: message.trim(),
					message: message.trim(),
					at: Date.now(),
					author: CURRENT_USER.name,
				},
				...prev,
			])
			setUnsaved(false)
			if (editor) savedSnapshot.current = snapshotCanvas(editor)
		},
		[editor]
	)

	const renameVersion = useCallback((version: number, name: string) => {
		const next = name.trim()
		if (!next) return
		setVersions((prev) => prev.map((v) => (v.version === version ? { ...v, name: next } : v)))
	}, [])

	const draftCommitMessage = useCallback(() => {
		if (!editor) return ''
		return summarizeChanges(editor, savedSnapshot.current)
	}, [editor])

	// Anything the user does to the document (not camera moves or selection,
	// which tldraw scopes to 'session') leaves the test case ahead of its last
	// saved version.
	useEffect(() => {
		if (!editor) return
		return editor.store.listen(() => setUnsaved(true), { scope: 'document', source: 'user' })
	}, [editor])

	// ---- code generation ----------------------------------------------------
	const [codegen, setCodegen] = useState<CodegenState>(EMPTY_CODEGEN)
	const codegenTimer = useRef(0)

	const cancelCodegen = useCallback(() => {
		window.clearInterval(codegenTimer.current)
		codegenTimer.current = 0
		setCodegen((c) => (c.status === 'generating' ? { ...c, status: 'empty', progress: 0 } : c))
	}, [])

	const setCodeTarget = useCallback(
		(language: CodeLanguage, framework: CodeFramework) => {
			// changing the target invalidates whatever was generated for the old one
			window.clearInterval(codegenTimer.current)
			codegenTimer.current = 0
			setCodegen((c) => ({ ...c, ...EMPTY_CODEGEN, language, framework }))
		},
		[]
	)

	const startCodegen = useCallback(() => {
		if (!editor) return
		window.clearInterval(codegenTimer.current)
		const { language, framework } = codegenRef.current
		const program = readCanvas(editor)
		const { code, highlight, filename } = generateCode(
			program,
			language,
			framework,
			'Checkout regression suite'
		)
		const signature = canvasSignature(editor)
		const lines = code.split('\n')

		setCodegen({
			status: 'generating',
			language,
			framework,
			code: '',
			highlight,
			filename,
			progress: 0,
			signature,
			generatedAt: null,
		})

		let written = 0
		codegenTimer.current = window.setInterval(() => {
			written = Math.min(lines.length, written + CODEGEN_CHUNK)
			const done = written >= lines.length
			setCodegen((c) => ({
				...c,
				code: lines.slice(0, written).join('\n'),
				progress: written / lines.length,
				status: done ? 'ready' : 'generating',
				generatedAt: done ? Date.now() : null,
			}))
			if (done) {
				window.clearInterval(codegenTimer.current)
				codegenTimer.current = 0
			}
		}, CODEGEN_TICK_MS)
	}, [editor])

	// startCodegen needs the current target without re-creating itself (and
	// restarting nothing) every time the picker changes
	const codegenRef = useRef(codegen)
	useEffect(() => {
		codegenRef.current = codegen
	}, [codegen])

	useEffect(() => () => window.clearInterval(codegenTimer.current), [])

	const ctxSeq = useRef(Date.now())
	const addContextEntry = useCallback(
		(
			objective: string,
			items: ContextEntryItem[],
			work?: Pick<ContextEntry, 'reasoning' | 'steps' | 'plan'>
		) => {
			const entry: ContextEntry = {
				id: ++ctxSeq.current,
				objective,
				at: Date.now(),
				items,
				...work,
			}
			setContextEntries((prev) => {
				const next = [entry, ...prev].slice(0, 50)
				try {
					localStorage.setItem(CONTEXT_LOG_KEY, JSON.stringify(stripForStorage(next)))
				} catch {
					// storage full/unavailable — the in-memory list still works
				}
				return next
			})
		},
		[]
	)

	const clearContextEntries = useCallback(() => {
		setContextEntries([])
		try {
			localStorage.removeItem(CONTEXT_LOG_KEY)
		} catch {
			// storage unavailable — the in-memory list is already empty
		}
	}, [])

	const [composerRequest, setComposerRequest] = useState<{ text: string; at: number } | null>(null)
	const requestComposerText = useCallback((text: string) => {
		setComposerRequest({ text, at: Date.now() })
	}, [])

	const toastSeq = useRef(0)
	const pushToast = useCallback((msg: string, tone: ToastTone = 'info') => {
		const id = ++toastSeq.current
		setToasts((prev) => [...prev, { id, msg, tone }])
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id))
		}, 3000)
	}, [])

	// Toasts fired from outside React (side effects, canvas overlays).
	useEffect(() => {
		function onKaneToast(e: Event) {
			const detail = (e as CustomEvent<string | { msg: string; tone: ToastTone }>).detail
			if (typeof detail === 'string') pushToast(detail)
			else pushToast(detail.msg, detail.tone)
		}
		window.addEventListener('kane-toast', onKaneToast)
		return () => window.removeEventListener('kane-toast', onKaneToast)
	}, [pushToast])
	const dismissToast = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id))
	}, [])

	const loadTimer = useRef(0)
	const loadUrl = useCallback((next?: string) => {
		if (next != null) setUrl(next)
		setLoading(true)
		window.clearTimeout(loadTimer.current)
		loadTimer.current = window.setTimeout(() => setLoading(false), 1000)
	}, [])

	const value = useMemo<KaneAppState>(
		() => ({
			editor,
			setEditor,
			theme,
			setTheme,
			browserView,
			setBrowserView,
			recording,
			setRecording,
			generating,
			setGenerating,
			disconnected,
			setDisconnected,
			drawerId,
			openDrawer,
			closeDrawer,
			testCase,
			versions,
			unsaved,
			saveVersion,
			renameVersion,
			markUnsaved,
			draftCommitMessage,
			codegen,
			setCodeTarget,
			startCodegen,
			cancelCodegen,
			contextEntries,
			addContextEntry,
			clearContextEntries,
			composerRequest,
			requestComposerText,
			toasts,
			pushToast,
			dismissToast,
			url,
			setUrl,
			loading,
			loadUrl,
		}),
		[
			editor,
			theme,
			setTheme,
			browserView,
			setBrowserView,
			recording,
			generating,
			disconnected,
			drawerId,
			openDrawer,
			closeDrawer,
			testCase,
			versions,
			unsaved,
			saveVersion,
			renameVersion,
			markUnsaved,
			draftCommitMessage,
			codegen,
			setCodeTarget,
			startCodegen,
			cancelCodegen,
			contextEntries,
			addContextEntry,
			clearContextEntries,
			composerRequest,
			requestComposerText,
			toasts,
			pushToast,
			dismissToast,
			url,
			loading,
			loadUrl,
		]
	)

	return <KaneAppContext.Provider value={value}>{children}</KaneAppContext.Provider>
}
