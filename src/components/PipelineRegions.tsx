import classNames from 'classnames'
import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import {
	Box,
	BoxModel,
	Editor,
	TLShapeId,
	useEditor,
	usePassThroughWheelEvents,
	useQuickReactor,
	useValue,
} from 'tldraw'
import { executionState } from '../execution/executionState'
import { getNodePortConnections } from '../nodes/nodePorts'
import { NodeShape } from '../nodes/NodeShapeUtil'

interface PipelineRegion {
	bounds: BoxModel
	nodes: Set<TLShapeId>
	startingNodes: Set<TLShapeId>
}

function findPipelineRegions(editor: Editor): PipelineRegion[] {
	const regionsByShape = new Map<TLShapeId, Set<TLShapeId>>()
	const visitedNodes = new Set<TLShapeId>()

	function visit(node: NodeShape, currentRegion?: Set<TLShapeId>) {
		if (visitedNodes.has(node.id)) return
		visitedNodes.add(node.id)

		if (!currentRegion) {
			currentRegion = new Set()
		}

		regionsByShape.set(node.id, currentRegion)
		currentRegion.add(node.id)

		for (const connection of getNodePortConnections(editor, node)) {
			visit(editor.getShape(connection.connectedShapeId) as NodeShape, currentRegion)
		}
	}

	for (const node of editor.getCurrentPageShapes()) {
		if (editor.isShapeOfType(node, 'node')) {
			visit(node)
		}
	}

	return Array.from(new Set(regionsByShape.values()), (nodeIds): PipelineRegion => {
		let bounds: Box | null = null
		const startingNodes = new Set<TLShapeId>()

		for (const nodeId of nodeIds) {
			const hasInputs = getNodePortConnections(editor, nodeId).some((c) => c.terminal === 'end')
			if (!hasInputs) {
				startingNodes.add(nodeId)
			}

			const nodeBounds = editor.getShapePageBounds(nodeId)
			if (!nodeBounds) continue

			if (bounds) {
				bounds.union(nodeBounds)
			} else {
				bounds = Box.From(nodeBounds)
			}
		}

		return {
			bounds: bounds!.expandBy(30),
			nodes: nodeIds,
			startingNodes,
		}
	}).filter((w) => w.nodes.size > 1)
}

/**
 * Stable identity for a region across re-computations, so AnimatePresence can
 * tell "the same workflow moved/grew" from "a new workflow appeared". An index
 * key would reshuffle whenever regions are re-derived.
 */
function regionKey(region: PipelineRegion): string {
	return [...region.nodes].sort().join('|')
}

export function PipelineRegions() {
	const editor = useEditor()
	const regions = useValue('regions', () => findPipelineRegions(editor), [editor])

	return (
		<AnimatePresence>
			{regions.map((region) => (
				<PipelineRegionComponent key={regionKey(region)} region={region} />
			))}
		</AnimatePresence>
	)
}

function PipelineRegionComponent({ region }: { region: PipelineRegion }) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)

	const isExecuting = useValue(
		'isExecuting',
		() => {
			const execution = executionState.get(editor).runningGraph
			if (!execution) return false

			for (const nodeId of region.nodes) {
				if (execution.getNodeStatus(nodeId) === 'executing') {
					return true
				}
			}

			return false
		},
		[editor, region]
	)

	useQuickReactor(
		'PipelineRegion positioning',
		() => {
			if (!ref.current) return
			const camera = editor.getCamera()

			if (camera.z < 0.25) {
				ref.current.style.display = 'none'
				return
			} else {
				ref.current.style.display = 'block'
			}

			const position = editor.pageToViewport(region.bounds)
			ref.current.style.transform = `translate(${position.x}px, ${position.y}px)`
			ref.current.style.width = `${region.bounds.w * camera.z}px`
			ref.current.style.height = `${region.bounds.h * camera.z}px`
		},
		[region, editor]
	)

	usePassThroughWheelEvents(ref)

	// Grab the handle to select the whole workflow and drag it around the
	// canvas. Runs start from the run cursor (or a card's context menu).
	function onHandleDown(e: React.PointerEvent) {
		editor.markEventAsHandled(e)
		e.stopPropagation()
		e.preventDefault()

		const pageId = editor.getCurrentPageId()
		const cardIds = [...region.nodes].filter((id) => {
			const shape = editor.getShape(id)
			return !!shape && shape.parentId === pageId
		})
		editor.setSelectedShapes(cardIds)

		const startPage = editor.screenToPage({ x: e.clientX, y: e.clientY })
		const originals = cardIds
			.map((id) => editor.getShape(id))
			.filter((s): s is NodeShape => !!s)
			.map((s) => ({ id: s.id, x: s.x, y: s.y }))
		let moved = false

		const onMove = (ev: PointerEvent) => {
			const current = editor.screenToPage({ x: ev.clientX, y: ev.clientY })
			const dx = current.x - startPage.x
			const dy = current.y - startPage.y
			if (!moved && Math.abs(dx) + Math.abs(dy) > 2) {
				moved = true
				editor.markHistoryStoppingPoint('move workflow')
			}
			if (!moved) return
			editor.updateShapes(
				originals.map((o) => ({ id: o.id, type: 'node' as const, x: o.x + dx, y: o.y + dy }))
			)
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	// Only `opacity` is animated here: the region's transform/width/height are
	// written imperatively every frame from the tldraw camera (above), so a
	// transform-based enter/exit — or Motion's `layout` — would fight them.
	return (
		<motion.div
			className={classNames('PipelineRegion', { PipelineRegion_executing: isExecuting })}
			ref={ref}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
		>
			<div
				className="PipelineRegion-handle"
				title="Select and move this workflow"
				onPointerDown={onHandleDown}
			>
				<span>Workflow</span>
			</div>
		</motion.div>
	)
}
