import NumberFlow from '@number-flow/react'
import { KeyRound, ShieldCheck, SlidersHorizontal, Variable } from 'lucide-react'
import { useEffect, useState } from 'react'
import { T, useEditor } from 'tldraw'
import { NODE_HEADER_HEIGHT_PX, NODE_ROW_HEIGHT_PX, NODE_WIDTH_PX } from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime, totpCode, totpSecondsLeft } from '../../execution/runtime'
import { ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import { CARD_BASE } from './cardBase'
import {
	ExecutionResult,
	InfoValues,
	NodeComponentProps,
	NodeDefinition,
	NodeRow,
	NodeTextRow,
	updateNode,
} from './shared'

/**
 * Parameter / Secret / TOTP Auth / Variable — four distinct card types with the
 * same structure: an entity name and its default value. Each exposes a green
 * `value` output port that other cards (e.g. Input box) can consume.
 *
 * - Secret masks its value with a reveal toggle.
 * - TOTP Auth treats the value as the shared key and shows a live 6-digit
 *   code (mocked deterministically) that refreshes every 30 seconds.
 */

export type EntityKind = 'parameter' | 'secret' | 'totp' | 'variable'

interface EntityMeta {
	title: string
	icon: React.ReactElement
	masked: boolean
	namePlaceholder: string
	valuePlaceholder: string
}

const ENTITY_META: Record<EntityKind, EntityMeta> = {
	parameter: {
		title: 'Parameter',
		icon: <SlidersHorizontal size={15} />,
		masked: false,
		namePlaceholder: 'baseUrl',
		valuePlaceholder: 'https://app.lambdatest.com',
	},
	secret: {
		title: 'Secret',
		icon: <KeyRound size={15} />,
		masked: true,
		namePlaceholder: 'password',
		valuePlaceholder: 'Enter secret value',
	},
	totp: {
		title: 'TOTP Auth',
		icon: <ShieldCheck size={15} />,
		masked: true,
		namePlaceholder: 'otp',
		valuePlaceholder: 'Shared TOTP key',
	},
	variable: {
		title: 'Variable',
		icon: <Variable size={15} />,
		masked: false,
		namePlaceholder: 'email',
		valuePlaceholder: 'you@company.com',
	},
}

interface EntityNodeProps {
	type: EntityKind
	label?: string
	name: string
	value: string
}

function EntityBody({
	shape,
	node,
	kind,
}: NodeComponentProps<EntityNodeProps> & { kind: EntityKind }) {
	const editor = useEditor()
	const meta = ENTITY_META[kind]

	const setField = (field: 'name' | 'value', next: string) => {
		updateNode(
			editor,
			shape,
			(n) => ({ ...(n as unknown as EntityNodeProps), [field]: next }) as never,
			field === 'value'
		)
	}

	return (
		<>
			<NodeTextRow
				shapeId={shape.id}
				label="Name"
				value={node.name}
				placeholder={meta.namePlaceholder}
				onChange={(next) => setField('name', next)}
			/>
			<NodeTextRow
				shapeId={shape.id}
				label={kind === 'totp' ? 'Key' : 'Value'}
				value={node.value}
				placeholder={meta.valuePlaceholder}
				masked={meta.masked}
				onChange={(next) => setField('value', next)}
			/>
			{kind === 'totp' && <TotpCodeRow secret={node.value} />}
		</>
	)
}

/** Live (mock) TOTP code with a 30s refresh countdown. */
function TotpCodeRow({ secret }: { secret: string }) {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const t = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(t)
	}, [])
	const code = secret ? totpCode(secret, now) : null
	const left = totpSecondsLeft(now)
	return (
		<NodeRow className="TotpCodeRow">
			<span className="NodeInputRow-label">Code</span>
			{code ? (
				<>
					{/* NumberFlow rolls each half of the code as it rotates */}
					<span className="TotpCodeRow-code">
						<NumberFlow
							value={Number(code.slice(0, 3))}
							format={{ minimumIntegerDigits: 3, useGrouping: false }}
							respectMotionPreference
						/>{' '}
						<NumberFlow
							value={Number(code.slice(3))}
							format={{ minimumIntegerDigits: 3, useGrouping: false }}
							respectMotionPreference
						/>
					</span>
					<span className="TotpCodeRow-countdown">
						<NumberFlow value={left} respectMotionPreference />s
					</span>
				</>
			) : (
				<span className="NodeRow-disconnected">enter a key</span>
			)}
		</NodeRow>
	)
}

/**
 * Build a concrete entity definition. The validator is created at each call
 * site (not inside a generic) so the `type` literal is preserved in the
 * NodeType union.
 */
function defineEntity<N extends EntityNodeProps>(kind: N['type'], validator: T.Validator<N>) {
	const meta = ENTITY_META[kind]

	function Component({ shape, node }: NodeComponentProps<N>) {
		return <EntityBody shape={shape} node={node} kind={kind} />
	}

	return class EntityNodeDefinition extends NodeDefinition<N> {
		static type = kind
		static validator = validator
		title = meta.title
		heading = meta.title
		icon = meta.icon
		category = 'data'
		getDefault(): N {
			return { type: kind, name: '', value: '' } as N
		}
		getBodyHeightPx() {
			return NODE_ROW_HEIGHT_PX * (kind === 'totp' ? 3 : 2)
		}
		getPorts(): Record<string, ShapePort> {
			return {
				output: {
					id: 'output',
					x: NODE_WIDTH_PX,
					y: NODE_HEADER_HEIGHT_PX / 2,
					terminal: 'start',
					dataType: 'value',
				},
			}
		}
		async execute(_shape: NodeShape, node: N): Promise<ExecutionResult> {
			await runSleep(paced(250))
			const resolved = kaneRuntime.resolve(node.value)
			const output = kind === 'totp' ? totpCode(resolved) : resolved
			kaneRuntime.setValue(node.name, output)
			return { output }
		}
		getOutputInfo(shape: NodeShape, node: N): InfoValues {
			const value =
				kind === 'totp'
					? node.value
						? totpCode(node.value)
						: null
					: kind === 'secret'
						? node.value
							? '••••••'
							: null
						: node.value || null
			return {
				output: {
					value,
					isOutOfDate: shape.props.isOutOfDate,
					dataType: 'value',
				},
			}
		}
		Component = Component
	}
}

export const ParameterNodeDefinition = defineEntity(
	'parameter',
	T.object({ type: T.literal('parameter'), ...CARD_BASE, name: T.string, value: T.string })
)
export const SecretNodeDefinition = defineEntity(
	'secret',
	T.object({ type: T.literal('secret'), ...CARD_BASE, name: T.string, value: T.string })
)
export const TotpNodeDefinition = defineEntity(
	'totp',
	T.object({ type: T.literal('totp'), ...CARD_BASE, name: T.string, value: T.string })
)
export const VariableNodeDefinition = defineEntity(
	'variable',
	T.object({ type: T.literal('variable'), ...CARD_BASE, name: T.string, value: T.string })
)
