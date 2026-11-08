import { HOUR_MS, MINUTE_MS, marketHoursTtl } from '../marketHours.js';

/**
 * @typedef {object} MarketMetric
 * @property {string} symbol
 * @property {number} ivRank        0-100 scale, NOT clamped (tastytrade can report >100)
 * @property {number|null} ivPercentile  0-100 scale
 * @property {number} iv            30-day implied volatility, in percent
 * @property {string|null} asOf     ISO timestamp of tastytrade's IV update
 */

function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
const round1 = (n) => Math.round(n * 10) / 10;
const fractionToPct = (v) => {
    const n = toNumber(v);
    return n === null ? null : round1(n * 100);
};

/**
 * Normalize one `/market-metrics` item.
 *
 * Scales (tastytrade): rank and percentile are 0-1 decimals sent as strings,
 * `implied-volatility-30-day` is already a percent, `implied-volatility-index`
 * is a 0-1 fraction.
 *
 * Rank flavor: `implied-volatility-index-rank` is tastytrade's primary IV Rank
 * field (the variant it uses is named in `implied-volatility-index-rank-source`).
 * The `tw-` and `tos-` variants are fallbacks only when that field is absent.
 *
 * @returns {MarketMetric|null} null when the symbol has no IV data (no listed options)
 */
export function normalizeMarketMetric(item) {
    if (!item || typeof item.symbol !== 'string') return null;
    const rank =
        toNumber(item['implied-volatility-index-rank']) ??
        toNumber(item['tw-implied-volatility-index-rank']) ??
        toNumber(item['tos-implied-volatility-index-rank']);
    const iv30 = toNumber(item['implied-volatility-30-day']);
    const iv = iv30 !== null ? round1(iv30) : fractionToPct(item['implied-volatility-index']);
    if (rank === null || iv === null) return null;
    return {
        symbol: item.symbol.toUpperCase(),
        ivRank: round1(rank * 100),
        ivPercentile: fractionToPct(item['implied-volatility-percentile']),
        iv,
        asOf: item['implied-volatility-updated-at'] || item['updated-at'] || null,
    };
}

/** Endpoint definition. A new endpoint is one file like this plus tests. */
export default Object.freeze({
    name: 'marketMetrics',
    method: 'GET',
    path: '/market-metrics',
    batchSize: 50,
    ttlMs: marketHoursTtl({ openMs: 15 * MINUTE_MS, closedMs: 12 * HOUR_MS }),
    /** @param {string[]} symbols */
    buildQuery: (symbols) => ({ symbols: symbols.join(',') }),
    /** @returns {object[]} raw items */
    extractItems: (body) => (Array.isArray(body?.data?.items) ? body.data.items : []),
    normalize: normalizeMarketMetric,
    keyOf: (normalized) => normalized.symbol,
});
