import { Rocket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TLShapeId, useEditor, useQuickReactor, useValue } from 'tldraw'
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { AttachMenu } from '../agent/AttachMenu'
import { cardTitle, refineCard } from '../agent/refine'
import { useKaneApp } from '../kane/KaneAppContext'
import { cardAiState } from '../kane/uiState'
import { NodeShape } from './NodeShapeUtil'

/**
 * The AI composer for one card.
 *
 * Opened by the ✨ in a card's header, it sits beside that card rather than
 * inside it: it is the same composer as the omnibox — the same `+` menu, the
 * same rocket — and shrinking with the camera would have made it unreadable at
 * the zoom people actually work at. So it is drawn on the canvas overlay in
 * viewport pixels and follows the card it belongs to.
 */

/** The popover's own box, and the gap it keeps from the card. */
const POPOVER_W = 320
const GAP_PX = 14
/** Rough height, used only to keep the popover inside the viewport. */
const POPOVER_H = 150

export function CardAiPopover() {
	const editor = useEditor()
	const shapeId = useValue('card ai target', () => cardAiState.get(editor), [editor])
	if (!shapeId) return null
	return <Composer key={shapeId} shapeId={shapeId} />
}

function Composer({ shapeId }: { shapeId: TLShapeId }) {
	const editor = useEditor()
	const { pushToast } = useKaneApp()
	const ref = useRef<HTMLDivElement>(null)
	const [busy, setBusy] = useState(false)
	const [text, setText] = useState('')

	const close = () => cardAiState.set(editor, null)

	// The card can move, the camera can move, and the card can be deleted while
	// this is open — all three are the same question, asked every frame.
	useQuickReactor(
		'card ai position',
		() => {
			const el = ref.current
			if (!el) return
			const bounds = editor.getShapePageBounds(shapeId)
			if (!bounds) {
				cardAiState.set(editor, null)
				return
			}
			// to the right of the card, or to its left when there is no room
			const right = editor.pageToViewport({ x: bounds.maxX, y: bounds.y })
			const left = editor.pageToViewport({ x: bounds.x, y: bounds.y })
			const fitsRight = right.x + GAP_PX + POPOVER_W <= window.innerWidth - 8
			const x = fitsRight ? right.x + GAP_PX : left.x - GAP_PX - POPOVER_W
			const y = Math.max(8, Math.min(right.y, window.innerHeight - POPOVER_H - 8))
			el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
		},
		[editor, shapeId]
	)

	// Escape closes it, wherever the focus is — unless the + menu is open, in
	// which case that Escape was for the menu and closing the composer under it
	// would take the whole thing away when the user only meant to back out of a
	// submenu.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			if (document.querySelector('[data-slot="dropdown-menu-content"]')) return
			close()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shapeId])

	// A click anywhere else puts it away — including on the canvas, which is how
	// every other popover in the app behaves.
	useEffect(() => {
		const onDown = (e: PointerEvent) => {
			const target = e.target as Element | null
			if (ref.current?.contains(target as Node)) return
			// the header button that opened it, and anything the menu portals to body
			if (target?.closest('.CardAction_ai, [data-radix-popper-content-wrapper], [data-slot="dropdown-menu-content"]')) return
			close()
		}
		// `capture` so it lands before tldraw swallows the canvas pointer event
		window.addEventListener('pointerdown', onDown, true)
		return () => window.removeEventListener('pointerdown', onDown, true)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shapeId])

	const send = async (message: PromptInputMessage) => {
		const prompt = (message.text ?? text).trim()
		const shape = editor.getShape(shapeId)
		if (!prompt || busy || !shape) return
		setBusy(true)
		editor.markHistoryStoppingPoint('refine card')
		const { changes } = await refineCard(editor, shape as NodeShape, prompt)
		setBusy(false)
		if (changes.length === 0) {
			pushToast(
				`Nothing in that to apply to the ${cardTitle(editor, shape as NodeShape).toLowerCase()} — try naming a field, a count or a duration`,
				'info'
			)
			return
		}
		pushToast(changes.join(' · '), 'success')
		setText('')
		close()
	}

	return (
		<div
			ref={ref}
			className="CardAiPopover kane-ui"
			style={{ width: POPOVER_W }}
			role="dialog"
			aria-label="Ask AI to change this card"
			onPointerDown={(e) => e.stopPropagation()}
			onWheel={(e) => e.stopPropagation()}
		>
			<PromptInput className="card-ai" onSubmit={send} maxFiles={4}>
				<PromptInputBody>
					<PromptInputTextarea
						className="card-ai-textarea"
						autoFocus
						rows={2}
						placeholder="Describe your next steps.."
						value={text}
						onChange={(e) => setText(e.currentTarget.value)}
					/>
				</PromptInputBody>
				<PromptInputFooter className="card-ai-footer">
					<PromptInputTools>
						<AttachMenu
							onLink={(_kind, label) => pushToast(`Linked “${label}” to this step`, 'success')}
						/>
					</PromptInputTools>
					<PromptInputSubmit
						status={busy ? 'streaming' : 'ready'}
						disabled={busy || text.trim().length === 0}
					>
						<Rocket size={16} />
					</PromptInputSubmit>
				</PromptInputFooter>
			</PromptInput>
		</div>
	)
}
