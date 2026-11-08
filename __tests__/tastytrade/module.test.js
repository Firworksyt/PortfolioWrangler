import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
    ALLOWED_ENDPOINTS,
    AuthError,
    EndpointNotAllowedError,
    NotConfiguredError,
    RateLimitedError,
    TimeoutError,
    UpstreamError,
    createTastytrade,
    isAllowedEndpoint,
    loadTastytradeConfig,
} from '../../lib/tastytrade/index.js';
import { createHttp } from '../../lib/tastytrade/http.js';
import { normalizeMarketMetric } from '../../lib/tastytrade/endpoints/marketMetrics.js';
import { isUsMarketOpen } from '../../lib/tastytrade/marketHours.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const fixture = JSON.parse(readFileSync(path.join(ROOT, '__tests__/fixtures/tastytrade_market_metrics.json'), 'utf8'));
const ITEMS = fixture.data.items;

const ENV = {
    TASTYTRADE_CLIENT_ID: 'client-id-TEST',
    TASTYTRADE_CLIENT_SECRET: 'client-secret-TEST',
    TASTYTRADE_REFRESH_TOKEN: 'refresh-token-TEST',
};
const SECRETS = [...Object.values(ENV), 'access-TEST-1', 'access-TEST-2'];

// Wed Nov 4, 2026 11:00 ET (open) and Sat Nov 7, 2026 (closed)
const OPEN_T = Date.parse('2026-11-04T16:00:00Z');
const CLOSED_T = Date.parse('2026-11-07T16:00:00Z');

function res(status, body, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k) => headers[k.toLowerCase()] ?? null },
        json: async () => body,
    };
}

/** Mock HTTP: handlers are consumed in order; every call is recorded. */
function mockFetch(handlers) {
    const calls = [];
    const fn = async (url, init) => {
        const u = new URL(url);
        calls.push({ url: u, method: init.method, path: u.pathname, symbols: u.searchParams.get('symbols'), init });
        const h = handlers.shift();
        if (!h) throw new Error(`unexpected request ${init.method} ${u.pathname}`);
        return h(u, init);
    };
    fn.calls = calls;
    return fn;
}

const token = (n = 1, expires = 900) => () => res(200, { access_token: `access-TEST-${n}`, expires_in: expires });
const metrics = (items = ITEMS) => () => res(200, { data: { items } });

