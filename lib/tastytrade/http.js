import { isAllowedEndpoint } from './allowlist.js';
import {
    AuthError,
    EndpointNotAllowedError,
    RateLimitedError,
    TimeoutError,
    UpstreamError,
} from './errors.js';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP layer: allowlist check, timeout, retry with backoff on 429/5xx,
 * and a simple minimum-interval rate limiter shared by all requests.
 */
export function createHttp({
    apiBase,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    sleep = realSleep,
    timeoutMs = 8000,
    maxRetries = 2,
    backoffBaseMs = 500,
    maxBackoffMs = 10000,
    minIntervalMs = 200,
    userAgent = 'portfolio-wrangler',
} = {}) {
    let nextSlot = 0;
    let queue = Promise.resolve();

    function rateLimit() {
        const turn = queue.then(async () => {
            const wait = nextSlot - now();
            if (wait > 0) await sleep(wait);
            nextSlot = now() + minIntervalMs;
        });
        queue = turn.catch(() => {});
        return turn;
    }

    async function once(method, path, { query, body, token }) {
        await rateLimit();
        const url = new URL(apiBase + path);
        if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
        const headers = { Accept: 'application/json', 'User-Agent': userAgent };
        if (body) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetchImpl(url.toString(), {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw new TimeoutError();
            throw new UpstreamError('network');
        } finally {
            clearTimeout(timer);
        }
    }

    function retryDelay(res, attempt) {
        const header = res?.headers?.get?.('retry-after');
        const sec = header != null ? Number(header) : NaN;
        const ms = Number.isFinite(sec) && sec >= 0 ? sec * 1000 : backoffBaseMs * 2 ** attempt;
        return Math.min(ms, maxBackoffMs);
    }

    /**
     * @param {string} method @param {string} path
     * @param {{ query?: object, body?: object, token?: string }} [opts]
     * @returns {Promise<any>} parsed JSON
     */
    async function request(method, path, opts = {}) {
        if (!isAllowedEndpoint(method, path)) throw new EndpointNotAllowedError(method, path);
        for (let attempt = 0; ; attempt++) {
            const res = await once(method, path, opts);
            if (res.ok) {
                try {
                    return await res.json();
                } catch {
                    throw new UpstreamError('invalid JSON', res.status);
                }
            }
            const retryable = res.status === 429 || res.status >= 500;
            if (retryable && attempt < maxRetries) {
                await sleep(retryDelay(res, attempt));
                continue;
            }
            if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
            if (res.status === 429) throw new RateLimitedError();
            throw new UpstreamError(`HTTP ${res.status}`, res.status);
        }
    }

    return { request };
}
