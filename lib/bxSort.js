/**
 * Client-side BX sort helpers (pure; unit-tested).
 * Sort by |bxShort| high→low; null/insufficient BX sinks to the bottom.
 */

/**
 * Absolute BX magnitude for sorting; null when missing/non-finite.
 * @param {{ bxShort?: number|null }|null|undefined} payload
 * @returns {number|null}
 */
export function absBx(payload) {
    const v = payload?.bxShort;
    if (v == null || !Number.isFinite(v)) return null;
    return Math.abs(v);
}

/**
 * Compare two BX payloads for |BX| high→low. Nulls sort last.
 * Stable tie-break left to caller (e.g. symbol).
 * @returns {number}
 */
export function compareByAbsBx(a, b) {
    const absA = absBx(a);
    const absB = absBx(b);
    if (absA == null && absB == null) return 0;
    if (absA == null) return 1;
    if (absB == null) return -1;
    return absB - absA;
}
