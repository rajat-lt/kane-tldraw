import classNames from 'classnames'
import { PointerEvent, SyntheticEvent, useCallback, useRef, useState } from 'react'
import {
	Editor,
	T,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TLShapeId,
	useEditor,
	useValue,
} from 'tldraw'
import { AddIcon } from '../../components/icons/AddIcon'
import { SubtractIcon } from '../../components/icons/SubtractIcon'
import {
	NODE_FOOTER_HEIGHT_PX,
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_BOTTOM_PADDING_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_WIDTH_PX,
	PORT_TYPE_COLORS,
	PortDataType,
} from '../../constants'
import { Port, PortId, ShapePort } from '../../ports/Port'
import { getNodeInputPortValues } from '../nodePorts'
// Type-only, both of them: every card module imports this one, and a value
// import here would make `shared` wait on modules that are waiting on it. It
// cost an hour of "Cannot access 'NodeDefinition' before initialization" once.
import type { NodeShape } from '../NodeShapeUtil'
import type { NodeType } from '../nodeTypes'

/**
 * Pipeline values can be strings (prompts, image URLs, model IDs), numbers (steps, cfg scale),
 * or null (no value yet).
 */
export type PipelineValue = string | number | null

/**
 * A special value that can be returned from a node to indicate that execution should stop.
 */
export type STOP_EXECUTION = typeof STOP_EXECUTION
export const STOP_EXECUTION = Symbol('STOP_EXECUTION')

export interface SingleInfoValue {
	value: PipelineValue | STOP_EXECUTION
	isOutOfDate: boolean
	dataType: PortDataType
	multi?: false
}

export interface MultiInfoValue {
	value: (PipelineValue | STOP_EXECUTION)[]
	isOutOfDate: boolean
	dataType: PortDataType
	multi: true
}

export type InfoValue = SingleInfoValue | MultiInfoValue

export function isMultiInfoValue(v: InfoValue): v is MultiInfoValue {
	return v.multi === true
}

export interface InfoValues {
	[key: string]: InfoValue
}

export interface ExecutionResult {
	[key: string]: PipelineValue | STOP_EXECUTION
}

export interface InputValues {
	[key: string]: PipelineValue | PipelineValue[]
}

export interface NodeComponentProps<Node extends { type: string }> {
	shape: NodeShape
	node: Node
}

export abstract class NodeDefinition<Node extends { type: string }> {
	constructor(public readonly editor: Editor) {
		const ctor = this.constructor as NodeDefinitionConstructor<Node>
		this.type = ctor.type
		this.validator = ctor.validator
	}

	readonly type: Node['type']
	readonly validator: T.Validator<Node>
	abstract readonly title: string
	abstract readonly heading?: string
	abstract readonly icon: React.ReactElement
	/** A short category label for grouping in the toolbar. */
	abstract readonly category: string
	readonly resultKeys?: readonly string[]
	/**
	 * Whether the card carries its own width/height and can be dragged bigger.
	 * A resizable card must read {@link cardWidth} / {@link cardBodyHeight} in
	 * `getWidthPx`, `getBodyHeightPx` and `getPorts`, so its geometry, its ports
	 * and its DOM all agree on the same box.
	 */
	readonly canResizeNode: boolean = false
	/** If true, this node type is hidden from the toolbar and on-canvas picker. */
	readonly hidden: boolean = false

	getWidthPx(_shape: NodeShape, _node: Node): number {
		return NODE_WIDTH_PX
	}

	abstract getDefault(): Node
	abstract getBodyHeightPx(shape: NodeShape, node: Node): number
	abstract getPorts(shape: NodeShape, node: Node): Record<string, ShapePort>
	onPortConnect(_shape: NodeShape, _node: Node, _port: PortId): void {}
	onPortDisconnect(_shape: NodeShape, _node: Node, _port: PortId): void {}
	abstract getOutputInfo(shape: NodeShape, node: Node, inputs: InfoValues): InfoValues
	abstract execute(shape: NodeShape, node: Node, inputs: InputValues): Promise<ExecutionResult>
	abstract Component: React.ComponentType<NodeComponentProps<Node>>
}

