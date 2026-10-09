import { Globe } from 'lucide-react'
import { T, useEditor } from 'tldraw'
import {
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEIGHT_PX,
	NODE_WIDTH_PX,
} from '../../constants'
import { runSleep } from '../../execution/runControl'
import { kaneRuntime, viewForUrl } from '../../execution/runtime'
import { ShapePort } from '../../ports/Port'
import { paced } from '../../utils/pace'
import { NodeShape } from '../NodeShapeUtil'
import {
	ExecutionResult,
	InfoValues,
	NodeComponentProps,
	NodeDefinition,
	NodeTextRow,
	recordRun,
	updateNode,
} from './shared'
import { CARD_BASE } from './cardBase'
import { LastShot } from './lastShot'

/**
 * Open page card — navigates the browser to a URL. Usually the first step of a
 * workflow (it has no flow input, so runs treat it as a starting card).
 */

export type OpenNode = T.TypeOf<typeof OpenNode>
export const OpenNode = T.object({
	type: T.literal('open'),
	...CARD_BASE,
	url: T.string,
	/** Legacy: superseded by `run`. Kept so older documents still load. */
	lastShot: LastShot,
})

export class OpenNodeDefinition extends NodeDefinition<OpenNode> {
	static type = 'open' as const
	static validator = OpenNode
	title = 'Open page'
	heading = 'Open page'
	icon = (<Globe size={15} />)
	category = 'browser'
	resultKeys = ['run'] as const
	getDefault(): OpenNode {
		return { type: 'open', url: 'app.lambdatest.com/login', lastShot: null }
	}
	getBodyHeightPx() {
		return NODE_ROW_HEIGHT_PX
	}
	getPorts(): Record<string, ShapePort> {
		return {
			// Optional flow input so an Open card can sit mid-workflow (e.g. as
			// a module's first logical card connected from a larger workflow).
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'end',
				dataType: 'flow',
			},
			output: {
				id: 'output',
				x: NODE_WIDTH_PX,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
				dataType: 'flow',
			},
		}
	}
	async execute(shape: NodeShape, node: OpenNode): Promise<ExecutionResult> {
		const url = kaneRuntime.resolve(node.url) || 'example.com'
		const started = performance.now()
		kaneRuntime.act({ kind: 'navigate', url, label: `Open ${url}` })
		await runSleep(paced(900))
		recordRun(this.editor, shape, {
			ms: Math.round(performance.now() - started),
			view: viewForUrl(url),
			thought:
				`Navigated to ${url} and waited for the page to finish loading before handing on. ` +
				'Nothing on the page was touched — this step only gets the browser to the right place.',
		})
		return { output: url }
	}
	getOutputInfo(shape: NodeShape): InfoValues {
		return {
			output: {
				value: null,
				isOutOfDate: shape.props.isOutOfDate,
				dataType: 'flow',
			},
		}
	}
	Component = OpenNodeComponent
}

function OpenNodeComponent({ shape, node }: NodeComponentProps<OpenNode>) {
	const editor = useEditor()
	return (
		<>
			<NodeTextRow
				shapeId={shape.id}
				label="URL"
				value={node.url}
				placeholder="app.lambdatest.com/login"
				onChange={(url) => updateNode<OpenNode>(editor, shape, (n) => ({ ...n, url }), false)}
			/>
		</>
	)
}
