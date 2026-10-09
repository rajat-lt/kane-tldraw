import { AlertTriangle, Code2, Download, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useValue } from 'tldraw'
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	ALL_FRAMEWORKS,
	canvasSignature,
	CodeFramework,
	CodeLanguage,
	FRAMEWORK_LABELS,
	FRAMEWORK_LOGOS,
	frameworksFor,
	LANGUAGE_LOGOS,
	LANGUAGES,
} from './codegen'
import { useKaneApp } from './KaneAppContext'

/**
 * Code panel — explains what generation does, picks a language and framework,
 * and writes the test out inline.
 *
 * Generation lives in KaneAppContext, not here, so the drawer can be closed
 * and the canvas or browser used while it finishes; the right bar's Code button
 * carries the progress in the meantime. Reopening after the canvas has changed
 * shows a stale banner, because the code on screen no longer describes the
 * workflow.
 */

/** Language ids shiki knows, for the block's highlighting. */
type Highlight = Parameters<typeof CodeBlock>[0]['language']

/**
 * A brand mark, with the target's name as its alt text so the row still reads
 * correctly if the CDN is unreachable.
 */
function Logo({ src, alt }: { src: string; alt: string }) {
	return <img className="code-logo" src={src} alt="" aria-hidden width={15} height={15} title={alt} />
}

/** Save the generated file, named as the framework would expect it. */
function downloadCode(code: string, filename: string) {
	const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	// give the download a tick to start before the blob goes away
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TargetPickers() {
	const { codegen, setCodeTarget } = useKaneApp()
	const busy = codegen.status === 'generating'

	// Framework leads: it's the bigger decision, and it narrows which languages
	// are worth offering.
	const languages = LANGUAGES.filter((l) => l.frameworks.includes(codegen.framework))

	return (
		<div className="code-targets">
			<label className="code-field">
				<span className="code-field-label">Framework</span>
				<Select
					value={codegen.framework}
					disabled={busy}
					onValueChange={(next) => {
						const framework = next as CodeFramework
						// keep the language if the new framework supports it
						const options = LANGUAGES.filter((l) => l.frameworks.includes(framework))
						const language = options.some((l) => l.value === codegen.language)
							? codegen.language
							: options[0].value
						setCodeTarget(language, framework)
					}}
				>
					{/* SelectValue mirrors the chosen item's children, logo included —
					    adding another here would show the mark twice. */}
					<SelectTrigger className="code-select" size="sm" aria-label="Framework">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="kane-ui">
						{ALL_FRAMEWORKS.map((f) => (
							<SelectItem key={f} value={f}>
								<Logo src={FRAMEWORK_LOGOS[f]} alt={FRAMEWORK_LABELS[f]} />
								{FRAMEWORK_LABELS[f]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</label>

			<label className="code-field">
				<span className="code-field-label">Language</span>
				<Select
					value={codegen.language}
					disabled={busy}
					onValueChange={(next) => {
						const language = next as CodeLanguage
						const options = frameworksFor(language)
						const framework = options.includes(codegen.framework) ? codegen.framework : options[0]
						setCodeTarget(language, framework)
					}}
				>
					<SelectTrigger className="code-select" size="sm" aria-label="Language">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="kane-ui">
						{languages.map((l) => (
							<SelectItem key={l.value} value={l.value}>
								<Logo src={LANGUAGE_LOGOS[l.value]} alt={l.label} />
								{l.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</label>
		</div>
	)
}

export function CodePanel() {
	const { editor, codegen, startCodegen, cancelCodegen } = useKaneApp()

	// The canvas as it stands now, against the fingerprint the code was built
	// from. Reactive, so editing a card while the panel is open flips the banner
	// straight away rather than waiting for a reopen.
	const currentSignature = useValue(
		'canvas signature',
		() => (editor ? canvasSignature(editor) : ''),
		[editor]
	)
	const stale =
		codegen.status === 'ready' &&
		codegen.signature !== null &&
		codegen.signature !== currentSignature

	const busy = codegen.status === 'generating'

	return (
		<div className="drawer-body kane-ui code-panel">
			<TargetPickers />

			<div className="code-actions">
				{busy ? (
					<button className="btn btn-secondary code-generate" onClick={cancelCodegen}>
						Stop
					</button>
				) : (
					<button className="btn btn-primary code-generate" onClick={startCodegen} disabled={!editor}>
						<Sparkles size={14} />
						{codegen.status === 'ready' ? 'Regenerate' : 'Generate code'}
					</button>
				)}
				{busy && (
					<span className="code-progress">
						<Shimmer as="span">{`Writing ${codegen.filename}…`}</Shimmer>
					</span>
				)}
			</div>

			{stale && (
				<div className="code-stale" role="status">
					<AlertTriangle size={14} />
					<div>
						<strong>This code is out of date.</strong>
						<span>The canvas changed after it was generated.</span>
					</div>
					<button className="code-stale-action" onClick={startCodegen}>
						<RefreshCw size={12} />
						Regenerate
					</button>
				</div>
			)}

			{codegen.code ? (
				<div className={`code-output ${busy ? 'is-writing' : ''} ${stale ? 'is-stale' : ''}`}>
					<div className="code-output-head">
						<span className="code-filename">{codegen.filename}</span>
						{!busy && (
							<div className="code-output-actions">
								<button
									className="code-download"
									title={`Download ${codegen.filename}`}
									aria-label={`Download ${codegen.filename}`}
									onClick={() => downloadCode(codegen.code, codegen.filename)}
								>
									<Download size={14} />
								</button>
								<CodeBlockCopyButton className="code-copy" />
							</div>
						)}
					</div>
					<CodeBlock
						code={codegen.code}
						language={codegen.highlight as Highlight}
						showLineNumbers
						className="code-block"
					/>
				</div>
			) : (
				!busy && (
					<div className="ctx-empty code-empty">
						<Code2 size={18} />
						<p>No code yet. Generate it from the current canvas.</p>
					</div>
				)
			)}
		</div>
	)
}

/**
 * The right bar's Code button while generation runs with the drawer closed: a
 * ring that fills with progress, so the work is visible from anywhere in the
 * app.
 */
export function CodegenIndicator({ progress }: { progress: number }) {
	// a touch of easing so the ring doesn't step between chunk boundaries
	const [shown, setShown] = useState(progress)
	useEffect(() => {
		const id = requestAnimationFrame(() => setShown(progress))
		return () => cancelAnimationFrame(id)
	}, [progress])
	const r = 9
	const c = 2 * Math.PI * r
	return (
		<svg className="codegen-ring" viewBox="0 0 24 24" width="26" height="26" aria-hidden>
			<circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
			<circle
				cx="12"
				cy="12"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray={`${c} ${c}`}
				strokeDashoffset={c * (1 - shown)}
				style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset .2s linear' }}
			/>
		</svg>
	)
}
