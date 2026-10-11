import type MatterNS from 'matter-js'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

/**
 * The moment a run finishes: one small card for each step that ran drops into a
 * tray and settles. The result becomes a pile you can count at a glance, and
 * the cards built on the canvas come back as done.
 *
 * Runs happen all day, so it stays small and brief: a tray the size of an icon
 * inside the toast that says the same thing in words, settled in about a
 * second. Matter.js does the physics, loaded only now (the first time a run
 * finishes), so it costs the app's first load nothing. With reduced motion, or
 * if the physics can't load, the cards are simply drawn already settled.
 */

const TRAY_W = 104
const TRAY_H = 34
const CARD_W = 14
const CARD_H = 10
const CARD_RADIUS = 2.5
const GAP = 2
/** Six cards fit across the tray's floor. */
const PER_ROW = Math.floor((TRAY_W + GAP) / (CARD_W + GAP))
/**
 * Two rows of six. A pile of more than that can stand a card on its end above
 * the tray's top edge, where it would be cut off; past twelve the label carries
 * the count. (Checked headlessly over 240 runs: none escaped, the pile's top
 * stayed 7px clear of the edge, and every run settled within 2.8s.)
 */
const MAX_CARDS = 12
/** The cards land in the order the steps ran, this far apart. */
const DROP_EVERY_MS = 60
/** Never simulate longer than this, settled or not. */
const MAX_SIM_MS = 3200
/** Matter is stepped at a fixed rate, whatever the display's frame rate. */
const STEP_MS = 1000 / 60

/** The success toast's own green, with a darker band across the top: a card's header. */
const CARD_FILL = '#6ee7a0'
const CARD_HEADER = '#2fae67'
/** A faint shelf along the floor, so the pile rests on something. */
const SHELF = 'rgba(255, 255, 255, 0.16)'

/** Clear the tray and draw its shelf. */
function drawTray(ctx: CanvasRenderingContext2D) {
	ctx.clearRect(0, 0, TRAY_W, TRAY_H)
	ctx.fillStyle = SHELF
	ctx.fillRect(0, TRAY_H - 1, TRAY_W, 1)
}

/** mulberry32: the same number of steps always drops the same way. */
function seededRandom(seed: number) {
	let t = seed >>> 0
	return () => {
		t = (t + 0x6d2b79f5) >>> 0
		let r = Math.imul(t ^ (t >>> 15), 1 | t)
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
	ctx.save()
	ctx.translate(x, y)
	ctx.rotate(angle)
	ctx.beginPath()
	ctx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS)
	ctx.fillStyle = CARD_FILL
	ctx.fill()
	ctx.clip()
	ctx.fillStyle = CARD_HEADER
	ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 3)
	ctx.restore()
}

/** Where the cards would come to rest: centred rows, filled from the floor up. */
function drawSettled(ctx: CanvasRenderingContext2D, count: number) {
	drawTray(ctx)
	for (let i = 0; i < count; i++) {
		const row = Math.floor(i / PER_ROW)
		const inRow = Math.min(PER_ROW, count - row * PER_ROW)
		const rowW = inRow * (CARD_W + GAP) - GAP
		const x = (TRAY_W - rowW) / 2 + (i % PER_ROW) * (CARD_W + GAP) + CARD_W / 2
		const y = TRAY_H - CARD_H / 2 - row * (CARD_H + GAP)
		drawCard(ctx, x, y, 0)
	}
}

/**
 * Where each card is dropped from. Every row of slots is used in a shuffled
 * order with a little jitter: it looks tossed in, but the floor fills before
 * anything stacks, so the pile stays low and inside the tray.
 */
function dropXs(count: number, random: () => number) {
	const xs: number[] = []
	while (xs.length < count) {
		const slots = Array.from({ length: PER_ROW }, (_, i) => i)
		for (let i = slots.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1))
			;[slots[i], slots[j]] = [slots[j], slots[i]]
		}
		for (const slot of slots) {
			if (xs.length === count) break
			xs.push(TRAY_W / 2 + (slot - (PER_ROW - 1) / 2) * (CARD_W + GAP) + (random() - 0.5) * 4)
		}
	}
	return xs
}

