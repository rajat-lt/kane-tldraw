import { Editor, TLShapeId } from 'tldraw'
import { NodeShape } from '../nodes/NodeShapeUtil'
import { EditorAtom } from '../utils'
import { ExecutionGraph } from './ExecutionGraph'
import { runPaused } from './runControl'
import { kaneRuntime } from './runtime'

export interface ExecutionState {
	runningGraph: ExecutionGraph | null
}

export const executionState = new EditorAtom<ExecutionState>('execution state', () => ({
	runningGraph: null,
}))

const ENTITY_KINDS = new Set(['parameter', 'secret', 'totp', 'variable'])

export async function startExecution(editor: Editor, startingNodeIds: Set<TLShapeId>) {
	// A run always begins running. Anything left over from a run that was
	// stopped while paused would otherwise hold this one at its first step.
	runPaused.set(false)
	// Fresh run context: pre-register every data card on the page so `{{name}}`
	// references resolve even for cards outside the executed region.
	kaneRuntime.reset()
	for (const shape of editor.getCurrentPageShapes()) {
		if (!editor.isShapeOfType<NodeShape>(shape, 'node')) continue
		const node = shape.props.node as { type: string; name?: string; value?: string }
		if (ENTITY_KINDS.has(node.type) && node.name) {
			kaneRuntime.setValue(node.name, node.value ?? '')
		}
	}

	const graph = new ExecutionGraph(editor, startingNodeIds)
	executionState.update(editor, (state) => {
		state.runningGraph?.stop()
		return {
			...state,
			runningGraph: graph,
		}
	})
	try {
		await graph.execute()
	} finally {
		runPaused.set(false)
		executionState.update(editor, (state) => {
			if (state.runningGraph !== graph) return state
			return { ...state, runningGraph: null }
		})
	}
}

export function stopExecution(editor: Editor) {
	// Clearing the pause first releases anything waiting on it; each of those
	// then finds the graph stopped and gives up, rather than hanging forever.
	runPaused.set(false)
	executionState.update(editor, (state) => {
		if (!state.runningGraph) return state
		state.runningGraph.stop()
		return { ...state, runningGraph: null }
	})
}

/** Hold the run where it is. Only means anything while something is running. */
export function pauseExecution(editor: Editor) {
	if (executionState.get(editor).runningGraph) runPaused.set(true)
}

/** Let a held run carry on. */
export function resumeExecution(_editor: Editor) {
	runPaused.set(false)
}
