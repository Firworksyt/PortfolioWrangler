// Builds the /api/ivr payload from the tastytrade module.
// All tastytrade HTTP/auth lives in lib/tastytrade; this only maps results and
// errors to display states. It never throws.

import { AuthError, NotConfiguredError } from './tastytrade/index.js';

export const IVR_SOURCE = 'tastytrade';

/**
 * @param {{ isConfigured: () => boolean, getMarketMetrics: Function } | null | undefined} tt
 * @param {string[]} symbols
 * @param {{ error?: Function }} [logger]
 * @returns {Promise<{available: boolean, source: string, bySymbol: Record<string, {ivr:number, ivPercentile:number|null, iv:number, asOf:string|null, stale:boolean}>}>}
 */
export async function buildIvrPayload(tt, symbols, logger = console) {
    const unavailable = { available: false, source: IVR_SOURCE, bySymbol: {} };
    if (!tt || typeof tt.isConfigured !== 'function' || !tt.isConfigured()) return unavailable;

    const wanted = (symbols || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    if (wanted.length === 0) return { available: true, source: IVR_SOURCE, bySymbol: {} };

    let result;
    try {
        result = await tt.getMarketMetrics(wanted);
    } catch (err) {
        if (err instanceof NotConfiguredError || err instanceof AuthError) return unavailable;
        logger.error?.(`IVR unavailable: ${err?.name || 'Error'}`);
        return { available: true, source: IVR_SOURCE, bySymbol: {} };
    }

    const bySymbol = {};
    for (const [symbol, m] of Object.entries(result || {})) {
        if (!m || !Number.isFinite(m.ivRank)) continue;
        bySymbol[symbol] = {
            ivr: m.ivRank,
            ivPercentile: Number.isFinite(m.ivPercentile) ? m.ivPercentile : null,
            iv: Number.isFinite(m.iv) ? m.iv : null,
            asOf: m.asOf ?? null,
            stale: Boolean(m.stale),
        };
    }
    return { available: true, source: IVR_SOURCE, bySymbol };
}

/** Parse `?symbols=A,B` or fall back to the given default list. */
export function parseIvrSymbols(query, fallback) {
    const raw = typeof query === 'string' ? query : '';
    const list = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    return list.length ? [...new Set(list)] : [...(fallback || [])];
}
