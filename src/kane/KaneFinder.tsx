import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TLShapeId, useEditor, useValue } from 'tldraw'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { getNodeDefinition } from '../nodes/nodeTypes'
import { finderState } from './uiState'

/**
 * ⌘F — find on canvas. Searches card titles, custom names and text fields;
 * jump between matches with next/prev (Enter / Shift+Enter), Esc to close.
 */

function searchableText(editor: ReturnType<typeof useEditor>, shape: NodeShape): string {
	const node = shape.props.node as Record<string, unknown> & { type: string }
	const definition = getNodeDefinition(editor, shape.props.node)
	const parts: string[] = [definition.title]
	if (typeof node.label === 'string') parts.push(node.label)
	for (const key of ['url', 'target', 'text', 'name', 'value', 'condition'] as const) {
		if (typeof node[key] === 'string') parts.push(node[key] as string)
	}
	if (Array.isArray(node.blocks)) {
		for (const block of node.blocks as { nl?: string; left?: string; right?: string }[]) {
			if (block.nl) parts.push(block.nl)
			if (block.left) parts.push(block.left)
			if (block.right) parts.push(block.right)
		}
	}
	return parts.join(' ').toLowerCase()
}

export function KaneFinder() {
	const editor = useEditor()
	const open = useValue('finder open', () => finderState.get(editor).open, [editor])
	const [query, setQuery] = useState('')
	const [index, setIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)

	const matches = useMemo<TLShapeId[]>(() => {
		if (!query.trim()) return []
		const q = query.trim().toLowerCase()
		return editor
			.getCurrentPageShapes()
			.filter((s): s is NodeShape => editor.isShapeOfType<NodeShape>(s, 'node'))
			.filter((s) => searchableText(editor, s).includes(q))
			.map((s) => s.id)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor, query, open])

	useEffect(() => {
		if (open) {
			window.setTimeout(() => inputRef.current?.focus(), 30)
		} else {
			setQuery('')
			setIndex(0)
		}
	}, [open])

	useEffect(() => {
		setIndex(0)
	}, [query])

	const jumpTo = (i: number) => {
		if (matches.length === 0) return
		const wrapped = ((i % matches.length) + matches.length) % matches.length
		setIndex(wrapped)
		const id = matches[wrapped]
		const bounds = editor.getShapePageBounds(id)
		if (!bounds) return
		editor.setSelectedShapes([id])
		editor.zoomToBounds(bounds.clone().expandBy(260), {
			animation: { duration: 220 },
			targetZoom: Math.max(0.7, editor.getZoomLevel()),
		})
	}

	// Jump to the first match as soon as one exists.
	useEffect(() => {
		if (open && matches.length > 0) jumpTo(index > matches.length - 1 ? 0 : index)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [matches.length === 0 ? '' : matches[0], open])

	if (!open) return null

	return (
		<div className="KaneFinder" onPointerDown={(e) => e.stopPropagation()}>
			<Search size={14} className="KaneFinder-icon" />
			<input
				ref={inputRef}
				value={query}
				placeholder="Find on canvas…"
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					e.stopPropagation()
					if (e.key === 'Enter' || e.key === 'Return') {
						jumpTo(e.shiftKey ? index - 1 : index + 1)
					}
					if (e.key === 'Escape') {
						finderState.update(editor, (s) => ({ ...s, open: false }))
					}
				}}
			/>
			<span className="KaneFinder-count">
				{matches.length > 0 ? `${index + 1}/${matches.length}` : query ? '0' : ''}
			</span>
			<button
				className="icon-btn"
				aria-label="Previous match"
				disabled={matches.length === 0}
				onClick={() => jumpTo(index - 1)}
			>
				<ChevronUp size={15} />
			</button>
			<button
				className="icon-btn"
				aria-label="Next match"
				disabled={matches.length === 0}
				onClick={() => jumpTo(index + 1)}
			>
				<ChevronDown size={15} />
			</button>
			<button
				className="icon-btn"
				aria-label="Close find"
				onClick={() => finderState.update(editor, (s) => ({ ...s, open: false }))}
			>
				<X size={14} />
			</button>
		</div>
	)
}
