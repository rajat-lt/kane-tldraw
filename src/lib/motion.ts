/**
 * Motion curves for animation driven from script, mirroring the CSS tokens in
 * index.css so both halves of the app ease the same way. Change one, change
 * the other.
 */

/** `--ease`: the strong ease-out every entrance and exit uses. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
