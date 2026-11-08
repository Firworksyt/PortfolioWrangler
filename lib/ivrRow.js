// Pure display helper for the IVR row on watchlist cards.
// State comes only from the /api/ivr payload; no client-side guessing.

export const IVR_BAND_COLORS = { low: '#4f7fbf', mid: '#8a8f98', high: '#c98a2b' };

export function ivrBand(ivr) {
    if (ivr >= 50) return 'high';
    if (ivr >= 30) return 'mid';
    return 'low';
}

function fmt1(n) {
    return Number.isFinite(n) ? n.toFixed(1) : null;
}

/**
 * @param {{available?: boolean, source?: string, bySymbol?: object}|null|undefined} payload
 * @param {string} symbol
 * @returns {null | {ivrText:string, gaugePct:number, ivText:string|null, band:string, color:string, stale:boolean, title:string}}
 *   null means hide the row.
 */
export function formatIvrRow(payload, symbol) {
    if (!payload || payload.available !== true) return null;
    const entry = payload.bySymbol?.[symbol];
    if (!entry || !Number.isFinite(entry.ivr)) return null;

    const ivr = entry.ivr;
    const gaugePct = Math.max(0, Math.min(100, ivr));
    const band = ivrBand(ivr);
    const ivText = fmt1(entry.iv) !== null ? `IV ${fmt1(entry.iv)}%` : null;
    const source = payload.source || 'tastytrade';

    const parts = [`IV Rank ${fmt1(ivr)}`];
    if (Number.isFinite(entry.ivPercentile)) parts.push(`IV percentile ${fmt1(entry.ivPercentile)}`);
    let title = `${parts.join(' · ')}\nSource: ${source}`;
    if (entry.stale) title += ' (last known value)';
    if (entry.asOf) title += `\nAs of ${entry.asOf}`;

    return {
        ivrText: String(Math.round(ivr)),
        gaugePct,
        ivText,
        band,
        color: IVR_BAND_COLORS[band],
        stale: Boolean(entry.stale),
        title,
    };
}
