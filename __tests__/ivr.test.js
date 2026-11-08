import { jest } from '@jest/globals';
import { buildIvrPayload, parseIvrSymbols } from '../lib/ivr.js';
import {
    AuthError, NotConfiguredError, RateLimitedError, TimeoutError, UpstreamError,
} from '../lib/tastytrade/index.js';

const quiet = { error: jest.fn() };

function stubTt({ configured = true, result, error } = {}) {
    return {
        isConfigured: () => configured,
        getMarketMetrics: jest.fn(async () => {
            if (error) throw error;
            return result;
        }),
    };
}

const items = [
    { symbol: 'NVDA', ivRank: 81.7, ivPercentile: 99.9, iv: 61.9, asOf: '2026-11-06T21:00:00Z' },
    { symbol: 'DE', ivRank: 101.3, ivPercentile: 99.4, iv: 46.3, asOf: '2026-11-06T21:00:00Z' },
];

describe('buildIvrPayload', () => {
    it('is unavailable without a module or credentials, and makes no call', async () => {
        expect(await buildIvrPayload(null, ['NVDA'], quiet)).toEqual({ available: false, source: 'tastytrade', bySymbol: {} });
        const tt = stubTt({ configured: false });
        expect((await buildIvrPayload(tt, ['NVDA'], quiet)).available).toBe(false);
        expect(tt.getMarketMetrics).not.toHaveBeenCalled();
    });

    it('maps items into bySymbol and leaves missing symbols out', async () => {
        const tt = stubTt({ result: { items, missing: ['NOOPT'], stale: false, fetchedAt: 'x' } });
        const out = await buildIvrPayload(tt, ['nvda', 'DE', 'NOOPT'], quiet);
        expect(tt.getMarketMetrics).toHaveBeenCalledTimes(1);
        expect(tt.getMarketMetrics).toHaveBeenCalledWith(['NVDA', 'DE', 'NOOPT']);
        expect(out).toEqual({
            available: true,
            source: 'tastytrade',
            bySymbol: {
                NVDA: { ivr: 81.7, ivPercentile: 99.9, iv: 61.9, asOf: '2026-11-06T21:00:00Z', stale: false },
                DE: { ivr: 101.3, ivPercentile: 99.4, iv: 46.3, asOf: '2026-11-06T21:00:00Z', stale: false },
            },
        });
    });

    it('passes the stale flag through on last-good values', async () => {
        const tt = stubTt({ result: { items, missing: [], stale: true, fetchedAt: 'x' } });
        const out = await buildIvrPayload(tt, ['NVDA', 'DE'], quiet);
        expect(out.bySymbol.NVDA.stale).toBe(true);
        expect(out.bySymbol.DE.stale).toBe(true);
    });

    it.each([
        ['NotConfiguredError', new NotConfiguredError()],
        ['AuthError', new AuthError('auth failed')],
    ])('maps %s to unavailable', async (_name, error) => {
        const out = await buildIvrPayload(stubTt({ error }), ['NVDA'], quiet);
        expect(out).toEqual({ available: false, source: 'tastytrade', bySymbol: {} });
    });

    it.each([
        ['UpstreamError', new UpstreamError('upstream 502')],
        ['TimeoutError', new TimeoutError('timeout')],
        ['RateLimitedError', new RateLimitedError('429')],
        ['plain Error', new Error('boom')],
    ])('maps %s with nothing cached to available with no symbols', async (_name, error) => {
        const out = await buildIvrPayload(stubTt({ error }), ['NVDA'], quiet);
        expect(out).toEqual({ available: true, source: 'tastytrade', bySymbol: {} });
    });

    it('logs only the error name, never the message', async () => {
        const logger = { error: jest.fn() };
        await buildIvrPayload(stubTt({ error: new UpstreamError('detail-should-not-log') }), ['NVDA'], logger);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error.mock.calls[0][0]).not.toContain('detail-should-not-log');
    });

    it('skips the call for an empty symbol list', async () => {
        const tt = stubTt({ result: { items: [], missing: [], stale: false } });
        expect(await buildIvrPayload(tt, [], quiet)).toEqual({ available: true, source: 'tastytrade', bySymbol: {} });
        expect(tt.getMarketMetrics).not.toHaveBeenCalled();
    });
});

describe('parseIvrSymbols', () => {
    it('parses a comma list, upper-cases and dedupes', () => {
        expect(parseIvrSymbols('nvda, SPY,,nvda', ['X'])).toEqual(['NVDA', 'SPY']);
    });
    it('falls back to the default list', () => {
        expect(parseIvrSymbols(undefined, ['NVDA', 'DE'])).toEqual(['NVDA', 'DE']);
        expect(parseIvrSymbols('', ['NVDA'])).toEqual(['NVDA']);
        expect(parseIvrSymbols(['a', 'b'], ['NVDA'])).toEqual(['NVDA']);
    });
});