export interface NodeDefinitionConstructor<Node extends { type: string }> {
	new (editor: Editor): NodeDefinition<Node>
	readonly type: Node['type']
	readonly validator: T.Validator<Node>
}

// ---------------------------------------------------------------------------
// Resizable cards
// ---------------------------------------------------------------------------

/**
 * Cards whose contents are long-form — a condition, a JSON body, a snippet —
 * carry their own size so they can be dragged bigger. `w` and `h` are the whole
 * card in page pixels and are both optional: a card that has never been resized
 * simply has neither, which is also what every card persisted before this
 * existed looks like.
 */
export interface SizedNode {
	w?: number
	h?: number
}

/** Everything the card spends on chrome, above and below its rows. */
export const CARD_CHROME_PX =
	NODE_HEADER_HEIGHT_PX +
	NODE_ROW_HEADER_GAP_PX +
	NODE_ROW_BOTTOM_PADDING_PX +
	NODE_FOOTER_HEIGHT_PX

/**
 * Resizing only ever grows a card: the minimum is whatever the card needs
 * anyway, so no drag can hide a row or squeeze an input to nothing. The maxima
 * stop a card from becoming a wall on the canvas.
 */
export const MAX_CARD_WIDTH_PX = 620
export const MAX_CARD_HEIGHT_PX = 760

/** The card's width: its own, clamped, or the standard one. */
export function cardWidth(node: SizedNode): number {
	return Math.max(NODE_WIDTH_PX, Math.min(MAX_CARD_WIDTH_PX, node.w ?? 0))
}

/**
 * The card's body height. `natural` is what the rows need; anything the user
 * has dragged on top of that is extra room for the growable rows to share.
 */
export function cardBodyHeight(node: SizedNode, natural: number): number {
	return Math.max(natural, Math.min(MAX_CARD_HEIGHT_PX, node.h ?? 0) - CARD_CHROME_PX)
}

/**
 * The bottom-right corner grip.
 *
 * tldraw's own resize handles are switched off for cards (they draw a selection
 * box that fights the card's chrome), so this is a plain pointer drag that
 * writes `w`/`h` straight onto the node. Screen deltas are divided by the zoom
 * level, or the card would move faster than the pointer when zoomed out.
 */
export function NodeResizeGrip({
	shape,
	minWidth,
	minHeight,
}: {
	shape: NodeShape
	minWidth: number
	minHeight: number
}) {
	const editor = useEditor()
	const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

	const onPointerDown = (e: PointerEvent) => {
		e.stopPropagation()
		e.preventDefault()
		const node = shape.props.node as SizedNode
		start.current = {
			x: e.clientX,
			y: e.clientY,
			w: Math.max(minWidth, node.w ?? minWidth),
			h: Math.max(minHeight, node.h ?? minHeight),
		}
		editor.setSelectedShapes([shape.id])
		;(e.target as HTMLElement).setPointerCapture(e.pointerId)
	}

	const onPointerMove = (e: PointerEvent) => {
		const from = start.current
		if (!from) return
		const zoom = editor.getZoomLevel() || 1
		const w = Math.round(
			Math.max(minWidth, Math.min(MAX_CARD_WIDTH_PX, from.w + (e.clientX - from.x) / zoom))
		)
		const h = Math.round(
			Math.max(minHeight, Math.min(MAX_CARD_HEIGHT_PX, from.h + (e.clientY - from.y) / zoom))
		)
		updateNode(editor, shape, (n) => ({ ...(n as object), w, h }) as never, false)
	}

	const onPointerUp = (e: PointerEvent) => {
		if (!start.current) return
		start.current = null
		try {
			;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
		} catch {
			// capture may already be gone if the pointer left the window
		}
	}

	return (
		<div
			className="NodeResizeGrip"
			title="Drag to resize"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onDoubleClick={(e) => {
				// back to the size the contents ask for
				e.stopPropagation()
				updateNode(
					editor,
					shape,
					(n) => ({ ...(n as object), w: undefined, h: undefined }) as never,
					false
				)
			}}
		>
			<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
				<path d="M9.5 0.5v9h-9" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
				<path d="M9.5 4.5v5h-5" fill="none" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		</div>
	)
}

