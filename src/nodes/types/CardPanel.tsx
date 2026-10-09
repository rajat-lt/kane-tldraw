import classNames from 'classnames'
import { PointerEvent, useCallback } from 'react'
import { useEditor } from 'tldraw'
import { CARD_TAB_HEIGHTS, CARD_TAB_STRIP_PX } from '../../constants'
import { NodeShape } from '../NodeShapeUtil'
import {
	CardBaseFields,
	CardPanelTab,
	DEFAULT_TIMEOUT_MS,
	FAILURE_LABELS,
	FAILURE_MODES,
	FailureMode,
} from './cardBase'
import { CardShotFrame } from './lastShot'
import { updateNode } from './shared'

/**
 * The panel under a card's body: an underlined tab strip and its contents.
 *
 * Settings is always there — it is how a step's failure behaviour and timeout
 * are set, whether or not it has ever run. Screenshot and Thought only appear
 * once there is a run to show, and a finished run opens the panel on Screenshot
 * because that is the thing you look at first.
 *
 * The panel is part of the card's geometry, not an overlay: its height is added
 * to the shape's height (see `cardPanelHeightPx`), so wires below the card move
 * out of the way rather than being covered.
 */

/** How much taller a card is because of its panel. 0 when the panel is shut. */
export function cardPanelHeightPx(node: CardBaseFields): number {
	if (!node.panel) return 0
	return CARD_TAB_STRIP_PX + CARD_TAB_HEIGHTS[node.panel]
}

/** Which tabs this card can show right now. */
export function cardPanelTabs(node: CardBaseFields): CardPanelTab[] {
	return node.run ? ['screenshot', 'thought', 'settings'] : ['settings']
}

const TAB_LABELS: Record<NonNullable<CardPanelTab>, string> = {
	screenshot: 'Screenshot',
	thought: 'Thought',
	settings: 'Settings',
}

/** Seconds, the way a "thought for" line reads. */
function formatThinkingTime(ms: number) {
	if (ms < 1000) return `${ms}ms`
	const seconds = ms / 1000
	return `${seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : Math.round(seconds)}s`
}

export function CardPanel({ shape, node }: { shape: NodeShape; node: CardBaseFields }) {
	const editor = useEditor()
	const stop = useCallback((event: PointerEvent) => event.stopPropagation(), [])
	if (!node.panel) return null

	const tabs = cardPanelTabs(node)
	// a run can be cleared out from under an open Screenshot tab
	const active = tabs.includes(node.panel) ? node.panel : tabs[0]

	const set = (update: Partial<CardBaseFields>) =>
		updateNode(editor, shape, (n) => ({ ...(n as object), ...update }) as never, false)

	return (
		// The height is set from the same number the shape's geometry uses, so the
		// panel drawn and the panel the wires route around are one box.
		<div
			className="CardPanel"
			style={{ height: cardPanelHeightPx(node) }}
			onPointerDown={stop}
		>
			<div className="CardPanel-tabs" role="tablist">
				{tabs.map((tab) => (
					<button
						key={tab}
						role="tab"
						aria-selected={tab === active}
						className={classNames('CardPanel-tab', {
							'CardPanel-tab_active': tab === active,
						})}
						onClick={() => set({ panel: tab })}
					>
						{TAB_LABELS[tab!]}
					</button>
				))}
			</div>
			<div className="CardPanel-body">
				{active === 'screenshot' && node.run && (
					<CardShotFrame view={node.run.view} target={node.run.target} />
				)}
				{active === 'thought' && node.run && (
					<div className="CardPanel-thought">
						<p className="CardPanel-thought-time">
							Thought for {formatThinkingTime(node.run.ms)}.
						</p>
						<p className="CardPanel-thought-text">{node.run.thought}</p>
					</div>
				)}
				{active === 'settings' && (
					<div className="CardPanel-settings">
						<label className="CardPanel-setting">
							<span>Failure</span>
							<select
								value={node.failure ?? 'fail'}
								onChange={(e) => set({ failure: e.currentTarget.value as FailureMode })}
								onPointerDown={(e) => e.stopPropagation()}
							>
								{FAILURE_MODES.map((mode) => (
									<option key={mode} value={mode}>
										{FAILURE_LABELS[mode]}
									</option>
								))}
							</select>
						</label>
						<label className="CardPanel-setting">
							<span>Timeout</span>
							<span className="CardPanel-timeout">
								<input
									type="text"
									inputMode="numeric"
									value={String(node.timeoutMs ?? DEFAULT_TIMEOUT_MS)}
									onChange={(e) => {
										const parsed = Number(e.currentTarget.value.trim())
										if (Number.isNaN(parsed)) return
										set({ timeoutMs: Math.max(0, Math.round(parsed)) })
									}}
									onPointerDown={stop}
									onFocus={() => editor.setSelectedShapes([shape.id])}
								/>
								<em>ms</em>
							</span>
						</label>
					</div>
				)}
			</div>
		</div>
	)
}
