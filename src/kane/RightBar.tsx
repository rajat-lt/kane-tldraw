import { RIGHTBAR_BOTTOM, RIGHTBAR_TOP } from './catalog'
import { CodegenIndicator } from './CodePanel'
import { Credits } from './Credits'
import { useKaneApp } from './KaneAppContext'
import { useTipOpen } from './Tooltip'

/**
 * Right bar (52px) — carried over from the previous Kane build: two icon
 * groups, left-anchored tooltips, active state, opens slide-in drawers.
 */

function RBButton({ item }: { item: (typeof RIGHTBAR_TOP)[number] }) {
	const { drawerId, openDrawer, pushToast, codegen } = useKaneApp()
	// the same wait, and the same instant neighbours, as every other tip
	const tip = useTipOpen()
	const Icon = item.icon
	const active = drawerId === item.id
	// Generation keeps running with the drawer closed, so the button reports it:
	// the icon is replaced by a progress ring until the file is written.
	const generating = item.id === 'code' && codegen.status === 'generating'
	const showRing = generating && drawerId !== 'code'
	return (
		<div className="rb-btn-wrap" {...tip.triggerProps}>
			<button
				className={`icon-btn ${active ? 'is-active' : ''} ${generating ? 'is-busy' : ''}`}
				aria-label={
					generating
						? `${item.label}: generating, ${Math.round(codegen.progress * 100)}%`
						: item.label
				}
				onClick={() => {
					// The exit button never opens a side panel.
					if (item.id === 'off') {
						pushToast('Session turned off (prototype)', 'info')
						return
					}
					openDrawer(item.id)
				}}
			>
				{showRing ? <CodegenIndicator progress={codegen.progress} /> : <Icon size={19} />}
			</button>
			{tip.open && (
				<span className="tooltip left" data-instant={tip.instant || undefined}>
					{generating ? `Generating code… ${Math.round(codegen.progress * 100)}%` : item.label}
				</span>
			)}
		</div>
	)
}

export function RightBar() {
	return (
		<nav className="rightbar" aria-label="Tools">
			<div className="group">
				{RIGHTBAR_TOP.map((item) => (
					<RBButton key={item.id} item={item} />
				))}
			</div>
			<div className="rb-spacer" />
			<div className="group">
				{RIGHTBAR_BOTTOM.filter((item) => item.id !== 'off').map((item) => (
					<RBButton key={item.id} item={item} />
				))}
				{/* credits sit directly above the exit button */}
				<Credits />
				{RIGHTBAR_BOTTOM.filter((item) => item.id === 'off').map((item) => (
					<RBButton key={item.id} item={item} />
				))}
			</div>
		</nav>
	)
}
