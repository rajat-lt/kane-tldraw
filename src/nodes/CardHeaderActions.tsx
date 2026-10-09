import classNames from 'classnames'
import { Ampersands, CirclePlay, CircleStop, PencilSparkles, Sparkles } from 'lucide-react'
import { useEditor, useValue } from 'tldraw'
import { executionState, startExecution, stopExecution } from '../execution/executionState'
import { setRunCursorTo } from '../kane/RunCursor'
import { cardAiState } from '../kane/uiState'
import { NodeShape } from './NodeShapeUtil'
import { conditionModeOf, toggleConditionMode } from './types/shared'

/** The card types whose condition can be written either way. */
const CONDITION_CARDS = new Set(['ifelse', 'while'])

/**
 * Run and Ask-AI, in the card's own header.
 *
 * Both used to live on the contextual toolbar, which meant they only existed
 * while the card was selected and always appeared above it rather than on it.
 * On the card they read as things the card does, and the toolbar is left for
 * things done *to* the card — duplicate, delete, settings.
 */
export function CardHeaderActions({ shape }: { shape: NodeShape }) {
	const editor = useEditor()
	const isRunning = useValue(
		'run in progress',
		() => executionState.get(editor).runningGraph !== null,
		[editor]
	)
	const asking = useValue(
		'ai composer open',
		() => cardAiState.get(editor) === shape.id,
		[editor, shape.id]
	)

	// If/Else and While can have their condition written either in words or as
	// operand · operator · operand. Which one it is now is a property of the card
	// you are looking at, so the switch sits on the card.
	const node = shape.props.node as { type: string; mode?: 'nl' | 'structured' }
	const hasCondition = CONDITION_CARDS.has(node.type)
	const structured = conditionModeOf(node) === 'structured'

	return (
		<div className="CardActions" onPointerDown={(e) => e.stopPropagation()}>
			<button
				className="CardAction"
				title={isRunning ? 'Stop the run' : 'Run from this step'}
				aria-label={isRunning ? 'Stop the run' : 'Run from this step'}
				onClick={() => {
					if (isRunning) {
						stopExecution(editor)
						return
					}
					// The Run label marks where a run starts, so starting one here
					// moves it here — otherwise the label would sit on one card
					// while the run began at another, which is a lie about what
					// pressing Run steps would do next.
					setRunCursorTo(editor, shape.id)
					startExecution(editor, new Set([shape.id]))
				}}
			>
				{isRunning ? <CircleStop size={17} /> : <CirclePlay size={17} />}
			</button>
			{hasCondition && (
				<button
					className="CardAction"
					title={
						structured
							? 'Write this condition in plain English'
							: 'Build this condition from operand · operator · operand'
					}
					aria-label={
						structured ? 'Switch to plain English' : 'Switch to operand and operator'
					}
					aria-pressed={structured}
					onClick={() => toggleConditionMode(editor, shape)}
				>
					{structured ? <PencilSparkles size={16} /> : <Ampersands size={16} />}
				</button>
			)}
			<button
				className={classNames('CardAction', 'CardAction_ai', { 'CardAction_on': asking })}
				title="Ask AI to rework this step"
				aria-label="Ask AI to rework this step"
				aria-expanded={asking}
				onClick={() => cardAiState.set(editor, asking ? null : shape.id)}
			>
				<Sparkles size={16} />
			</button>
		</div>
	)
}
