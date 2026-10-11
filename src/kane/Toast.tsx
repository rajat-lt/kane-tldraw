import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { EASE_OUT } from '../lib/motion'
import { ToastTone, useKaneApp } from './KaneAppContext'
import { RunTray } from './RunTray'

/**
 * Toasts. The tone decides the icon, the accent and the ARIA role — a saved
 * objective is announced politely as a status, only a genuine failure is an
 * assertive alert.
 */
const TONES: Record<ToastTone, { icon: typeof Info; role: 'status' | 'alert' }> = {
	success: { icon: CheckCircle2, role: 'status' },
	info: { icon: Info, role: 'status' },
	error: { icon: AlertTriangle, role: 'alert' },
}

/** The curve of CSS's own `ease` keyword. */
const CSS_EASE = [0.25, 0.1, 0.25, 1] as const

/**
 * A toast comes in from the right edge and leaves the way it came. The entrance
 * takes Sonner's 400ms on `ease`, a touch slower than the rest of the UI; the
 * exit is quicker. Motion rather than a CSS keyframe, so a toast dismissed
 * while it is still arriving turns around from where it is. Reduced motion
 * keeps the fade and drops the travel.
 */
const TOAST_AWAY = {
	opacity: 0,
	transform: 'translateX(12px)',
	transition: { duration: 0.2, ease: EASE_OUT },
}
const TOAST_HERE = {
	opacity: 1,
	transform: 'translateX(0px)',
	transition: { duration: 0.4, ease: CSS_EASE },
	transitionEnd: { transform: 'none' },
}
const TOAST_FADED = { opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }
const TOAST_SHOWN = { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }

export function Toasts() {
	const { toasts, dismissToast } = useKaneApp()
	const reduceMotion = useReducedMotion()
	return (
		<div className="toast-wrap">
			<AnimatePresence initial={false}>
				{toasts.map((t) => {
					const tone = TONES[t.tone] ?? TONES.info
					const Icon = tone.icon
					return (
						<motion.div
							className={`toast toast_${t.tone}`}
							key={t.id}
							role={tone.role}
							initial={reduceMotion ? TOAST_FADED : TOAST_AWAY}
							animate={reduceMotion ? TOAST_SHOWN : TOAST_HERE}
							exit={reduceMotion ? TOAST_FADED : TOAST_AWAY}
						>
							{/* a finished run shows its steps landing instead of an icon */}
							{t.run ? (
								<RunTray steps={t.run.steps} />
							) : (
								<span className="t-icon">
									<Icon size={16} />
								</span>
							)}
							<span>{t.msg}</span>
							<button
								className="icon-btn toast-dismiss"
								onClick={() => dismissToast(t.id)}
								aria-label="Dismiss"
							>
								<X size={14} />
							</button>
						</motion.div>
					)
				})}
			</AnimatePresence>
		</div>
	)
}
