// Pure display helper for the IVR row on watchlist cards.
// State comes only from the /api/ivr payload; no client-side guessing.

export const IVR_BAND_COLORS = { low: '#4f7fbf', mid: '#8a8f98', high: '#c98a2b' };

export function ivrBand(ivr) {
    if (ivr >= 50) return 'high';
    if (ivr >= 30) return 'mid';
    return 'low';
}

/** Format an ISO instant in the viewer's locale and timezone; null if invalid. */
export function formatIvrAsOf(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // Omit locale/timeZone overrides so the browser supplies both defaults.
    // An explicit offset distinguishes repeated local times when DST ends.
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'shortOffset',
    }).format(date);
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
    const asOf = formatIvrAsOf(entry.asOf);
    if (asOf) title += `\nAs of ${asOf}`;

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
