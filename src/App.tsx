import { PanelLeftOpen } from 'lucide-react'
import { useRef, useState } from 'react'
import { DefaultGrid, Editor, TLComponents, Tldraw, TldrawOptions, TLGridProps } from 'tldraw'
import { AgentPanel } from './agent/AgentPanel'
import { OnCanvasNodePicker } from './components/OnCanvasNodePicker'
import { ConnectionBindingUtil } from './connection/ConnectionBindingUtil'
import { ConnectionCenterHandleOverlayUtil } from './connection/ConnectionCenterHandleOverlayUtil'
import { ConnectionShapeUtil } from './connection/ConnectionShapeUtil'
import { keepConnectionsAtBottom } from './connection/keepConnectionsAtBottom'
import { GRID_MIN_ZOOM } from './constants'
import { disableTransparency } from './disableTransparency'
import { AmbientShader } from './kane/AmbientShader'
import { Collaborators } from './kane/Collaborators'
import { BrowserSurface } from './kane/browser/BrowserChrome'
import { BrowserWindow } from './kane/browser/BrowserWindow'
import { SAVED_MODULES } from './kane/catalog'
import { Drawer } from './kane/Drawer'
import { separateOverlappingCards, stampModule } from './kane/graphOps'
import { KaneAppProvider, useKaneApp } from './kane/KaneAppContext'
import { KaneContextMenu } from './kane/KaneContextMenu'
import { KaneContextualToolbar } from './kane/KaneContextualToolbar'
import { KaneFinder } from './kane/KaneFinder'
import { KaneMinimap } from './kane/KaneMinimap'
import { KaneShortcuts } from './kane/KaneShortcuts'
import { KaneToolbar } from './kane/KaneToolbar'
import { RightBar } from './kane/RightBar'
import { FollowRunningCard } from './kane/FollowRunningCard'
import { RunCursor } from './kane/RunCursor'
import { Toasts } from './kane/Toast'
import { Topbar } from './kane/Topbar'
import { installWorkflowRules } from './kane/workflowRules'
import { CardAiPopover } from './nodes/CardAiPopover'
import { NodeShapeUtil } from './nodes/NodeShapeUtil'
import { PointingPort } from './ports/PointingPort'

/** The dotted grid only appears once you're zoomed in past the threshold. */
function KaneGrid(props: TLGridProps) {
	if (props.z < GRID_MIN_ZOOM) return null
	return <DefaultGrid {...props} />
}

const shapeUtils = [NodeShapeUtil, ConnectionShapeUtil]
const bindingUtils = [ConnectionBindingUtil]
const overlayUtils = [ConnectionCenterHandleOverlayUtil]

const components: TLComponents = {
	InFrontOfTheCanvas: () => (
		<>
			{/* No workflow region here. The dotted outline and its "Workflow" chip
			    are off the canvas until how a workflow behaves alongside detached
			    cards, second workflows and modules is settled — the component is
			    still in components/PipelineRegions.tsx, simply not mounted. */}
			<OnCanvasNodePicker />
			<CardAiPopover />
			<Collaborators />
			<KaneContextualToolbar />
			<KaneMinimap />
			<RunCursor />
			<FollowRunningCard />
			<KaneShortcuts />
			<KaneFinder />
		</>
	),
	Toolbar: null,
	Grid: KaneGrid,
	ContextMenu: KaneContextMenu,
	// Kane provides its own chrome; hide tldraw's default panels.
	MenuPanel: null,
	TopPanel: null,
	SharePanel: null,
	NavigationPanel: null,
	Minimap: null,
	StylePanel: null,
	PageMenu: null,
	HelpMenu: null,
	DebugPanel: null,
	DebugMenu: null,
	HelperButtons: null,
}

const options: Partial<TldrawOptions> = {
	actionShortcutsLocation: 'menu',
	maxPages: 1,
	// Kane's canvas is a workflow, not a whiteboard: a stray double-click should
	// never drop a free-text shape into it. Cards come from the toolbar, the
	// slash palette or the agent.
	createTextOnCanvasDoubleClick: false,
}

const SPLIT_CANVAS_DEFAULT_W = 420
const SPLIT_CANVAS_MIN_W = 240