function makeLogger() {
    const lines = [];
    return { lines, warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
}

function make({ handlers, now = () => OPEN_T, env = ENV, logger = makeLogger(), http = {} } = {}) {
    const fetchImpl = mockFetch(handlers);
    const sleeps = [];
    const tt = createTastytrade({
        env,
        fetchImpl,
        now,
        logger,
        sleep: async (ms) => { sleeps.push(ms); },
        http: { minIntervalMs: 0, ...http },
    });
    return { tt, fetchImpl, sleeps, logger };
}

function expectNoSecrets(text) {
    for (const s of SECRETS) expect(text).not.toContain(s);
}

describe('config', () => {
    test('configured only when all three OAuth values are present', () => {
        expect(loadTastytradeConfig(ENV).configured).toBe(true);
        for (const key of Object.keys(ENV)) {
            expect(loadTastytradeConfig({ ...ENV, [key]: '' }).configured).toBe(false);
            expect(loadTastytradeConfig({ ...ENV, [key]: '   ' }).configured).toBe(false);
        }
        expect(loadTastytradeConfig({}).configured).toBe(false);
    });

    test('TASTYTRADE_API_BASE overrides the production base', () => {
        expect(loadTastytradeConfig(ENV).apiBase).toBe('https://api.tastyworks.com');
        expect(loadTastytradeConfig({ ...ENV, TASTYTRADE_API_BASE: 'http://127.0.0.1:4010/' }).apiBase).toBe('http://127.0.0.1:4010');
    });

    test('requests go to the overridden base', async () => {
        const { tt, fetchImpl } = make({ env: { ...ENV, TASTYTRADE_API_BASE: 'http://127.0.0.1:4010' }, handlers: [token(), metrics()] });
        await tt.getMarketMetrics(['NVDA']);
        expect(fetchImpl.calls.every((c) => c.url.origin === 'http://127.0.0.1:4010')).toBe(true);
    });
});

describe('not configured', () => {
    test('constructs without throwing, logs one line, makes no requests', async () => {
        const logger = makeLogger();
        const { tt, fetchImpl } = make({ env: {}, handlers: [], logger });
        expect(tt.isConfigured()).toBe(false);
        expect(logger.lines).toEqual(['tastytrade not configured']);
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(NotConfiguredError);
        expect(fetchImpl.calls).toHaveLength(0);
    });

    test('partial credentials are not configured and the log has no values', () => {
        const logger = makeLogger();
        const { tt } = make({ env: { TASTYTRADE_CLIENT_ID: ENV.TASTYTRADE_CLIENT_ID, TASTYTRADE_CLIENT_SECRET: ENV.TASTYTRADE_CLIENT_SECRET }, handlers: [], logger });
        expect(tt.isConfigured()).toBe(false);
        expect(logger.lines).toEqual(['tastytrade not configured']);
        expectNoSecrets(logger.lines.join('\n'));
    });
});

describe('read-only allowlist', () => {
    test('contains only token refresh and market metrics', () => {
        expect(ALLOWED_ENDPOINTS.map((e) => `${e.method} ${e.path}`)).toEqual(['POST /oauth/token', 'GET /market-metrics']);
    });

    const blocked = [
        ['GET', '/accounts'],
        ['GET', '/customers/me/accounts'],
        ['GET', '/accounts/5WX00000/balances'],
        ['GET', '/accounts/5WX00000/positions'],
        ['GET', '/accounts/5WX00000/orders'],
        ['POST', '/accounts/5WX00000/orders'],
        ['POST', '/accounts/5WX00000/orders/dry-run'],
        ['DELETE', '/accounts/5WX00000/orders/1'],
        ['GET', '/accounts/5WX00000/transactions'],
        ['POST', '/sessions'],
        ['DELETE', '/sessions'],
        ['POST', '/market-metrics'],
        ['GET', '/market-metrics/../accounts'],
        ['GET', '/market-metrics/historic-corporate-events/earnings-reports/NVDA'],
        ['GET', '/oauth/token'],
    ];
    test.each(blocked)('%s %s is rejected', (m, p) => {
        expect(isAllowedEndpoint(m, p)).toBe(false);
    });

    test('the HTTP layer refuses blocked paths before any network call', async () => {
        const fetchImpl = mockFetch([]);
        const http = createHttp({ apiBase: 'https://api.tastyworks.com', fetchImpl, minIntervalMs: 0 });
        for (const [m, p] of blocked) {
            await expect(http.request(m, p)).rejects.toBeInstanceOf(EndpointNotAllowedError);
        }
        expect(fetchImpl.calls).toHaveLength(0);
    });
});

describe('OAuth only', () => {
    const srcDir = path.join(ROOT, 'lib/tastytrade');
    const files = [];
    (function walk(dir) {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (p.endsWith('.js')) files.push(p);
        }
    })(srcDir);

    test('no session or username/password login path exists in the module', () => {
        expect(files.length).toBeGreaterThan(3);
        for (const f of files) {
            const src = readFileSync(f, 'utf8');
            expect(src).not.toMatch(/\/sessions/);
            expect(src).not.toMatch(/password|username|remember-token|login/i);
        }
        expect(isAllowedEndpoint('POST', '/sessions')).toBe(false);
    });

    test('token refresh sends the refresh-token grant without an Authorization header', async () => {
        const { tt, fetchImpl } = make({ handlers: [token(), metrics()] });
        await tt.getMarketMetrics(['NVDA']);
        const [tok, mm] = fetchImpl.calls;
        expect(`${tok.method} ${tok.path}`).toBe('POST /oauth/token');
        expect(JSON.parse(tok.init.body)).toEqual({
            grant_type: 'refresh_token',
            refresh_token: ENV.TASTYTRADE_REFRESH_TOKEN,
            client_id: ENV.TASTYTRADE_CLIENT_ID,
            client_secret: ENV.TASTYTRADE_CLIENT_SECRET,
        });
        expect(tok.init.headers.Authorization).toBeUndefined();
        expect(mm.init.headers.Authorization).toBe('Bearer access-TEST-1');
    });

    test('access token is kept in memory and refreshed near expiry', async () => {
        let t = OPEN_T;
        const { tt, fetchImpl } = make({ now: () => t, handlers: [token(1), metrics(), token(2), metrics()] });
        await tt.getMarketMetrics(['NVDA']);
        await tt.getMarketMetrics(['NVDA']); // cache hit, no request
        expect(fetchImpl.calls).toHaveLength(2);
        t = OPEN_T + 15 * 60 * 1000; // cache expired; 900 s token is inside the 60 s refresh buffer
        await tt.getMarketMetrics(['NVDA']);
        expect(fetchImpl.calls.map((c) => c.path)).toEqual(['/oauth/token', '/market-metrics', '/oauth/token', '/market-metrics']);
        expect(fetchImpl.calls[3].init.headers.Authorization).toBe('Bearer access-TEST-2');
    });

    test('a valid token is reused across requests', async () => {
        let t = OPEN_T;
        const { tt, fetchImpl } = make({ now: () => t, handlers: [token(1, 3600), metrics(), metrics()] });
        await tt.getMarketMetrics(['NVDA']);
        t += 15 * 60 * 1000;
        await tt.getMarketMetrics(['NVDA']);
        expect(fetchImpl.calls.map((c) => c.path)).toEqual(['/oauth/token', '/market-metrics', '/market-metrics']);
    });

    test('401 forces one token refresh and retries', async () => {
        const { tt, fetchImpl } = make({ handlers: [token(1), () => res(401, {}), token(2), metrics()] });
        const out = await tt.getMarketMetrics(['NVDA']);
        expect(out.items[0].symbol).toBe('NVDA');
        expect(fetchImpl.calls.map((c) => c.path)).toEqual(['/oauth/token', '/market-metrics', '/oauth/token', '/market-metrics']);
        expect(fetchImpl.calls[3].init.headers.Authorization).toBe('Bearer access-TEST-2');
    });

    test('rejected refresh token raises AuthError and logs only "tastytrade auth failed"', async () => {
        const logger = makeLogger();
        const { tt } = make({ logger, handlers: [() => res(400, { error: 'invalid_grant', echo: ENV.TASTYTRADE_REFRESH_TOKEN })] });
        const err = await tt.getMarketMetrics(['NVDA']).catch((e) => e);
        expect(err).toBeInstanceOf(AuthError);
        expect(logger.lines).toEqual(['tastytrade auth failed']);
        expectNoSecrets(`${err.message} ${JSON.stringify(err)} ${err.stack}`);
    });

    test('second 401 after refresh raises AuthError', async () => {
        const { tt } = make({ handlers: [token(1), () => res(401, {}), token(2), () => res(401, {})] });
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(AuthError);
    });
});

