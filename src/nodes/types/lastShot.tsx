import { T } from 'tldraw'

/**
 * Snapshot of the mock page state when a browser-action card last ran.
 *
 * The field itself is legacy: cards record their runs on `run` (see cardBase)
 * now, and the Screenshot tab draws from that. It stays in the validators so
 * documents saved before the change keep loading, and nothing writes it.
 *
 * Lives in its own module (no imports from shared/nodeTypes) so card validators
 * can use it at module-evaluation time without import cycles.
 */
export const LastShot = T.object({
	view: T.string,
	target: T.string,
})
	.nullable()
	.optional()
export type LastShot = T.TypeOf<typeof LastShot>

/**
 * The page as it looked when the card ran — a rendered wireframe rather than a
 * raster capture, because the page it describes is a deterministic mock.
 *
 * Drawn by the Screenshot tab of the card panel, which supplies its own header,
 * so this is the frame alone.
 */
export function CardShotFrame({ view, target }: { view: string; target?: string }) {
	return (
		<div className="CardShot-frame" data-view={view}>
			<div className="CardShot-bar">
				<span className="CardShot-dot" />
				<span className="CardShot-dot" />
				<span className="CardShot-dot" />
				<span className="CardShot-addr" />
			</div>
			<div className="CardShot-nav">
				<span className="CardShot-brand" />
				<span className="CardShot-menu" />
				<span className="CardShot-menu" />
			</div>
			{view === 'login' && (
				<div className="CardShot-page">
					<div className="CardShot-form">
						<span className="CardShot-line" />
						<span className="CardShot-line" />
						<span className="CardShot-btn" />
					</div>
				</div>
			)}
			{view === 'dashboard' && (
				<div className="CardShot-page">
					<span className="CardShot-search" />
					<div className="CardShot-stats">
						<span />
						<span />
						<span />
					</div>
					<div className="CardShot-tiles">
						<span />
						<span />
						<span />
						<span />
					</div>
				</div>
			)}
			{view === 'cart' && (
				<div className="CardShot-page">
					<div className="CardShot-rows">
						<span />
						<span />
						<span />
					</div>
					<span className="CardShot-btn CardShot-btn_wide" />
				</div>
			)}
			{view === 'landing' && (
				<div className="CardShot-page">
					<span className="CardShot-hero" />
					<span className="CardShot-line CardShot-line_center" />
					<span className="CardShot-btn CardShot-btn_center" />
				</div>
			)}
			{target && <span className="CardShot-target">◎ {target}</span>}
		</div>
	)
}