/**
 * Update the `node` prop within a node shape.
 */
export function updateNode<T extends NodeType>(
	editor: Editor,
	shape: NodeShape,
	update: (node: T) => T,
	isOutOfDate: boolean = true
) {
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { node: update(shape.props.node as T), isOutOfDate },
	})
}

/** How a card's condition is written: in words, or operand · operator · operand. */
export type ConditionMode = 'nl' | 'structured'

/** Which way this card's condition is currently written. */
export function conditionModeOf(node: { mode?: ConditionMode }): ConditionMode {
	return node.mode ?? 'nl'
}

/**
 * Flip a card's condition between the two ways of writing one.
 *
 * If/Else and While both carry the same `mode` field and the same header
 * toggle, so the flip lives here rather than once in each card.
 */
export function toggleConditionMode(editor: Editor, shape: NodeShape) {
	updateNode(editor, shape, (n) => {
		const mode = conditionModeOf(n as { mode?: ConditionMode })
		return { ...(n as object), mode: mode === 'nl' ? 'structured' : 'nl' } as never
	})
}

/**
 * A row in a node. This component just applies some styling.
 */
export function NodeRow({
	children,
	className,
	...props
}: {
	children: React.ReactNode
	className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div {...props} className={classNames('NodeRow', className)}>
			{children}
		</div>
	)
}

/**
 * A label for a port row, displayed next to the port.
 */
export function NodePortLabel({
	children,
	dataType,
}: {
	children: React.ReactNode
	dataType: PortDataType
}) {
	return (
		<span className="NodePortLabel" style={{ color: PORT_TYPE_COLORS[dataType] }}>
			{children}
		</span>
	)
}

/**
 * A row in a node for a numeric input. If the port is connected, the input is disabled and the
 * value is taken from the port. Otherwise, the input is editable with a spinner for incrementing
 * and decrementing the value.
 */
export function NodeInputRow({
	shapeId,
	portId,
	label,
	value,
	onChange,
	onBlur,
}: {
	shapeId: TLShapeId
	portId: PortId
	label?: string
	value: number
	onChange: (value: number) => void
	onBlur?: () => void
}) {
	const editor = useEditor()
	const inputRef = useRef<HTMLInputElement>(null)
	const portInfo = useValue('from port', () => getNodeInputPortValues(editor, shapeId)[portId], [
		editor,
		shapeId,
		portId,
	])
	const valueFromPort = portInfo?.value
	const isOutOfDate = portInfo?.isOutOfDate

	const [pendingValue, setPendingValue] = useState<string | null>(null)

	const onPointerDown = useCallback((event: PointerEvent) => {
		event.stopPropagation()
	}, [])

	const onSpinner = (delta: number) => {
		const newValue = value + delta
		onChange(newValue)
		setPendingValue(String(newValue))
		inputRef.current?.focus()
	}

	const displayValue = isOutOfDate
		? '...'
		: typeof valueFromPort === 'number'
			? valueFromPort
			: valueFromPort != null
				? String(valueFromPort)
				: (pendingValue ?? value)

	return (
		<NodeRow className="NodeInputRow">
			<Port shapeId={shapeId} portId={portId} />
			{label && <span className="NodeInputRow-label">{label}</span>}
			{isOutOfDate || valueFromPort === STOP_EXECUTION ? (
				<NodePlaceholder />
			) : (
				<input
					ref={inputRef}
					type="text"
					inputMode="decimal"
					disabled={valueFromPort != null}
					value={displayValue}
					onChange={(e) => {
						setPendingValue(e.currentTarget.value)
						const asNumber = Number(e.currentTarget.value.trim())
						if (Number.isNaN(asNumber)) return
						onChange(asNumber)
					}}
					onPointerDown={onPointerDown}
					onBlur={() => {
						setPendingValue(null)
						onBlur?.()
					}}
					onFocus={() => {
						editor.setSelectedShapes([shapeId])
					}}
				/>
			)}
			<div className="NodeInputRow-buttons">
				<TldrawUiButton
					title="decrement"
					type="icon"
					onPointerDown={onPointerDown}
					onClick={() => onSpinner(-1)}
				>
					<TldrawUiButtonIcon icon={<SubtractIcon />} />
				</TldrawUiButton>
				<TldrawUiButton
					title="increment"
					type="icon"
					onPointerDown={onPointerDown}
					onClick={() => onSpinner(1)}
				>
					<TldrawUiButtonIcon icon={<AddIcon />} />
				</TldrawUiButton>
			</div>
		</NodeRow>
	)
}