describe('getMarketMetrics', () => {
    test('normalizes to 0-100, passes IVR above 100 through, reports no-options as missing', async () => {
        const { tt } = make({ handlers: [token(), metrics()] });
        const out = await tt.getMarketMetrics(['nvda', 'SPY', 'DE', 'NOOPT']);
        expect(out.stale).toBe(false);
        expect(out.missing).toEqual(['NOOPT']);
        expect(out.items).toEqual([
            { symbol: 'NVDA', ivRank: 81.7, ivPercentile: 99.9, iv: 61.9, asOf: '2026-11-06T21:00:00.000+00:00' },
            { symbol: 'SPY', ivRank: 76.4, ivPercentile: 92.1, iv: 23.7, asOf: '2026-11-06T21:00:00.000+00:00' },
            { symbol: 'DE', ivRank: 101.3, ivPercentile: 99.4, iv: 46.3, asOf: '2026-11-06T21:00:00.000+00:00' },
        ]);
        expect(out.fetchedAt).toBe(new Date(OPEN_T).toISOString());
    });

    test('symbols not returned by tastytrade are missing', async () => {
        const { tt } = make({ handlers: [token(), metrics(ITEMS.slice(0, 1))] });
        const out = await tt.getMarketMetrics(['NVDA', 'ZZZZ']);
        expect(out.items.map((i) => i.symbol)).toEqual(['NVDA']);
        expect(out.missing).toEqual(['ZZZZ']);
    });

    test('batches symbols into groups of 50 in one pass', async () => {
        const syms = Array.from({ length: 120 }, (_, i) => `S${i}`);
        const { tt, fetchImpl } = make({ handlers: [token(), metrics([]), metrics([]), metrics([])] });
        await tt.getMarketMetrics(syms);
        const mm = fetchImpl.calls.filter((c) => c.path === '/market-metrics');
        expect(mm.map((c) => c.symbols.split(',').length)).toEqual([50, 50, 20]);
    });

    test('cache: hit within TTL, only missing/expired symbols requested, 15 min open / 12 h closed', async () => {
        let t = OPEN_T;
        const { tt, fetchImpl } = make({ now: () => t, handlers: [token(1, 30 * 86400), metrics(), metrics(), metrics(), metrics()] });
        await tt.getMarketMetrics(['NVDA']);
        await tt.getMarketMetrics(['NVDA', 'SPY']);
        t += 15 * 60 * 1000 - 1;
        await tt.getMarketMetrics(['NVDA', 'SPY']);
        t += 1;
        await tt.getMarketMetrics(['NVDA']);
        t = CLOSED_T;
        await tt.getMarketMetrics(['NVDA']);
        t += 12 * 60 * 60 * 1000 - 1;
        await tt.getMarketMetrics(['NVDA']);
        expect(fetchImpl.calls.filter((c) => c.path === '/market-metrics').map((c) => c.symbols)).toEqual(['NVDA', 'SPY', 'NVDA', 'NVDA']);
    });

    test('429 retries with backoff (honoring Retry-After) and then succeeds', async () => {
        const { tt, sleeps } = make({ handlers: [token(), () => res(429, {}, { 'retry-after': '2' }), () => res(429, {}), metrics()] });
        const out = await tt.getMarketMetrics(['NVDA']);
        expect(out.items).toHaveLength(1);
        expect(sleeps).toEqual([2000, 1000]);
    });

    test('429 after all retries raises RateLimitedError', async () => {
        const { tt } = make({ handlers: [token(), () => res(429, {}), () => res(429, {}), () => res(429, {})] });
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(RateLimitedError);
    });

    test('5xx retries then raises UpstreamError', async () => {
        const { tt, sleeps } = make({ handlers: [token(), () => res(502, {}), () => res(503, {}), () => res(500, {})] });
        const err = await tt.getMarketMetrics(['NVDA']).catch((e) => e);
        expect(err).toBeInstanceOf(UpstreamError);
        expect(err.status).toBe(500);
        expect(sleeps).toEqual([500, 1000]);
    });

    test('timeout raises TimeoutError', async () => {
        const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
        const { tt } = make({ handlers: [token(), abort] });
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(TimeoutError);
    });

    test('real timeout aborts a hanging request', async () => {
        const hang = (u, init) => new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
        });
        const http = createHttp({ apiBase: 'https://api.tastyworks.com', fetchImpl: mockFetch([hang]), timeoutMs: 20, minIntervalMs: 0 });
        await expect(http.request('GET', '/market-metrics', { query: { symbols: 'NVDA' } })).rejects.toBeInstanceOf(TimeoutError);
    });

    test('upstream failure after a good fetch returns last-good values marked stale, then backs off 5 min', async () => {
        let t = OPEN_T;
        const logger = makeLogger();
        const { tt, fetchImpl } = make({
            now: () => t,
            logger,
            http: { maxRetries: 0 },
            handlers: [token(1, 86400), metrics(), () => res(503, {}), metrics()],
        });
        await tt.getMarketMetrics(['NVDA', 'DE']);
        t += 15 * 60 * 1000;
        const stale = await tt.getMarketMetrics(['NVDA', 'DE', 'SPY']);
        expect(stale.stale).toBe(true);
        expect(stale.items.map((i) => [i.symbol, i.ivRank])).toEqual([['NVDA', 81.7], ['DE', 101.3]]);
        expect(stale.missing).toEqual(['SPY']);
        expect(stale.fetchedAt).toBe(new Date(OPEN_T).toISOString());
        expect(logger.lines).toEqual(['tastytrade upstream error (HTTP 503)']);

        t += 5 * 60 * 1000 - 1;
        expect((await tt.getMarketMetrics(['NVDA'])).stale).toBe(true);
        expect(fetchImpl.calls.filter((c) => c.path === '/market-metrics')).toHaveLength(2); // backing off

        t += 1;
        const fresh = await tt.getMarketMetrics(['NVDA']);
        expect(fresh.stale).toBe(false);
        expect(fetchImpl.calls.filter((c) => c.path === '/market-metrics')).toHaveLength(3);
    });

    test('failure with nothing cached throws, and keeps throwing during backoff', async () => {
        let t = OPEN_T;
        const { tt, fetchImpl } = make({ now: () => t, http: { maxRetries: 0 }, handlers: [token(), () => res(500, {})] });
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(UpstreamError);
        t += 60 * 1000;
        await expect(tt.getMarketMetrics(['NVDA'])).rejects.toBeInstanceOf(UpstreamError);
        expect(fetchImpl.calls).toHaveLength(2);
    });

    test('errors and logs never contain credentials or tokens', async () => {
        const logger = makeLogger();
        const echo = () => res(500, { message: `bad ${ENV.TASTYTRADE_CLIENT_SECRET} access-TEST-1` });
        const { tt } = make({ logger, http: { maxRetries: 0 }, handlers: [token(), echo] });
        const err = await tt.getMarketMetrics(['NVDA']).catch((e) => e);
        expectNoSecrets(`${err.message} ${JSON.stringify(err)} ${err.stack} ${logger.lines.join('\n')}`);
    });
});

