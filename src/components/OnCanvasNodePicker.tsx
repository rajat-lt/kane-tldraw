import { Dialog, VisuallyHidden } from 'radix-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TLUiIconJsx,
	TldrawUiMenuContextProvider,
	TldrawUiMenuGroup,
	TLShapeId,
	useEditor,
	usePassThroughWheelEvents,
	useQuickReactor,
	useValue,
	Vec,
	VecModel,
} from 'tldraw'
import { getConnectionBindings } from '../connection/ConnectionBindingUtil'
import { getConnectionTerminals } from '../connection/ConnectionShapeUtil'
import { NODE_WIDTH_PX } from '../constants'
import { getPortDataType } from '../nodes/nodePorts'
import { getNodeDefinitions, getPortsForNodeType, NodeType } from '../nodes/nodeTypes'
import { arePortDataTypesCompatible } from '../ports/portCompatibility'
import { NodeDefinition } from '../nodes/types/shared'
import { EditorAtom } from '../utils'

export interface OnCanvasNodePickerState {
	connectionShapeId: TLShapeId
	location: 'start' | 'end' | 'middle'
	onPick: (nodeType: NodeType, position: VecModel) => void
	onClose: () => void
}

export const onCanvasNodePickerState = new EditorAtom<OnCanvasNodePickerState | null>(
	'on canvas node picker',
	() => null
)

/**
 * Whether a card of this type could actually be dropped where the picker was
 * opened.
 *
 * In the middle of a wire, the card has to accept the incoming connection *and*
 * carry it on to the card at the other end: a Variable card has only a value
 * output and no input at all, so choosing one used to create nothing and the
 * menu closed as if it had. At a loose end, only the incoming side matters.
 */
function canPlace(
	editor: ReturnType<typeof useEditor>,
	node: NodeType,
	state: OnCanvasNodePickerState | null
): boolean {
	if (!state) return true
	const connection = editor.getShape(state.connectionShapeId)
	if (!connection || !editor.isShapeOfType(connection, 'connection')) return true
	const bindings = getConnectionBindings(editor, connection)
	const ports = Object.values(getPortsForNodeType(editor, node))

	const sourceType = bindings.start
		? (getPortDataType(editor, bindings.start.toId, bindings.start.props.portId) ?? 'any')
		: 'any'
	const accepts = ports.some(
		(p) => p.terminal === 'end' && arePortDataTypesCompatible(p.dataType, sourceType)
	)
	if (state.location !== 'middle') return accepts

	const targetType = bindings.end
		? (getPortDataType(editor, bindings.end.toId, bindings.end.props.portId) ?? 'any')
		: 'any'
	const continues = ports.some(
		(p) => p.terminal === 'start' && arePortDataTypesCompatible(p.dataType, targetType)
	)
	return accepts && continues
}

export function OnCanvasNodePicker() {
	const editor = useEditor()
	const onClose = useCallback(() => {
		const state = onCanvasNodePickerState.get(editor)
		if (!state) return
		onCanvasNodePickerState.set(editor, null)
		state.onClose()
	}, [editor])
	const nodeDefs = getNodeDefinitions(editor)

	// Recomputed as the picker opens, because it depends on which wire it opened
	// on and what that wire connects.
	const state = useValue('picker state', () => onCanvasNodePickerState.get(editor), [editor])
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one list, many card types
	const groups: { id: string; definitions: NodeDefinition<any>[] }[] = [
		{ id: 'browser', definitions: [nodeDefs.open, nodeDefs.click, nodeDefs.input] },
		{ id: 'logic', definitions: [nodeDefs.ifelse, nodeDefs.while] },
		{
			id: 'data',
			definitions: [nodeDefs.parameter, nodeDefs.secret, nodeDefs.totp, nodeDefs.variable],
		},
	]

	return (
		<OnCanvasNodePickerDialog onClose={onClose}>
			{groups.map((group) => {
				const usable = group.definitions.filter((d) => canPlace(editor, d.getDefault(), state))
				if (usable.length === 0) return null
				return (
					<TldrawUiMenuGroup id={group.id} key={group.id}>
						{usable.map((definition) => (
							<OnCanvasNodePickerItem
								key={definition.type}
								definition={definition}
								onClose={onClose}
							/>
						))}
					</TldrawUiMenuGroup>
				)
			})}
		</OnCanvasNodePickerDialog>
	)
}

