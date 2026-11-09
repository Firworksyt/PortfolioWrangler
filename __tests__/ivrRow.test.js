import { formatIvrRow, formatIvrAsOf, ivrBand, IVR_BAND_COLORS } from '../lib/ivrRow.js';

const payload = (bySymbol, extra = {}) => ({ available: true, source: 'tastytrade', bySymbol, ...extra });
const nvda = { ivr: 81.7, ivPercentile: 99.9, iv: 61.9, asOf: '2026-11-06T21:00:00Z', stale: false };

describe('formatIvrRow', () => {
    it('hides when the payload is missing', () => {
        expect(formatIvrRow(null, 'NVDA')).toBeNull();
        expect(formatIvrRow(undefined, 'NVDA')).toBeNull();
    });

    it('hides when the source is not available', () => {
        expect(formatIvrRow({ available: false, source: 'tastytrade', bySymbol: {} }, 'NVDA')).toBeNull();
        expect(formatIvrRow({ available: false, bySymbol: { NVDA: nvda } }, 'NVDA')).toBeNull();
    });

    it('hides when the symbol is not in bySymbol (no options / no data)', () => {
        expect(formatIvrRow(payload({ NVDA: nvda }), 'SPY')).toBeNull();
    });

    it('hides when ivr is not a number', () => {
        expect(formatIvrRow(payload({ NVDA: { ...nvda, ivr: null } }), 'NVDA')).toBeNull();
    });

    it('formats a normal value', () => {
        const v = formatIvrRow(payload({ NVDA: nvda }), 'NVDA');
        expect(v.ivrText).toBe('82');
        expect(v.gaugePct).toBe(81.7);
        expect(v.ivText).toBe('IV 61.9%');
        expect(v.band).toBe('high');
        expect(v.color).toBe(IVR_BAND_COLORS.high);
        expect(v.stale).toBe(false);
        expect(v.title).toBe('IV Rank 81.7 · IV percentile 99.9\nSource: tastytrade\nAs of Nov 6, 3:00 PM CT');
    });

    it('shows the real number above 100 and clamps the gauge', () => {
        const v = formatIvrRow(payload({ DE: { ...nvda, ivr: 101.3 } }), 'DE');
        expect(v.ivrText).toBe('101');
        expect(v.gaugePct).toBe(100);
        expect(v.title).toContain('IV Rank 101.3');
    });

    it('clamps a negative gauge at 0', () => {
        expect(formatIvrRow(payload({ X: { ...nvda, ivr: -2 } }), 'X').gaugePct).toBe(0);
    });

    it('marks stale values and says so in the tooltip', () => {
        const v = formatIvrRow(payload({ NVDA: { ...nvda, stale: true } }), 'NVDA');
        expect(v.stale).toBe(true);
        expect(v.title).toContain('Source: tastytrade (last known value)');
    });

    it('omits IV percentile and IV text when missing', () => {
        const v = formatIvrRow(payload({ NVDA: { ivr: 12, ivPercentile: null, iv: null, asOf: null, stale: false } }), 'NVDA');
        expect(v.ivText).toBeNull();
        expect(v.title).toBe('IV Rank 12.0\nSource: tastytrade');
    });
});

describe('ivrBand', () => {
    it('splits at 30 and 50', () => {
        expect(ivrBand(0)).toBe('low');
        expect(ivrBand(29.9)).toBe('low');
        expect(ivrBand(30)).toBe('mid');
        expect(ivrBand(49.9)).toBe('mid');
        expect(ivrBand(50)).toBe('high');
        expect(ivrBand(140)).toBe('high');
    });
});

describe('formatIvrAsOf', () => {
    it('formats in Chicago time (CST)', () => {
        expect(formatIvrAsOf('2026-11-06T21:00:00Z')).toBe('Nov 6, 3:00 PM CT');
        expect(formatIvrAsOf('2026-11-06T21:00:00.000+00:00')).toBe('Nov 6, 3:00 PM CT');
    });
    it('formats in Chicago time (CDT) and across the date line', () => {
        expect(formatIvrAsOf('2026-07-01T20:00:00Z')).toBe('Jul 1, 3:00 PM CT');
        expect(formatIvrAsOf('2026-11-07T03:30:00Z')).toBe('Nov 6, 9:30 PM CT');
    });
    it('returns null for missing or invalid input', () => {
        expect(formatIvrAsOf(null)).toBeNull();
        expect(formatIvrAsOf('')).toBeNull();
        expect(formatIvrAsOf('not-a-date')).toBeNull();
    });
    it('leaves the as-of line out of the tooltip when invalid', () => {
        const v = formatIvrRow({ available: true, bySymbol: { X: { ivr: 40, iv: 20, asOf: 'bad', stale: false } } }, 'X');
        expect(v.title).not.toContain('As of');
    });
});
