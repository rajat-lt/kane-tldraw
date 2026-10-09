export const CONNECTION_CENTER_HANDLE_SIZE_PX = 16
export const CONNECTION_CENTER_HANDLE_HOVER_SIZE_PX = 24

export const NODE_WIDTH_PX = 260
export const NODE_HEADER_HEIGHT_PX = 40
export const NODE_ROW_HEADER_GAP_PX = 8
export const NODE_ROW_BOTTOM_PADDING_PX = 10
// Cards no longer have a footer — running happens via the run cursor.
export const NODE_FOOTER_HEIGHT_PX = 0
export const NODE_ROW_HEIGHT_PX = 44
/** A row holding a multi-line field (an element, a condition, a prompt). */
export const NODE_FIELD_HEIGHT_PX = 78
/** Height of the last-run screenshot strip on browser-action cards. */
export const NODE_SHOT_HEIGHT_PX = 118

/**
 * The card panel below the body: the tab strip, and how tall each tab's
 * contents are. Cards fold these into their geometry, so the numbers here and
 * the CSS have to agree.
 */
export const CARD_TAB_STRIP_PX = 40
export const CARD_TAB_HEIGHTS = {
	screenshot: 168,
	thought: 122,
	settings: 96,
} as const
/** Below this zoom the dotted grid is hidden (it would be visual noise). */
export const GRID_MIN_ZOOM = 0.4

export const PORT_RADIUS_PX = 6

export const DEFAULT_NODE_SPACING_PX = 60

/**
 * Port data types define the kind of data that flows between cards.
 *
 * - `flow`  — the execution order of the test (card → card sequence)
 * - `value` — data produced by parameter / secret / TOTP / variable cards
 * - `any`   — compatible with everything
 */
export type PortDataType = 'flow' | 'value' | 'any'

export const PORT_TYPE_COLORS: Record<PortDataType, string> = {
	flow: '#0a69da',
	value: '#1f883d',
	any: '#c08520',
}

/**
 * Ports are drawn by *direction*, not by data type: everything a card takes in
 * is orange, everything it hands on is blue. Which way a connection runs is the
 * thing you read a graph by, and it is the same question on every card — where
 * the data type only matters at the moment you are dragging a wire, which the
 * eligible-port highlight already answers.
 */
export const PORT_IN_COLOR = '#c2410c'
export const PORT_OUT_COLOR = '#0a69da'