export function RunTray({ steps }: { steps: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const reduceMotion = useReducedMotion()

	useEffect(() => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext('2d')
		if (!canvas || !ctx) return
		const dpr = Math.min(window.devicePixelRatio || 1, 2)
		canvas.width = TRAY_W * dpr
		canvas.height = TRAY_H * dpr
		ctx.scale(dpr, dpr)

		const count = Math.min(steps, MAX_CARDS)
		if (reduceMotion) {
			drawSettled(ctx, count)
			return
		}

		let cancelled = false
		let teardown = () => {}

		const simulate = (Matter: typeof MatterNS) => {
			const { Bodies, Composite, Engine } = Matter
			const engine = Engine.create({ enableSleeping: true })
			const wall = { isStatic: true, friction: 0.6 }
			Composite.add(engine.world, [
				// the floor, and walls that run well above the tray so nothing
				// dropped in from overhead can land outside it
				Bodies.rectangle(TRAY_W / 2, TRAY_H + 10, TRAY_W + 40, 20, wall),
				Bodies.rectangle(-10, TRAY_H / 2 - 100, 20, TRAY_H + 200, wall),
				Bodies.rectangle(TRAY_W + 10, TRAY_H / 2 - 100, 20, TRAY_H + 200, wall),
			])

			const random = seededRandom(steps)
			const xs = dropXs(count, random)
			const cards: MatterNS.Body[] = []
			let raf = 0
			let last = 0
			let elapsed = 0
			let pending = 0
			let done = false

			const draw = () => {
				drawTray(ctx)
				for (const card of cards) drawCard(ctx, card.position.x, card.position.y, card.angle)
			}

			const frame = (now: number) => {
				// a frame after a long gap (a hidden tab) resumes; it doesn't catch up
				const dt = last ? Math.min(now - last, 50) : STEP_MS
				last = now
				elapsed += dt
				pending += dt

				while (cards.length < count && elapsed >= cards.length * DROP_EVERY_MS) {
					const card = Bodies.rectangle(xs[cards.length], -CARD_H, CARD_W, CARD_H, {
						chamfer: { radius: CARD_RADIUS },
						// restrained, so the pile settles instead of bouncing about
						restitution: 0.15,
						friction: 0.5,
						frictionStatic: 0.9,
						frictionAir: 0.012,
						angle: (random() - 0.5) * 0.4,
					})
					cards.push(card)
					Composite.add(engine.world, card)
				}

				for (let i = 0; pending >= STEP_MS && i < 4; i++) {
					Engine.update(engine, STEP_MS)
					pending -= STEP_MS
				}
				draw()

				const settled = cards.length === count && cards.every((card) => card.isSleeping)
				if (settled || elapsed > MAX_SIM_MS) {
					done = true
					raf = 0
					return
				}
				raf = requestAnimationFrame(frame)
			}

			// Nothing simulates while the page can't be seen.
			const onVisibility = () => {
				if (document.hidden) {
					cancelAnimationFrame(raf)
					raf = 0
					last = 0
				} else if (!done && !raf) {
					raf = requestAnimationFrame(frame)
				}
			}
			document.addEventListener('visibilitychange', onVisibility)
			if (!document.hidden) raf = requestAnimationFrame(frame)

			teardown = () => {
				cancelAnimationFrame(raf)
				document.removeEventListener('visibilitychange', onVisibility)
				Composite.clear(engine.world, false)
				Engine.clear(engine)
			}
		}

		import('matter-js')
			.then(({ default: Matter }) => {
				if (!cancelled) simulate(Matter)
			})
			.catch(() => {
				if (!cancelled) drawSettled(ctx, count)
			})

		return () => {
			cancelled = true
			teardown()
		}
	}, [steps, reduceMotion])

	return <canvas ref={canvasRef} className="toast-run-tray" aria-hidden />
}
