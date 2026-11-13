import { execFileSync } from 'node:child_process';
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
        const localTime = new Intl.DateTimeFormat(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset',
        }).format(new Date(nvda.asOf));
        expect(v.title).toBe(`IV Rank 81.7 · IV percentile 99.9\nSource: tastytrade\nAs of ${localTime}`);
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
    const environments = [
        {
            timeZone: 'America/New_York', locale: 'en_US.UTF-8', resolvedLocale: 'en-US',
            cases: [
                ['2026-01-15T12:00:00Z', 'Jan 15, 2026, 7:00 AM GMT-5'],
                ['2026-07-15T12:00:00Z', 'Jul 15, 2026, 8:00 AM GMT-4'],
                ['2026-03-08T06:59:00Z', 'Mar 8, 2026, 1:59 AM GMT-5'],
                ['2026-03-08T07:00:00Z', 'Mar 8, 2026, 3:00 AM GMT-4'],
                ['2026-11-01T05:30:00Z', 'Nov 1, 2026, 1:30 AM GMT-4'],
                ['2026-11-01T06:30:00Z', 'Nov 1, 2026, 1:30 AM GMT-5'],
                ['2026-11-07T03:30:00Z', 'Nov 6, 2026, 10:30 PM GMT-5'],
            ],
        },
        {
            timeZone: 'Europe/Berlin', locale: 'de_DE.UTF-8', resolvedLocale: 'de-DE',
            cases: [
                ['2026-01-15T12:00:00Z', '15. Jan. 2026, 13:00 GMT+1'],
                ['2026-07-15T12:00:00Z', '15. Juli 2026, 14:00 GMT+2'],
                ['2026-03-29T00:59:00Z', '29. März 2026, 01:59 GMT+1'],
                ['2026-03-29T01:00:00Z', '29. März 2026, 03:00 GMT+2'],
                ['2026-10-25T00:30:00Z', '25. Okt. 2026, 02:30 GMT+2'],
                ['2026-10-25T01:30:00Z', '25. Okt. 2026, 02:30 GMT+1'],
                ['2026-11-07T03:30:00Z', '7. Nov. 2026, 04:30 GMT+1'],
            ],
        },
    ];

    it.each(environments)('uses runtime defaults in $timeZone / $resolvedLocale, including DST', ({ timeZone, locale, resolvedLocale, cases }) => {
        // Separate processes set real runtime defaults without mocking Intl or changing this process.
        const moduleUrl = new URL('../lib/ivrRow.js', import.meta.url).href;
        const program = `
            import { formatIvrAsOf, formatIvrRow } from ${JSON.stringify(moduleUrl)};
            const cases = ${JSON.stringify(cases)};
            const inputs = cases.map(([iso]) => iso);
            const entries = inputs.map(asOf => Object.freeze({ ivr: 40, asOf }));
            const values = entries.map(entry => {
                const payload = Object.freeze({ available: true, bySymbol: Object.freeze({ X: entry }) });
                return { formatted: formatIvrAsOf(entry.asOf), title: formatIvrRow(payload, 'X').title, asOf: entry.asOf };
            });
            console.log(JSON.stringify({ defaults: new Intl.DateTimeFormat().resolvedOptions(), values }));
        `;
        const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program], {
            env: { ...process.env, TZ: timeZone, LANG: locale, LC_ALL: locale }, encoding: 'utf8',
        }));
        expect(result.defaults.timeZone).toBe(timeZone);
        expect(result.defaults.locale).toBe(resolvedLocale);
        expect(result.values).toEqual(cases.map(([iso, expected]) => ({
            formatted: expected,
            title: `IV Rank 40.0\nSource: tastytrade\nAs of ${expected}`,
            asOf: iso,
        })));
    });

    it('treats equivalent ISO offsets as the same instant without rewriting the source', () => {
        const iso = '2026-11-06T16:00:00-05:00';
        const entry = Object.freeze({ ivr: 40, asOf: iso });
        const data = Object.freeze({ available: true, bySymbol: Object.freeze({ X: entry }) });
        expect(formatIvrAsOf(iso)).toBe(formatIvrAsOf('2026-11-06T21:00:00Z'));
        expect(formatIvrRow(data, 'X').title).toContain(`As of ${formatIvrAsOf(iso)}`);
        expect(data.bySymbol.X.asOf).toBe(iso);
    });

    it.each([undefined, null, '', 'not-a-date'])('omits missing or invalid as-of input %p', asOf => {
        expect(formatIvrAsOf(asOf)).toBeNull();
        const v = formatIvrRow(payload({ X: { ivr: 40, asOf } }), 'X');
        expect(v.title).not.toContain('As of');
    });
});
