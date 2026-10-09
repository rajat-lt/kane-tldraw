import {
	BookOpen,
	Braces,
	Cloud,
	Code2,
	Download,
	FileSpreadsheet,
	FileText,
	Folder,
	Globe,
	HardDrive,
	History,
	Image,
	KeyRound,
	Layers,
	List,
	MousePointerClick,
	Power,
	RefreshCw,
	ShieldCheck,
	SlidersHorizontal,
	Split,
	TextCursorInput,
	Variable,
	Webhook,
} from 'lucide-react'

/**
 * Confirmed catalog data carried over from the previous Kane build, updated for
 * the new card set (if/else, parameter/secret/totp/variable, click, input box,
 * while loop, module).
 */

export interface SlashCommand {
	id: string
	label: string
	icon: typeof Split
	/** node type to create, or a special action id */
	action: { kind: 'node'; nodeType: string } | { kind: 'module' } | { kind: 'upload' }
}

/**
 * The slash palette, grouped the way the cards are actually reached for: the
 * data a test carries, the things it does to a page, the control flow around
 * them, the two escape hatches, and finally a whole saved module.
 *
 * A flat alphabetical list made every card equally far away; grouping puts the
 * four data cards together (they are chosen as a set) and keeps the escape
 * hatches — Javascript and API — clearly apart from the UI steps.
 */
export interface SlashGroup {
	heading: string
	commands: SlashCommand[]
}

export const SLASH_GROUPS: SlashGroup[] = [
	{
		heading: 'Data',
		commands: [
			{
				id: 'variable',
				label: 'Variable',
				icon: Variable,
				action: { kind: 'node', nodeType: 'variable' },
			},
			{
				id: 'parameter',
				label: 'Parameter',
				icon: SlidersHorizontal,
				action: { kind: 'node', nodeType: 'parameter' },
			},
			{
				id: 'secret',
				label: 'Secret',
				icon: KeyRound,
				action: { kind: 'node', nodeType: 'secret' },
			},
			{
				id: 'totp',
				label: 'TOTP Auth',
				icon: ShieldCheck,
				action: { kind: 'node', nodeType: 'totp' },
			},
		],
	},
	{
		heading: 'Interact',
		commands: [
			{
				id: 'click',
				label: 'Click',
				icon: MousePointerClick,
				action: { kind: 'node', nodeType: 'click' },
			},
			{ id: 'open', label: 'Open page', icon: Globe, action: { kind: 'node', nodeType: 'open' } },
			{
				id: 'input',
				label: 'Input box',
				icon: TextCursorInput,
				action: { kind: 'node', nodeType: 'input' },
			},
		],
	},
	{
		heading: 'Flow',
		commands: [
			{
				id: 'ifelse',
				label: 'If / Else',
				icon: Split,
				action: { kind: 'node', nodeType: 'ifelse' },
			},
			{
				id: 'while',
				label: 'While loop',
				icon: RefreshCw,
				action: { kind: 'node', nodeType: 'while' },
			},
		],
	},
	{
		heading: 'Code',
		commands: [
			{ id: 'js', label: 'Javascript', icon: Braces, action: { kind: 'node', nodeType: 'js' } },
			{ id: 'api', label: 'API request', icon: Webhook, action: { kind: 'node', nodeType: 'api' } },
		],
	},
	{
		heading: 'Reuse',
		commands: [{ id: 'module', label: 'Module', icon: Layers, action: { kind: 'module' } }],
	},
]

/** Every command, flattened — for anything that just needs the list. */
export const SLASH_COMMANDS: SlashCommand[] = SLASH_GROUPS.flatMap((g) => g.commands)

export const QUICK_ADD = [
	{ id: 'qa-click', label: 'Quick add: Click', icon: MousePointerClick, nodeType: 'click' },
	{ id: 'qa-input', label: 'Quick add: Input box', icon: TextCursorInput, nodeType: 'input' },
	{ id: 'qa-variable', label: 'Quick add: Variable', icon: Variable, nodeType: 'variable' },
]

