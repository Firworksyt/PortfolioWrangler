// Pure helpers for the watchlist IVR range filter.
// Bounds compare against the IV Rank as the card shows it: rounded to a whole number,
// never clamped (the gauge clamps at 100, the number does not). Stale values still count.

/**
 * Parse one bound from an input value. Empty or non-numeric means "no bound".
 * @param {string|number|null|undefined} raw
 * @returns {number|null}
 */
export function parseIvrBound(raw) {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|number|null|undefined} minRaw
 * @param {string|number|null|undefined} maxRaw
 * @returns {{min:number|null, max:number|null, invalid:boolean, active:boolean}}
 *   invalid: both bounds set and min > max (list is left unfiltered).
 *   active: at least one bound set and the range is valid.
 */
export function ivrFilterState(minRaw, maxRaw) {
    const min = parseIvrBound(minRaw);
    const max = parseIvrBound(maxRaw);
    const invalid = min !== null && max !== null && min > max;
    const active = !invalid && (min !== null || max !== null);
    return { min, max, invalid, active };
}

/**
 * @param {number|null|undefined} ivr  raw IV Rank for the symbol (bySymbol[SYM].ivr), or null/undefined when it has none
 * @param {{min:number|null, max:number|null, active:boolean}} state
 * @returns {boolean} true when the card should be shown
 */
export function passesIvrFilter(ivr, state) {
    if (!state || !state.active) return true;
    if (!Number.isFinite(ivr)) return false;
    const shown = Math.round(ivr);
    if (state.min !== null && shown < state.min) return false;
    if (state.max !== null && shown > state.max) return false;
    return true;
}