/**
 * A placeholder for a value that is not yet computed.
 */
export function NodePlaceholder() {
	return <div className="NodeValue_placeholder" />
}

// LastShot + CardShot live in ./lastShot to stay outside the
// shared ↔ nodeTypes ↔ card-definition import cycle.

/**
 * A row with a text input. If `portId` is given, the row renders a value port;
 * while that port is connected the input is replaced by the incoming value.
 * With `masked`, the value is hidden behind dots with a reveal toggle (used by
 * the Secret card).
 */
export function NodeTextRow({
	shapeId,
	portId,
	label,
	strongLabel,
	value,
	placeholder,
	masked,
	onChange,
}: {
	shapeId: TLShapeId
	portId?: PortId
	label?: string
	/** Use the bold uppercase card label rather than the quiet one. */
	strongLabel?: boolean
	value: string
	placeholder?: string
	masked?: boolean
	onChange: (value: string) => void
}) {
	const editor = useEditor()
	const [revealed, setRevealed] = useState(false)
	const portInfo = useValue(
		'text from port',
		() => (portId ? getNodeInputPortValues(editor, shapeId)[portId] : undefined),
		[editor, shapeId, portId]
	)
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])

	const connected = portInfo !== undefined
	const connectedValue =
		connected && portInfo.value !== STOP_EXECUTION && !portInfo.isOutOfDate
			? String(portInfo.multi ? (portInfo.value[0] ?? '') : (portInfo.value ?? ''))
			: null

	return (
		<NodeRow className="NodeTextRow">
			{portId && <Port shapeId={shapeId} portId={portId} />}
			{label &&
				(strongLabel ? (
					<NodeCardLabel>{label}</NodeCardLabel>
				) : (
					<span className="NodeInputRow-label">{label}</span>
				))}
			{connected ? (
				connectedValue !== null ? (
					<span className="NodeRow-connected-value" title={connectedValue}>
						{masked && !revealed ? '••••••••' : connectedValue}
					</span>
				) : (
					<NodePlaceholder />
				)
			) : (
				<input
					type={masked && !revealed ? 'password' : 'text'}
					value={value}
					placeholder={placeholder}
					onChange={(e) => onChange(e.currentTarget.value)}
					onPointerDown={stop}
					onFocus={() => editor.setSelectedShapes([shapeId])}
				/>
			)}
			{masked && (
				<button
					className="NodeRevealButton"
					title={revealed ? 'Hide value' : 'Reveal value'}
					onPointerDown={stop}
					onClick={() => setRevealed((v) => !v)}
				>
					{revealed ? (
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
					) : (
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
					)}
				</button>
			)}
		</NodeRow>
	)
}

/**
 * The bold uppercase label the redesigned cards put in front of every field —
 * ELEMENT, TYPE, WHILE, PROMPT. Distinct from {@link NodeInputRow}'s quieter
 * label, which the data and code cards still use.
 */
export function NodeCardLabel({ children }: { children: React.ReactNode }) {
	return <span className="NodeCardLabel">{children}</span>
}

/**
 * A row with a multi-line field: an element description, a condition, a prompt.
 * Sized by {@link NODE_FIELD_HEIGHT_PX}, which is what the card's geometry and
 * its port positions are computed from.
 */
