import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastTone, useKaneApp } from './KaneAppContext'

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

export function Toasts() {
	const { toasts, dismissToast } = useKaneApp()
	return (
		<div className="toast-wrap">
			{toasts.map((t) => {
				const tone = TONES[t.tone] ?? TONES.info
				const Icon = tone.icon
				return (
					<div className={`toast toast_${t.tone}`} key={t.id} role={tone.role}>
						<span className="t-icon">
							<Icon size={16} />
						</span>
						<span>{t.msg}</span>
						<button
							className="icon-btn"
							style={{ color: '#fff' }}
							onClick={() => dismissToast(t.id)}
							aria-label="Dismiss"
						>
							<X size={14} />
						</button>
					</div>
				)
			})}
		</div>
	)
}