function Shell() {
	const { browserView, setEditor, theme } = useKaneApp()
	const [canvasW, setCanvasW] = useState(SPLIT_CANVAS_DEFAULT_W)
	const [collapsed, setCollapsed] = useState(false)
	const [dragging, setDragging] = useState(false)
	const sepDrag = useRef<{ sx: number; sw: number } | null>(null)

	const split = browserView === 'split'

	function onSepDown(e: React.PointerEvent) {
		e.preventDefault()
		sepDrag.current = { sx: e.clientX, sw: canvasW }
		setDragging(true)
		window.addEventListener('pointermove', onSepMove)
		window.addEventListener('pointerup', onSepUp)
	}
	function onSepMove(e: PointerEvent) {
		if (!sepDrag.current) return
		let w = sepDrag.current.sw + (e.clientX - sepDrag.current.sx)
		w = Math.min(SPLIT_CANVAS_DEFAULT_W, w)
		if (w < SPLIT_CANVAS_MIN_W) {
			setCollapsed(true)
			onSepUp()
			return
		}
		setCanvasW(w)
	}
	function onSepUp() {
		sepDrag.current = null
		setDragging(false)
		window.removeEventListener('pointermove', onSepMove)
		window.removeEventListener('pointerup', onSepUp)
	}

	const canvasHidden = split && collapsed

	return (
		<div className="kane-app" data-kane-theme={theme}>
			<Topbar />
			<div className="kane-body">
				<div className="kane-work">
					<div
						className={`kane-canvas-col ${dragging ? 'dragging' : ''} ${canvasHidden ? 'is-collapsed' : ''} ${split && !collapsed ? 'is-split' : ''}`}
						style={split && !collapsed ? { width: canvasW } : undefined}
						onContextMenu={(e) => e.preventDefault()}
					>
						<AmbientShader />
						<Tldraw
							persistenceKey="kane-tldraw"
							// Read from our own code so Vite inlines it at build time.
							// Absent locally — tldraw treats localhost as development
							// and needs no key there. A public deploy is production
							// under tldraw's license and does: see README, "Live site".
							licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
							options={options}
							shapeUtils={shapeUtils}
							bindingUtils={bindingUtils}
							overlayUtils={overlayUtils}
							components={components}
							onMount={(editor) => {
								;(window as unknown as { editor: Editor }).editor = editor
								setEditor(editor)

								// Grid dots — tldraw's built-in grid is a dot grid.
								editor.updateInstanceState({ isGridMode: true })
								editor.user.updateUserPreferences({
									colorScheme:
										localStorage.getItem('kane-theme') === 'dark' ? 'dark' : 'light',
									isSnapMode: true,
								})

								if (!editor.getCurrentPageShapes().some((s) => s.type === 'node')) {
									seedCanvas(editor)
								}

								// Idempotent for dev HMR remounts.
								if (!editor.getStateDescendant('select.pointing_port')) {
									editor.getStateDescendant('select')!.addChild(PointingPort)
								}
								keepConnectionsAtBottom(editor)
								disableTransparency(editor, ['connection'])
								installWorkflowRules(editor)
								// A card type that changes width leaves every saved
								// canvas with that card overlapping its neighbour.
								// No-ops when nothing overlaps.
								separateOverlappingCards(editor)
							}}
						/>
						{/* The Canvas ↔ Browser switch used to float at the canvas's
						    top-right. It lives in the omnibox footer now, with the rest
						    of the controls — and as a floating overlay at z-index 40 it
						    sat on top of the popped-out browser window (38), swallowing
						    every drag that started on the left of its titlebar. */}
						{/* toolbar sits just above the omnibox; maximizing moves both */}
						{!canvasHidden && (
							<div className="kane-left-stack">
								<KaneToolbar />
								<AgentPanel />
							</div>
						)}
					</div>

					{split && !collapsed && (
						<div className={`separator ${dragging ? 'active' : ''}`} onPointerDown={onSepDown}>
							<div className="separator-hit" />
							<div className="separator-glow" />
						</div>
					)}

					{canvasHidden && (
						<button
							className="collapsed-indicator"
							onClick={() => {
								setCollapsed(false)
								setCanvasW(SPLIT_CANVAS_DEFAULT_W)
							}}
							aria-label="View steps on canvas"
						>
							<PanelLeftOpen size={18} />
							<span
								className="tooltip"
								style={{
									right: 'auto',
									left: 'calc(100% + 8px)',
									top: '50%',
									transform: 'translateY(-50%)',
								}}
							>
								View steps on canvas
							</span>
						</button>
					)}

					{split && (
						<div className="kane-browser-col">
							<BrowserSurface variant="split" />
						</div>
					)}

					{browserView === 'window' && <BrowserWindow />}

					<Drawer />
				</div>
				<RightBar />
			</div>
			<Toasts />
		</div>
	)
}

/** Seed the canvas with the “Login flow” module + a parameter card so it isn't empty. */
function seedCanvas(editor: Editor) {
	stampModule(editor, SAVED_MODULES[0], { x: 200, y: 200 })
	editor.createShape({
		type: 'node',
		x: 200,
		y: 640,
		props: {
			node: { type: 'parameter', name: 'baseUrl', value: 'https://app.lambdatest.com' },
		},
	})
	editor.selectNone()
	const bounds = editor.getCurrentPageBounds()
	if (bounds) {
		editor.zoomToBounds(bounds.clone().expandBy(120), { immediate: true, targetZoom: 0.85 })
	}
}

function App() {
	return (
		<KaneAppProvider>
			<Shell />
		</KaneAppProvider>
	)
}

export default App
