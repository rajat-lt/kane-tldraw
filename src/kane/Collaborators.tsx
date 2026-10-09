import { useEffect } from 'react'
import { useEditor } from 'tldraw'

/**
 * Real multiplayer presence between browser windows — no backend.
 *
 * Every window joins a `BroadcastChannel` and publishes its own cursor (in
 * page coordinates, so it lands correctly whatever each window's camera is
 * doing), camera and selection. Peers are written into the store as
 * `instance_presence` records, which is what tldraw renders collaborator
 * cursors from.
 *
 * Scope: BroadcastChannel is same-origin and same-browser, so this works
 * across tabs and windows on this machine — open http://localhost:5180 twice
 * and the cursors track each other. It does *not* reach another device or
 * another browser; that genuinely needs a server (tldraw sync / yjs), and the
 * record-writing below is the same path such a backend would feed.
 *
 * The document itself is already shared across windows by tldraw's
 * `persistenceKey`.
 */

const CHANNEL = 'kane-presence'
/** Drop a peer we haven't heard from in this long. */
const STALE_MS = 5000
/** Re-announce this often so idle peers don't look like they left. */
const HEARTBEAT_MS = 1200

const NAMES = ['Amber', 'Rowan', 'Devin', 'Priya', 'Marco', 'Sena', 'Kai', 'Noor']
const COLORS = ['#8250df', '#1f883d', '#cf5c1e', '#0a69da', '#b3306e', '#0f7c86']

interface PeerMessage {
	kind: 'presence' | 'leave'
	sessionId: string
	userName: string
	color: string
	pageId: string
	cursor: { x: number; y: number } | null
	camera: { x: number; y: number; z: number }
	selectedShapeIds: string[]
	at: number
}

/** Stable per-window identity, kept for the lifetime of the tab. */
function makeSession() {
	const sessionId = `w-${Math.random().toString(36).slice(2, 9)}`
	let hash = 0
	for (const ch of sessionId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
	return {
		sessionId,
		userName: NAMES[hash % NAMES.length],
		color: COLORS[hash % COLORS.length],
	}
}

export function Collaborators() {
	const editor = useEditor()

	useEffect(() => {
		if (typeof BroadcastChannel === 'undefined') return
		const presenceType = editor.store.schema.types.instance_presence
		if (!presenceType) return

		const me = makeSession()
		const channel = new BroadcastChannel(CHANNEL)
		/** sessionId → presence record id, so peers can be removed precisely. */
		const peerIds = new Map<string, ReturnType<typeof presenceType.createId>>()
		const lastSeen = new Map<string, number>()

		/** Last pointer position in page space, from the event itself. */
		let cursorPage: { x: number; y: number } | null = null

		const publish = () => {
			const cursor = cursorPage ?? editor.inputs.getCurrentPagePoint()
			const camera = editor.getCamera()
			const message: PeerMessage = {
				kind: 'presence',
				sessionId: me.sessionId,
				userName: me.userName,
				color: me.color,
				pageId: editor.getCurrentPageId(),
				cursor: { x: cursor.x, y: cursor.y },
				camera: { x: camera.x, y: camera.y, z: camera.z },
				selectedShapeIds: editor.getSelectedShapeIds(),
				at: Date.now(),
			}
			channel.postMessage(message)
		}

		const applyPeer = (msg: PeerMessage) => {
			// a peer id derived from their session keeps the record stable
			let id = peerIds.get(msg.sessionId)
			if (!id) {
				id = presenceType.createId(msg.sessionId)
				peerIds.set(msg.sessionId, id)
			}
			lastSeen.set(msg.sessionId, Date.now())
			editor.store.put([
				presenceType.create({
					id,
					// tldraw validates that a presence userId starts with `user:`
					userId: `user:${msg.sessionId}`,
					userName: msg.userName,
					color: msg.color,
					currentPageId: editor.getCurrentPageId(),
					camera: msg.camera,
					cursor: msg.cursor
						? { x: msg.cursor.x, y: msg.cursor.y, type: 'default', rotation: 0 }
						: null,
					selectedShapeIds: msg.selectedShapeIds as never,
					lastActivityTimestamp: Date.now(),
					chatMessage: '',
				}),
			])
		}

		const dropPeer = (sessionId: string) => {
			const id = peerIds.get(sessionId)
			if (!id) return
			editor.store.remove([id])
			peerIds.delete(sessionId)
			lastSeen.delete(sessionId)
		}

		channel.onmessage = (e: MessageEvent<PeerMessage>) => {
			const msg = e.data
			if (!msg || msg.sessionId === me.sessionId) return
			if (msg.kind === 'leave') dropPeer(msg.sessionId)
			else applyPeer(msg)
		}

		// publish on real interaction, and on a heartbeat so idle peers persist.
		// The point is converted from the event rather than read out of
		// editor.inputs, so it doesn't depend on tldraw's own pointer handler
		// having already run for this event.
		const onPointerMove = (e: PointerEvent) => {
			cursorPage = editor.screenToPage({ x: e.clientX, y: e.clientY })
			publish()
		}
		const container = editor.getContainer()
		container.addEventListener('pointermove', onPointerMove)
		const heartbeat = window.setInterval(publish, HEARTBEAT_MS)

		// reap peers whose window closed without a clean goodbye
		const reaper = window.setInterval(() => {
			const now = Date.now()
			for (const [sessionId, seen] of [...lastSeen]) {
				if (now - seen > STALE_MS) dropPeer(sessionId)
			}
		}, 1500)

		const leave = () => {
			channel.postMessage({ ...({} as PeerMessage), kind: 'leave', sessionId: me.sessionId })
		}
		window.addEventListener('pagehide', leave)

		publish()

		return () => {
			leave()
			window.removeEventListener('pagehide', leave)
			container.removeEventListener('pointermove', onPointerMove)
			window.clearInterval(heartbeat)
			window.clearInterval(reaper)
			channel.close()
			// take every peer cursor away with the component
			editor.store.remove([...peerIds.values()])
		}
	}, [editor])

	return null
}