function OnCanvasNodePickerDialog({
	children,
	onClose,
}: {
	children: React.ReactNode
	onClose: () => void
}) {
	const editor = useEditor()
	const location = useValue('location', () => onCanvasNodePickerState.get(editor)?.location, [
		editor,
	])
	const shouldRender = !!location
	const [container, setContainer] = useState<HTMLDivElement | null>(null)
	usePassThroughWheelEvents(useMemo(() => ({ current: container }), [container]))

	// Guard against the opening interaction's own trailing events dismissing
	// the freshly-mounted dialog.
	const openedAtRef = useRef(0)
	useEffect(() => {
		if (shouldRender) openedAtRef.current = Date.now()
	}, [shouldRender])

	useQuickReactor(
		'OnCanvasNodePicker',
		() => {
			const state = onCanvasNodePickerState.get(editor)
			if (!state) return

			if (!container) return

			const connection = editor.getShape(state.connectionShapeId)
			if (!connection || !editor.isShapeOfType(connection, 'connection')) {
				onClose()
				return
			}

			const terminals = getConnectionTerminals(editor, connection)
			const terminalInConnectionSpace =
				state.location === 'middle'
					? Vec.Lrp(terminals.start, terminals.end, 0.5)
					: terminals[state.location]

			const terminalInPageSpace = editor
				.getShapePageTransform(connection)
				.applyToPoint(terminalInConnectionSpace)

			const terminalInViewportSpace = editor.pageToViewport(terminalInPageSpace)
			container.style.transform = `translate(${terminalInViewportSpace.x}px, ${terminalInViewportSpace.y}px) scale(${editor.getZoomLevel()}) `
		},
		[editor, container]
	)

	return (
		<Dialog.Root
			open={shouldRender}
			modal={false}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					if (Date.now() - openedAtRef.current < 350) return
					onClose()
				}
			}}
		>
			<Dialog.Content
				ref={setContainer}
				className={`OnCanvasNodePicker OnCanvasNodePicker_${location}`}
				style={{ width: NODE_WIDTH_PX }}
				onInteractOutside={(e) => {
					if (Date.now() - openedAtRef.current < 350) e.preventDefault()
				}}
			>
				<div className="OnCanvasNodePicker-content">
					<VisuallyHidden.Root>
						<Dialog.Title>Insert node</Dialog.Title>
					</VisuallyHidden.Root>
					<TldrawUiMenuContextProvider sourceId="dialog" type="menu">
						{children}
					</TldrawUiMenuContextProvider>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	)
}

function OnCanvasNodePickerItem<T extends NodeType>({
	definition,
	onClose,
}: {
	definition: NodeDefinition<T>
	onClose: () => void
}) {
	const editor = useEditor()

	return (
		<TldrawUiButton
			key={definition.type}
			type="menu"
			className="OnCanvasNodePicker-button"
			onPointerDown={editor.markEventAsHandled}
			onClick={() => {
				const state = onCanvasNodePickerState.get(editor)
				if (!state) return

				const connection = editor.getShape(state.connectionShapeId)
				if (!connection || !editor.isShapeOfType(connection, 'connection')) {
					onClose()
					return
				}

				const terminals = getConnectionTerminals(editor, connection)
				const terminalInConnectionSpace =
					state.location === 'middle'
						? Vec.Lrp(terminals.start, terminals.end, 0.5)
						: terminals[state.location]

				const terminalInPageSpace = editor
					.getShapePageTransform(connection)
					.applyToPoint(terminalInConnectionSpace)

				state.onPick(definition.getDefault(), terminalInPageSpace)

				onClose()
			}}
		>
			<TldrawUiButtonIcon icon={definition.icon as TLUiIconJsx} />
			<TldrawUiButtonLabel>{definition.title}</TldrawUiButtonLabel>
		</TldrawUiButton>
	)
}
