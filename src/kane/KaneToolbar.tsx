import {
	AlignHorizontalDistributeCenter,
	Layers,
	MousePointerClick,
	Split,
	Variable,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createShapeId, Editor } from 'tldraw'
import { getNodeDefinitions } from '../nodes/nodeTypes'
import { beautifyCanvas, createModuleFrame, createNodeShape } from './graphOps'
import { useKaneApp } from './KaneAppContext'
import { kaneToast } from './uiState'

/**
 * The canvas toolbar — a horizontal bar sitting just above the omnibox
 * (separate element, out of flow, revealed while the omnibox has focus — see
 * the .KaneToolbar rules). Left to right: Data cards
 * (parameter/totp/secret/variable) · Controls (if-else, while) · Mostly used
 * (click, open page, input box) · Module · Beautify. Group buttons open a
 * popover above the bar; every command shows its Mac shortcut in the tooltip.
 *
 * There is no Select button: the canvas is always on the select tool, so it did
 * nothing but occupy the first slot.
 */

interface ToolEntry {
	kind: string
	shortcut: string
}

export const DATA_TOOLS: ToolEntry[] = [
	{ kind: 'parameter', shortcut: '⌥P' },
	{ kind: 'totp', shortcut: '⌥T' },
	{ kind: 'secret', shortcut: '⌥S' },
	{ kind: 'variable', shortcut: '⌥V' },
]
export const CONTROL_TOOLS: ToolEntry[] = [
	{ kind: 'ifelse', shortcut: '⌥I' },
	{ kind: 'while', shortcut: '⌥W' },
]
export const MOSTLY_USED_TOOLS: ToolEntry[] = [
	{ kind: 'click', shortcut: '⌥C' },
	{ kind: 'open', shortcut: '⌥O' },
	{ kind: 'input', shortcut: '⌥N' },
]

function Tooltip({ label, shortcut }: { label: string; shortcut?: string }) {
	return (
		<span className="side-tooltip">
			{label}
			{shortcut && <kbd>{shortcut}</kbd>}
		</span>
	)
}

function ToolButton({
	label,
	shortcut,
	active,
	onClick,
	children,
}: {
	label: string
	shortcut?: string
	active?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	const [hover, setHover] = useState(false)
	return (
		<div
			className="side-btn-wrap"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			<button
				className={`side-btn ${active ? 'is-active' : ''}`}
				aria-label={label}
				onClick={onClick}
			>
				{children}
			</button>
			{hover && <Tooltip label={label} shortcut={shortcut} />}
		</div>
	)
}

function GroupPopover({
	editor,
	entries,
	onPick,
}: {
	editor: Editor
	entries: ToolEntry[]
	onPick: (kind: string) => void
}) {
	const defs = getNodeDefinitions(editor)
	return (
		<div className="side-popover">
			{entries.map((entry) => {
				const def = defs[entry.kind as keyof typeof defs]
				return (
					<button
						key={entry.kind}
						className="cmd-item"
						onMouseDown={(e) => {
							e.preventDefault()
							onPick(entry.kind)
						}}
					>
						{def.icon}
						<span>{def.title}</span>
						<kbd className="cmd-kbd">{entry.shortcut}</kbd>
					</button>
				)
			})}
		</div>
	)
}

function KaneToolbarInner({ editor }: { editor: Editor }) {
	const [openGroup, setOpenGroup] = useState<'data' | 'controls' | 'mostly' | null>(null)
	const rootRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!openGroup) return
		function onDown(e: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpenGroup(null)
			}
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [openGroup])

	const createKind = (kind: string) => {
		const defs = getNodeDefinitions(editor)
		const def = defs[kind as keyof typeof defs]
		createNodeShape(editor, createShapeId(), editor.getViewportPageBounds().center, def.getDefault())
		setOpenGroup(null)
	}

	return (
		<div
			className="KaneToolbar"
			ref={rootRef}
			onContextMenu={(e) => e.preventDefault()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<div className="side-group">
				<ToolButton
					label="Data cards"
					active={openGroup === 'data'}
					onClick={() => setOpenGroup(openGroup === 'data' ? null : 'data')}
				>
					<Variable size={17} />
				</ToolButton>
				{openGroup === 'data' && (
					<GroupPopover editor={editor} entries={DATA_TOOLS} onPick={createKind} />
				)}
			</div>

			<div className="side-group">
				<ToolButton
					label="Controls"
					active={openGroup === 'controls'}
					onClick={() => setOpenGroup(openGroup === 'controls' ? null : 'controls')}
				>
					<Split size={17} />
				</ToolButton>
				{openGroup === 'controls' && (
					<GroupPopover editor={editor} entries={CONTROL_TOOLS} onPick={createKind} />
				)}
			</div>

			<div className="side-group">
				<ToolButton
					label="Mostly used"
					active={openGroup === 'mostly'}
					onClick={() => setOpenGroup(openGroup === 'mostly' ? null : 'mostly')}
				>
					<MousePointerClick size={17} />
				</ToolButton>
				{openGroup === 'mostly' && (
					<GroupPopover editor={editor} entries={MOSTLY_USED_TOOLS} onPick={createKind} />
				)}
			</div>

			<div className="side-divider" />

			<ToolButton
				label="Module"
				shortcut="⌥M"
				onClick={() => createModuleFrame(editor, editor.getViewportPageBounds().center)}
			>
				<Layers size={17} />
			</ToolButton>

			<ToolButton
				label="Beautify"
				shortcut="⌥B"
				onClick={() => {
					const moved = beautifyCanvas(editor)
					if (moved > 0) {
						window.setTimeout(() => {
							editor.zoomToFit({ animation: { duration: 320 } })
						}, 380)
					}
					kaneToast(moved > 0 ? `Aligned ${moved} cards` : 'No loose cards to align', moved > 0 ? 'success' : 'info')
				}}
			>
				<AlignHorizontalDistributeCenter size={17} />
			</ToolButton>
		</div>
	)
}

export function KaneToolbar() {
	const { editor } = useKaneApp()
	if (!editor) return null
	return <KaneToolbarInner editor={editor} />
}