describe('rate limiter', () => {
    test('spaces consecutive requests by minIntervalMs', async () => {
        let t = 0;
        const sleeps = [];
        const http = createHttp({
            apiBase: 'https://api.tastyworks.com',
            fetchImpl: mockFetch([metrics(), metrics(), metrics()]),
            now: () => t,
            sleep: async (ms) => { sleeps.push(ms); t += ms; },
            minIntervalMs: 250,
        });
        await Promise.all([1, 2, 3].map(() => http.request('GET', '/market-metrics', { query: { symbols: 'NVDA' } })));
        expect(sleeps).toEqual([250, 250]);
    });
});

describe('normalizeMarketMetric', () => {
    test('falls back to tw/tos rank and the IV index fraction', () => {
        expect(normalizeMarketMetric({ symbol: 'x', 'tw-implied-volatility-index-rank': '0.25', 'implied-volatility-index': '0.312' }))
            .toEqual({ symbol: 'X', ivRank: 25, ivPercentile: null, iv: 31.2, asOf: null });
        expect(normalizeMarketMetric({ symbol: 'y', 'tos-implied-volatility-index-rank': 0.5, 'implied-volatility-30-day': '40' }))
            .toMatchObject({ ivRank: 50, iv: 40 });
        expect(normalizeMarketMetric({ symbol: 'z' })).toBeNull();
        expect(normalizeMarketMetric(null)).toBeNull();
    });
});

describe('isUsMarketOpen', () => {
    test('regular session in New York time', () => {
        expect(isUsMarketOpen(new Date(OPEN_T))).toBe(true);
        expect(isUsMarketOpen(new Date(CLOSED_T))).toBe(false);
        expect(isUsMarketOpen(new Date('2026-11-04T14:29:00Z'))).toBe(false);
        expect(isUsMarketOpen(new Date('2026-11-04T14:30:00Z'))).toBe(true);
        expect(isUsMarketOpen(new Date('2026-11-04T21:00:00Z'))).toBe(false);
    });
});
