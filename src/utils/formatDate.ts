/**
 * The date formats Kane shows. Both are built from one `Intl` setup so a
 * timestamp reads the same wherever it appears.
 *
 * Locale is pinned to en-US rather than the visitor's: the format is a product
 * decision (`MMM DD, YYYY, HH:MM AM/PM`), and letting the browser pick would
 * hand a European reviewer `07/08/2026, 15:45` instead.
 */

const STAMP = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: true,
})

const DAY = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: '2-digit',
	year: 'numeric',
})

/** `Aug 07, 2026, 03:45 PM` — for anything that happened at a moment. */
export function formatStamp(at: number | string | Date): string {
	return STAMP.format(new Date(at))
}

/** `Aug 07, 2026` — for anything where the time of day carries no meaning. */
export function formatDay(at: number | string | Date): string {
	return DAY.format(new Date(at))
}
