/**
 * The KaneAI mark — the goggles.
 *
 * Drawn inline rather than loaded as a file: it is two dozen path commands, it
 * inherits `currentColor` so it sits correctly in either theme, and it costs no
 * request. If the original asset is dropped into `public/`, swap the body of
 * this component for an <img> and nothing else has to change.
 */
export function KaneLogo({ size = 28 }: { size?: number }) {
	return (
		<svg
			className="kane-logo-mark"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			role="img"
			aria-label="KaneAI"
		>
			{/* helmet arc over the top */}
			<path
				d="M4.1 10.9C4.1 6.4 7.6 2.8 11.95 2.8s7.85 3.6 7.85 8.1"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
			/>
			{/* the notch in the middle of the brow */}
			<path
				d="M9.5 3.05v1.5c0 .42.34.75.75.75h3.5a.75.75 0 0 0 .75-.75v-1.5"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			{/* strap ends */}
			<path
				d="M3.3 11.1 1.5 12.95l1.8 1.95M20.7 11.1l1.8 1.85-1.8 1.95"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* the goggle body: two lenses meeting in a V at the nose */}
			<path
				d="M3.15 12.5c0-1.55 1-2.5 2.65-2.7 1.95-.25 4.15-.4 6.2-.4s4.25.15 6.2.4c1.65.2 2.65 1.15 2.65 2.7 0 3.4-1.45 5.35-4.3 5.35-1.65 0-2.7-.6-3.6-1.35-.6-.5-1.65-.5-2.25 0-.9.75-1.95 1.35-3.6 1.35-2.85 0-4.3-1.95-4.3-5.35Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			{/* highlight inside the right lens */}
			<path
				d="M15.15 11.75c1.95 0 3.05.55 3.05 2.45"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			{/* jaw */}
			<path
				d="M6.5 18.75c1.6 1.6 3.35 2.45 5.45 2.45s3.85-.85 5.45-2.45"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
		</svg>
	)
}
