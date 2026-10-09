import { PointerEvent, useLayoutEffect, useMemo, useRef } from 'react'
import { useEditor } from 'tldraw'
import { NodeShape } from '../NodeShapeUtil'

/**
 * A small code editor for a card: line-number gutter, syntax colouring, and a
 * real textarea you can type or paste into.
 *
 * The classic overlay: a highlighted <pre> sits behind a transparent textarea
 * whose metrics match it exactly, so the caret, the selection and the native
 * clipboard all still belong to the browser while the colours come from us.
 * Anything else (contenteditable, a third-party editor) would cost more than
 * this card is worth.
 *
 * The colours are VS Code's Light+ so the block reads the way the same snippet
 * reads in an editor.
 */

/** One coloured run of source. */
interface Token {
	text: string
	kind:
		| 'plain'
		| 'comment'
		| 'string'
		| 'number'
		| 'keyword'
		| 'control'
		| 'literal'
		| 'fn'
		| 'property'
}

/** Declarations and operators — VS Code paints these blue. */
const KEYWORDS = new Set([
	'const', 'let', 'var', 'function', 'class', 'extends', 'new', 'this', 'super',
	'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'async', 'await',
	'static', 'get', 'set', 'import', 'export', 'default', 'from', 'as',
])
/** Control flow — VS Code paints these purple. */
const CONTROL = new Set([
	'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'switch',
	'case', 'throw', 'try', 'catch', 'finally', 'yield',
])
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[\w$]/

/**
 * A single left-to-right scan, so a keyword inside a string stays a string and
 * a quote inside a comment stays a comment. (Chaining regex replacements over
 * the whole text gets both of those wrong.)
 */
export function tokenizeJs(source: string): Token[] {
	const out: Token[] = []
	let plain = ''
	const flush = () => {
		if (plain) {
			out.push({ text: plain, kind: 'plain' })
			plain = ''
		}
	}
	const push = (text: string, kind: Token['kind']) => {
		flush()
		out.push({ text, kind })
	}

	let i = 0
	while (i < source.length) {
		const c = source[i]
		const next = source[i + 1]

		// comments
		if (c === '/' && next === '/') {
			const end = source.indexOf('\n', i)
			const stop = end === -1 ? source.length : end
			push(source.slice(i, stop), 'comment')
			i = stop
			continue
		}
		if (c === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2)
			const stop = end === -1 ? source.length : end + 2
			push(source.slice(i, stop), 'comment')
			i = stop
			continue
		}

		// strings and template literals
		if (c === '"' || c === "'" || c === '`') {
			let j = i + 1
			while (j < source.length) {
				if (source[j] === '\\') {
					j += 2
					continue
				}
				if (source[j] === c) {
					j++
					break
				}
				// an unterminated quote ends at the line, the way an editor shows it
				if (c !== '`' && source[j] === '\n') break
				j++
			}
			push(source.slice(i, j), 'string')
			i = j
			continue
		}

		// numbers
		if (/[0-9]/.test(c)) {
			let j = i
			while (j < source.length && /[\w.]/.test(source[j])) j++
			push(source.slice(i, j), 'number')
			i = j
			continue
		}

		// identifiers, keywords, calls and properties
		if (IDENT_START.test(c)) {
			let j = i
			while (j < source.length && IDENT_PART.test(source[j])) j++
			const word = source.slice(i, j)
			let after = j
			while (after < source.length && source[after] === ' ') after++
			const isCall = source[after] === '('
			const isProperty = i > 0 && source[i - 1] === '.'
			push(
				word,
				CONTROL.has(word)
					? 'control'
					: KEYWORDS.has(word)
						? 'keyword'
						: LITERALS.has(word)
							? 'literal'
							: isCall
								? 'fn'
								: isProperty
									? 'property'
									: 'plain'
			)
			i = j
			continue
		}

		plain += c
		i++
	}
	flush()
	return out
}

export function CodeEditor({
	shape,
	value,
	placeholder,
	onChange,
}: {
	shape: NodeShape
	value: string
	placeholder?: string
	onChange: (value: string) => void
}) {
	const editor = useEditor()
	const preRef = useRef<HTMLPreElement>(null)
	const gutterRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const tokens = useMemo(() => tokenizeJs(value), [value])
	const lineCount = useMemo(() => value.split('\n').length, [value])

	// The highlight layer and the gutter follow the textarea's own scrolling —
	// they have no scrollbars of their own, so this is what keeps the three
	// layers registered while the caret moves through a long snippet.
	const syncScroll = () => {
		const source = textareaRef.current
		if (!source) return
		if (preRef.current) {
			preRef.current.scrollTop = source.scrollTop
			preRef.current.scrollLeft = source.scrollLeft
		}
		if (gutterRef.current) gutterRef.current.scrollTop = source.scrollTop
	}
	useLayoutEffect(syncScroll, [value])

	const stop = (event: PointerEvent) => event.stopPropagation()

	return (
		<div className="NodeCode" onPointerDown={stop}>
			<div className="NodeCode-gutter" ref={gutterRef} aria-hidden>
				{Array.from({ length: lineCount }, (_, i) => (
					<span key={i}>{i + 1}</span>
				))}
			</div>
			<div className="NodeCode-scroll">
				<pre className="NodeCode-highlight" ref={preRef} aria-hidden>
					{tokens.map((token, i) => (
						<span className={`tok tok-${token.kind}`} key={i}>
							{token.text}
						</span>
					))}
					{/* a trailing newline would otherwise not be measured, and the last
					    line would sit half a row above the caret */}
					{'\n'}
				</pre>
				<textarea
					ref={textareaRef}
					className="NodeCode-input"
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					wrap="off"
					value={value}
					placeholder={placeholder}
					onScroll={syncScroll}
					onChange={(e) => onChange(e.currentTarget.value)}
					onFocus={() => editor.setSelectedShapes([shape.id])}
					onKeyDown={(e) => {
						// canvas shortcuts must not fire while someone is writing code
						e.stopPropagation()
						if (e.key !== 'Tab') return
						// Tab indents instead of leaving the card — the only thing more
						// annoying than no editor is one that loses focus mid-line
						e.preventDefault()
						const el = e.currentTarget
						const { selectionStart: from, selectionEnd: to } = el
						const next = `${value.slice(0, from)}\t${value.slice(to)}`
						onChange(next)
						window.requestAnimationFrame(() => {
							el.selectionStart = el.selectionEnd = from + 1
						})
					}}
				/>
			</div>
		</div>
	)
}