export function NodeFieldRow({
	shapeId,
	portId,
	label,
	value,
	placeholder,
	onChange,
	children,
}: {
	shapeId: TLShapeId
	portId?: PortId
	label: string
	value: string
	placeholder?: string
	onChange: (value: string) => void
	children?: React.ReactNode
}) {
	const editor = useEditor()
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])
	const portInfo = useValue(
		'field from port',
		() => (portId ? getNodeInputPortValues(editor, shapeId)[portId] : undefined),
		[editor, shapeId, portId]
	)
	const connected = portInfo !== undefined
	const connectedValue =
		connected && portInfo.value !== STOP_EXECUTION && !portInfo.isOutOfDate
			? String(portInfo.multi ? (portInfo.value[0] ?? '') : (portInfo.value ?? ''))
			: null

	return (
		<NodeRow className="NodeFieldRow">
			{portId && <Port shapeId={shapeId} portId={portId} />}
			<NodeCardLabel>{label}</NodeCardLabel>
			{connected ? (
				connectedValue !== null ? (
					<span className="NodeRow-connected-value" title={connectedValue}>
						{connectedValue}
					</span>
				) : (
					<NodePlaceholder />
				)
			) : (
				<textarea
					className="NodeFieldRow-input"
					value={value}
					placeholder={placeholder}
					spellCheck={false}
					onChange={(e) => onChange(e.currentTarget.value)}
					onPointerDown={stop}
					onKeyDown={(e) => e.stopPropagation()}
					onFocus={() => editor.setSelectedShapes([shapeId])}
				/>
			)}
			{children}
		</NodeRow>
	)
}

/**
 * File what a run of this card produced, and open the panel on the screenshot —
 * the thing anyone looks at first once a step has finished.
 */
export function recordRun(
	editor: Editor,
	shape: NodeShape,
	run: { ms: number; thought: string; view: string; target?: string }
) {
	updateNode(
		editor,
		shape,
		(n) => ({ ...(n as object), run, panel: 'screenshot' }) as never,
		false
	)
}

/**
 * A row showing a value the card holds but nobody types: a locator the
 * Inspector captured, an id the runtime assigned. It is selectable and can be
 * copied, but not edited — editing an XPath by hand in a 260px box is a way to
 * break a card, not to fix one.
 */
export function NodeReadonlyRow({
	label,
	value,
	title,
	children,
}: {
	label: string
	value: string
	title?: string
	children?: React.ReactNode
}) {
	const [copied, setCopied] = useState(false)
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])
	return (
		<NodeRow className="NodeReadonlyRow">
			<NodeCardLabel>{label}</NodeCardLabel>
			{/* Shown whole, over as many lines as it takes. A locator is the one
			    thing on the card you might need to read character by character —
			    an ellipsis in the middle of one is worse than a taller card. */}
			{/* One line, cut at the front. The end of a locator is the part that
			    says which element this is — `…/div[2]/button[1]` — and the front is
			    the boilerplate every XPath on the page shares. The whole value is
			    in the tooltip and on the clipboard. */}
			<span className="NodeReadonlyRow-value" title={title ?? value}>
				<span className="NodeReadonlyRow-text">{value}</span>
			</span>
			<button
				className="NodeRevealButton"
				title={copied ? 'Copied' : 'Copy'}
				onPointerDown={stop}
				onClick={() => {
					navigator.clipboard?.writeText(value).catch(() => {})
					setCopied(true)
					window.setTimeout(() => setCopied(false), 1200)
				}}
			>
				{copied ? (
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
				) : (
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
				)}
			</button>
			{children}
		</NodeRow>
	)
}

/**
 * A row with a labelled checkbox.
 */
export function NodeCheckboxRow({
	shapeId,
	label,
	checked,
	onChange,
}: {
	shapeId: TLShapeId
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	const editor = useEditor()
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])
	return (
		<NodeRow className="NodeCheckboxRow">
			<label onPointerDown={stop}>
				<input
					type="checkbox"
					checked={checked}
					onChange={(e) => onChange(e.currentTarget.checked)}
					onPointerDown={stop}
					onFocus={() => editor.setSelectedShapes([shapeId])}
				/>
				<span>{label}</span>
			</label>
		</NodeRow>
	)
}

