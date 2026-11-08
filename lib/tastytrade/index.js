// Standalone, read-only tastytrade market-data module.
//
//   const tt = createTastytrade({ env: process.env });
//   tt.isConfigured();
//   await tt.getMarketMetrics(['NVDA', 'SPY']);
//
// Auth is OAuth refresh-token only. Only allowlisted market-data endpoints can
// be called. Nothing here is feature-specific.

import { createTokenManager } from './auth.js';
import { createCache } from './cache.js';
import { loadTastytradeConfig } from './config.js';
import { ENDPOINTS } from './endpoints/index.js';
import { AuthError, NotConfiguredError, TastytradeError } from './errors.js';
import { createHttp } from './http.js';

export { ALLOWED_ENDPOINTS, isAllowedEndpoint } from './allowlist.js';
export { loadTastytradeConfig } from './config.js';
export * from './errors.js';

const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

/**
 * @typedef {import('./endpoints/marketMetrics.js').MarketMetric} MarketMetric
 * @typedef {object} MarketMetricsEntry
 * @property {number} ivRank        IV Rank, 0-100 scale, not clamped (can exceed 100)
 * @property {number|null} ivPercentile  IV percentile, 0-100
 * @property {number} iv            30-day implied volatility, percent
 * @property {string|null} asOf     tastytrade's timestamp for the IV values
 * @property {boolean} stale        true when this is a last-good value served because a refresh failed
 *
 * @typedef {Record<string, MarketMetricsEntry>} MarketMetricsResult
 *   Keyed by uppercase symbol. Symbols with no IV data (no listed options, unknown,
 *   or nothing cached) are left out.
 */

/**
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {() => number} [opts.now]
 * @param {(ms:number) => Promise<void>} [opts.sleep]
 * @param {{ warn?: Function, error?: Function }} [opts.logger]
 * @param {object} [opts.http]  overrides for timeoutMs, maxRetries, backoffBaseMs, minIntervalMs
 */
export function createTastytrade({
    env = {},
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    sleep,
    logger = console,
    http: httpOpts = {},
    userAgent = 'portfolio-wrangler',
} = {}) {
    const config = loadTastytradeConfig(env);
    const cache = createCache();
    let backoffUntil = 0;
    let lastError = null;

    if (!config.configured) logger.warn?.('tastytrade not configured');

    const http = config.configured
        ? createHttp({ apiBase: config.apiBase, fetchImpl, now, sleep, userAgent, ...httpOpts })
        : null;
    const tokens = config.configured ? createTokenManager({ config, http, now }) : null;

    async function authedRequest(def, query) {
        let token = await tokens.getAccessToken();
        try {
            return await http.request(def.method, def.path, { query, token });
        } catch (err) {
            if (!(err instanceof AuthError)) throw err;
            tokens.invalidate();
            token = await tokens.getAccessToken({ force: true });
            return http.request(def.method, def.path, { query, token });
        }
    }

    /** Fetch keys for a batched endpoint, caching each normalized value (null = no data). */
    async function fetchBatched(def, keys, t) {
        for (let i = 0; i < keys.length; i += def.batchSize) {
            const chunk = keys.slice(i, i + def.batchSize);
            const body = await authedRequest(def, def.buildQuery(chunk));
            const got = new Map();
            for (const raw of def.extractItems(body)) {
                const n = def.normalize(raw);
                if (n) got.set(def.keyOf(n), n);
            }
            for (const key of chunk) cache.set(def.name, key, got.get(key) ?? null, t);
        }
    }

    /**
     * @param {string[]} symbols
     * @returns {Promise<MarketMetricsResult>}
     * @throws {NotConfiguredError} when credentials are missing
     * @throws {AuthError} when credentials are rejected, even if cached values exist
     * @throws {RateLimitedError|UpstreamError|TimeoutError} only when nothing is cached to fall back on
     */
    async function getMarketMetrics(symbols) {
        if (!config.configured) throw new NotConfiguredError();
        const def = ENDPOINTS.marketMetrics;
        const wanted = [...new Set((symbols || []).map((s) => String(s).trim().toUpperCase()))].filter(Boolean);
        const t = now();
        const ttl = def.ttlMs(t);
        const due = wanted.filter((s) => !cache.isFresh(cache.get(def.name, s), ttl, t));

        let failure = null;
        if (due.length) {
            if (t < backoffUntil) {
                failure = lastError;
            } else {
                try {
                    await fetchBatched(def, due, t);
                } catch (err) {
                    if (!(err instanceof TastytradeError)) throw err;
                    logger.error?.(err instanceof AuthError ? 'tastytrade auth failed' : err.message);
                    backoffUntil = t + FAILURE_BACKOFF_MS;
                    lastError = err;
                    failure = err;
                }
            }
        }

        if (failure instanceof AuthError) throw failure;

        /** @type {MarketMetricsResult} */
        const out = {};
        for (const s of wanted) {
            const entry = cache.get(def.name, s);
            if (!entry || !entry.value) continue;
            const { ivRank, ivPercentile, iv, asOf } = entry.value;
            out[s] = { ivRank, ivPercentile, iv, asOf, stale: !cache.isFresh(entry, ttl, t) };
        }

        if (failure && Object.keys(out).length === 0) throw failure;
        return out;
    }

    return {
        isConfigured: () => config.configured,
        getMarketMetrics,
    };
}