export const RIGHTBAR_TOP = [
	{ id: 'context', label: 'Context', icon: BookOpen },
	{ id: 'variables', label: 'Variables', icon: Variable, functional: true },
	{ id: 'versions', label: 'Versions', icon: History, functional: true },
	{ id: 'code', label: 'Code', icon: Code2, functional: true },
	{ id: 'module', label: 'Modules', icon: Layers, functional: true },
	{ id: 'downloads', label: 'Downloads', icon: Download },
]
export const RIGHTBAR_BOTTOM = [
	{ id: 'list', label: 'Steps list', icon: List },
	{ id: 'off', label: 'Turn off session', icon: Power },
]

export const PLUS_ICONS = {
	local: HardDrive,
	gdrive: Cloud,
	onedrive: Folder,
}

/**
 * Brand marks for the linked sources in the omnibox + menu.
 *
 * Same approach as the code panel's language logos: the projects' own icon
 * sets rather than redrawn glyphs. Simple Icons has Jira, Confluence and
 * Notion; it has no Azure DevOps mark, so that one comes from devicon (in its
 * original colours). All four URLs were checked to return a real SVG.
 */
const SIMPLE_ICONS = 'https://cdn.simpleicons.org'
const DEVICON_ICONS = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons'

export const SOURCE_LOGOS: Record<'jira' | 'ado' | 'confluence' | 'notion', string> = {
	jira: `${SIMPLE_ICONS}/jira/0052CC`,
	ado: `${DEVICON_ICONS}/azuredevops/azuredevops-original.svg`,
	confluence: `${SIMPLE_ICONS}/confluence/172B4D`,
	notion: `${SIMPLE_ICONS}/notion/000000`,
}

export const URL_SUGGESTIONS = [
	'app.lambdatest.com/login',
	'app.lambdatest.com/dashboard',
	'accounts.lambdatest.com/login',
	'www.lambdatest.com/pricing',
	'staging.shop.example.com/cart',
	// the sample pages, reachable by name as well as from a new tab
	'shop.demo.test',
	'docs.demo.test',
	'dash.demo.test',
	'account.demo.test',
	'status.demo.test',
]

export const FILE_ICONS: Record<string, typeof FileText> = {
	pdf: FileText,
	docx: FileText,
	xlsx: FileSpreadsheet,
	csv: FileSpreadsheet,
	jpg: Image,
	png: Image,
}
export const ALLOWED_EXT = ['pdf', 'docx', 'jpg', 'png', 'xlsx', 'csv']
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export type SessionKey =
	| 'idle'
	| 'draft'
	| 'recording'
	| 'generating'
	| 'running'
	| 'disconnected'
	| 'errored'

export const SESSION_STATES: Record<SessionKey, { label: string; color: string }> = {
	idle: { label: 'Idle', color: 'var(--blue)' },
	draft: { label: 'Draft', color: 'var(--gray-500)' },
	recording: { label: 'Recording', color: 'var(--red)' },
	generating: { label: 'Generating', color: 'var(--purple)' },
	running: { label: 'Running', color: 'var(--green)' },
	disconnected: { label: 'Disconnected', color: 'var(--red)' },
	errored: { label: 'Errored', color: 'var(--red)' },
}

/**
 * Saved modules (the Modules drawer). Each is a small reusable workflow:
 * relative node positions + connections, stamped inside a named frame.
 */
export interface SavedModuleNode {
	localId: string
	x: number
	y: number
	node: Record<string, unknown> & { type: string }
}
export interface SavedModuleConnection {
	from: string
	fromPort: string
	to: string
	toPort: string
}
export interface SavedModule {
	id: string
	name: string
	/** Bumped each time the module is re-saved; stamped onto every copy. */
	version: number
	/**
	 * Whether the module runs unattended. A non-automated one still has a step
	 * that needs a person (a payment sheet, a device prompt), so it can't be put
	 * in a scheduled pack — worth knowing before you stamp it in.
	 */
	automated: boolean
	/** ISO date it was last saved. */
	updatedAt: string
	/** Where it sits in the module library. */
	folder: string
	nodes: SavedModuleNode[]
	connections: SavedModuleConnection[]
}