/**
 * A row with small segmented options (e.g. click type: single / double / right).
 */
export function NodeSegmentedRow<Value extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label?: string
	options: readonly { value: Value; label: string }[]
	value: Value
	onChange: (value: Value) => void
}) {
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])
	return (
		<NodeRow className="NodeSegmentedRow">
			{label && <span className="NodeInputRow-label">{label}</span>}
			<div className="NodeSegmentedRow-options" onPointerDown={stop}>
				{options.map((option) => (
					<button
						key={option.value}
						className={classNames('NodeSegmentedRow-option', {
							'NodeSegmentedRow-option_active': option.value === value,
						})}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</NodeRow>
	)
}

/**
 * An image element that hides itself if the source fails to load.
 */
export function NodeImage({ src, alt }: { src: string; alt: string }) {
	const onError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
		e.currentTarget.style.display = 'none'
	}, [])
	return <img src={src} alt={alt} onError={onError} />
}

/**
 * Format a pipeline value for display.
 */
export function NodeValue({ value }: { value: PipelineValue | STOP_EXECUTION }) {
	if (value === STOP_EXECUTION || value === null) {
		return <NodePlaceholder />
	}

	if (typeof value === 'number') {
		return <>{formatNumber(value)}</>
	}

	// For strings, truncate long values
	const str = String(value)
	if (str.length > 20) {
		return <span title={str}>{str.slice(0, 18)}...</span>
	}
	return <>{str}</>
}

function formatNumber(value: number): string {
	if (value === 0) return '0'
	if (!isFinite(value)) return value.toString()

	const absValue = Math.abs(value)
	const sign = value < 0 ? '-' : ''

	if (absValue >= 1_000_000) {
		return sign + (absValue / 1_000_000).toPrecision(3) + 'M'
	}
	if (absValue >= 1_000) {
		return sign + (absValue / 1_000).toPrecision(3) + 'k'
	}

	if (absValue >= 1) {
		return sign + absValue.toPrecision(5).replace(/\.?0+$/, '')
	} else if (absValue >= 0.001) {
		return sign + absValue.toPrecision(3)
	} else {
		return value.toExponential(2)
	}
}

export function areAnyInputsOutOfDate(inputs: InfoValues): boolean {
	return Object.values(inputs).some((input) => input.isOutOfDate)
}

/**
 * Load a URL (data URL or http URL) into an HTMLImageElement.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = (_e) => reject(new Error('Failed to load image'))
		img.crossOrigin = 'anonymous'
		img.src = url
	})
}

/**
 * Convert a Blob to a data URL via FileReader.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

// ---------------------------------------------------------------------------
// Input coercion helpers
// ---------------------------------------------------------------------------

/** Coerce any pipeline value to a string. */
export function coerceToText(value: PipelineValue, fallback = ''): string {
	if (value == null) return fallback
	if (typeof value === 'number') return String(value)
	return value
}

/** Coerce any pipeline value to a number. */
export function coerceToNumber(value: PipelineValue, fallback = 0): number {
	if (value == null) return fallback
	if (typeof value === 'number') return value
	const n = parseFloat(value)
	return Number.isNaN(n) ? fallback : n
}

/** Extract a single value from an InputValues entry (takes first element if array). */
export function getInput(inputs: InputValues, key: string): PipelineValue {
	const v = inputs[key]
	if (Array.isArray(v)) return v[0] ?? null
	return v ?? null
}

/** Always return an array from an InputValues entry. */
export function getInputMulti(inputs: InputValues, key: string): PipelineValue[] {
	const v = inputs[key]
	if (v == null) return []
	if (Array.isArray(v)) return v
	return [v]
}

/** Extract a single value and coerce to string. */
export function getInputText(inputs: InputValues, key: string, fallback = ''): string {
	return coerceToText(getInput(inputs, key), fallback)
}

/** Extract a single value and coerce to number. */
export function getInputNumber(inputs: InputValues, key: string, fallback = 0): number {
	return coerceToNumber(getInput(inputs, key), fallback)
}
