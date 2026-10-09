import NumberFlow from '@number-flow/react'
import { useEffect, useMemo, useState } from 'react'
import { useValue } from 'tldraw'
import {
	Context,
	ContextContent,
	ContextContentBody,
	ContextContentFooter,
	ContextContentHeader,
	ContextTrigger,
} from '@/components/ai-elements/context'
import { useKaneApp } from './KaneAppContext'

/**
 * Session credits, in the right bar above the exit button.
 *
 * This is AI Elements' Context component: its trigger is the completion
 * spinner — a ring that fills as the allowance is consumed — and hovering it
 * opens the breakdown. Context is built for a model's token window, and the
 * shape is the same one credits have (a total, an amount used, a percentage),
 * so `maxTokens`/`usedTokens` carry the allowance and the spend. The trigger's
 * percentage label is hidden by CSS: the right bar is 52px wide and every other
 * control there is icon-only.
 */

/** The plan's monthly allowance, and what other sessions have already used. */
const CREDIT_ALLOWANCE = 5000
const CREDITS_USED_BEFORE = 1180

/** Infra is billed by the minute the session holds a device; steps by the step. */
const CREDITS_PER_INFRA_MINUTE = 6
const CREDITS_PER_STEP = 2

/** mm:ss — infra time reads as a duration, not a decimal. */
function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function Credits() {
	const { editor } = useKaneApp()

	// Infra time is how long this session has held the device — measured from
	// when the app mounted, ticking while it's open.
	const [startedAt] = useState(() => Date.now())
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const t = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(t)
	}, [])
	const infraSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))

	// Steps are the cards on the canvas — what a run would actually execute.
	const steps = useValue(
		'billable steps',
		() =>
			editor
				? editor.getCurrentPageShapes().filter((s) => editor.isShapeOfType(s, 'node')).length
				: 0,
		[editor]
	)

	const { used, infraCredits, stepCredits, thisSession } = useMemo(() => {
		const infra = Math.ceil(infraSeconds / 60) * CREDITS_PER_INFRA_MINUTE
		const step = steps * CREDITS_PER_STEP
		return {
			infraCredits: infra,
			stepCredits: step,
			thisSession: infra + step,
			used: CREDITS_USED_BEFORE + infra + step,
		}
	}, [infraSeconds, steps])

	const remaining = Math.max(0, CREDIT_ALLOWANCE - used)

	return (
		<div className="kane-ui rb-credits">
			<Context maxTokens={CREDIT_ALLOWANCE} usedTokens={used}>
				<ContextTrigger
					aria-label={`Credits — ${used} of ${CREDIT_ALLOWANCE} used`}
					className="credits-trigger"
					iconLabel="Credits used"
					title="Credits"
				/>
				<ContextContent className="kane-ui credits-card" align="end" side="left">
					<ContextContentHeader />
					<ContextContentBody>
						<div className="credits-rows">
							<div className="credits-row">
								<span>Infra.</span>
								<span className="credits-figure">
									<span className="credits-metric">{formatDuration(infraSeconds)}</span>
									<span className="credits-amount">
										<NumberFlow value={infraCredits} respectMotionPreference />
									</span>
								</span>
							</div>
							<div className="credits-row">
								<span>Steps</span>
								<span className="credits-figure">
									<span className="credits-metric">
										<NumberFlow value={steps} respectMotionPreference /> step
										{steps === 1 ? '' : 's'}
									</span>
									<span className="credits-amount">
										<NumberFlow value={stepCredits} respectMotionPreference />
									</span>
								</span>
							</div>
							<div className="credits-row credits-row_strong">
								<span>Used this session</span>
								<span>
									<NumberFlow value={thisSession} respectMotionPreference />
								</span>
							</div>
							<div className="credits-row">
								<span>Remaining</span>
								<span>
									<NumberFlow value={remaining} respectMotionPreference />
								</span>
							</div>
						</div>
					</ContextContentBody>
					<ContextContentFooter>
						<span className="credits-plan">Team plan</span>
						<span>Renews 1 Sep</span>
					</ContextContentFooter>
				</ContextContent>
			</Context>
		</div>
	)
}