const login = (suffix: string): SavedModuleNode[] => [
	{
		localId: 'open',
		x: 0,
		y: 0,
		node: { type: 'open', url: `app.lambdatest.com/${suffix}` },
	},
	{
		localId: 'email',
		x: 320,
		y: 0,
		node: { type: 'input', target: 'Email field', text: 'you@company.com', pressEnter: false },
	},
	{
		localId: 'password',
		x: 640,
		y: 0,
		node: { type: 'input', target: 'Password field', text: '{{password}}', pressEnter: false },
	},
	{
		localId: 'submit',
		x: 960,
		y: 0,
		node: { type: 'click', target: '“Sign in” button', clickType: 'single' },
	},
]

const chain = (...ids: string[]): SavedModuleConnection[] =>
	ids.slice(1).map((to, i) => ({ from: ids[i], fromPort: 'output', to, toPort: 'input' }))

export const SAVED_MODULES: SavedModule[] = [
	{
		id: 'm1',
		name: 'Login flow',
		version: 3,
		automated: true,
		updatedAt: '2026-07-22',
		folder: 'Regression / Auth',
		nodes: login('login'),
		connections: chain('open', 'email', 'password', 'submit'),
	},
	{
		id: 'm2',
		name: 'Add to cart',
		version: 2,
		automated: true,
		updatedAt: '2026-08-01',
		folder: 'Smoke / Commerce',
		nodes: [
			{ localId: 'open', x: 0, y: 0, node: { type: 'open', url: 'staging.shop.example.com' } },
			{
				localId: 'search',
				x: 320,
				y: 0,
				node: { type: 'input', target: 'Search bar', text: 'wireless mouse', pressEnter: true },
			},
			{
				localId: 'add',
				x: 640,
				y: 0,
				node: { type: 'click', target: '“Add to cart” button', clickType: 'single' },
			},
		],
		connections: chain('open', 'search', 'add'),
	},
	{
		id: 'm3',
		name: 'Checkout — guest',
		version: 5,
		// the payment sheet still needs a person
		automated: false,
		updatedAt: '2026-06-18',
		folder: 'Regression / Checkout',
		nodes: [
			{ localId: 'open', x: 0, y: 0, node: { type: 'open', url: 'staging.shop.example.com/cart' } },
			{
				localId: 'checkout',
				x: 320,
				y: 0,
				node: { type: 'click', target: '“Checkout” button', clickType: 'single' },
			},
			{
				localId: 'guest',
				x: 640,
				y: 0,
				node: { type: 'click', target: '“Continue as guest”', clickType: 'single' },
			},
			{
				localId: 'email',
				x: 960,
				y: 0,
				node: { type: 'input', target: 'Email field', text: 'guest@example.com', pressEnter: false },
			},
			{
				localId: 'place',
				x: 1280,
				y: 0,
				node: { type: 'click', target: '“Place order” button', clickType: 'single' },
			},
		],
		connections: chain('open', 'checkout', 'guest', 'email', 'place'),
	},
	{
		id: 'm4',
		name: 'Password reset',
		version: 1,
		// waits on a real inbox for the reset link
		automated: false,
		updatedAt: '2026-05-09',
		folder: 'Regression / Auth',
		nodes: [
			{
				localId: 'open',
				x: 0,
				y: 0,
				node: { type: 'open', url: 'accounts.lambdatest.com/forgot' },
			},
			{
				localId: 'email',
				x: 320,
				y: 0,
				node: { type: 'input', target: 'Email field', text: '{{email}}', pressEnter: false },
			},
			{
				localId: 'send',
				x: 640,
				y: 0,
				node: { type: 'click', target: '“Send reset link”', clickType: 'single' },
			},
		],
		connections: chain('open', 'email', 'send'),
	},
]
