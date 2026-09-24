/**
 * Where S09's header band folds, in points of page scroll — a hand-off, never
 * a crossfade. The band's contents fade first; the header's date leaves only
 * once they have mostly gone, and the name and amount arrive only once the
 * date has left. Two lines of words at half opacity in one place read as
 * neither, which is what a shared range drew.
 */
export const BAND_FADE: readonly [number, number] = [8, 64];
export const DATE_OUT: readonly [number, number] = [32, 64];
export const TITLE_IN: readonly [number, number] = [64, 104];
