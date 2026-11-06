import {
    ema,
    rma,
    rsiRma,
    bxShortSeries,
    classifyBxMove,
    computeBxPayload,
    formatBxChip,
    classifyBxBarColor,
    buildBxHistory,
    BX_MIN_BARS,
    BX_HISTORY_BARS,
} from '../lib/bxTrender.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
    const raw = readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
    return JSON.parse(raw);
}

describe('ema (TradingView-compatible)', () => {
    it('seeds with SMA of first length values', () => {
        const series = [1, 2, 3, 4, 5, 6];
        const out = ema(series, 3);
        // seed at index 2 = mean(1,2,3)=2
        expect(out[0]).toBeNull();
        expect(out[1]).toBeNull();
        expect(out[2]).toBeCloseTo(2, 10);
        const alpha = 2 / 4;
        expect(out[3]).toBeCloseTo(alpha * 4 + (1 - alpha) * 2, 10);
    });

    it('skips leading non-finite values when seeding', () => {
        const series = [null, NaN, 10, 20, 30, 40];
        const out = ema(series, 3);
        expect(out[4]).toBeCloseTo(20, 10); // mean(10,20,30)
    });
});

describe('rsiRma edge cases', () => {
    it('returns 50 when both avg gain and loss are zero', () => {
        // flat series after seed → delta 0 → gain=loss=0
        const series = [1, 1, 1, 1, 1, 1, 1];
        const out = rsiRma(series, 3);
        const last = out.filter((v) => v != null).at(-1);
        expect(last).toBe(50);
    });

    it('returns 100 when loss is zero and gain > 0', () => {
        const series = [1, 2, 3, 4, 5, 6, 7];
        const out = rsiRma(series, 3);
        const last = out.filter((v) => v != null).at(-1);
        expect(last).toBe(100);
    });

    it('returns 0 when gain is zero and loss > 0', () => {
        const series = [7, 6, 5, 4, 3, 2, 1];
        const out = rsiRma(series, 3);
        const last = out.filter((v) => v != null).at(-1);
        expect(last).toBe(0);
    });
});

describe('classifyBxMove', () => {
    it('marks rising/away when moving further above zero', () => {
        expect(classifyBxMove(10.77, 7.08)).toEqual({
            direction: 'rising',
            magnitude: 'away',
        });
    });

    it('marks rising/toward when moving closer to zero from below', () => {
        expect(classifyBxMove(-39.94, -42.35)).toEqual({
            direction: 'rising',
            magnitude: 'toward',
        });
    });

    it('marks falling/away when deepening below zero', () => {
        expect(classifyBxMove(-20, -10)).toEqual({
            direction: 'falling',
            magnitude: 'away',
        });
    });

    it('marks flat when unchanged', () => {
        expect(classifyBxMove(5, 5)).toEqual({
            direction: 'flat',
            magnitude: 'flat',
        });
    });
});

describe('formatBxChip', () => {
    it('formats rising away and falling toward', () => {
        expect(formatBxChip('rising', 'away')).toBe('↗ away');
        expect(formatBxChip('falling', 'toward')).toBe('↘ toward');
    });

    it('returns flat when direction is flat', () => {
        expect(formatBxChip('flat', 'flat')).toBe('flat');
    });
});

describe('computeBxPayload warm threshold', () => {
    it('hides BX when fewer than BX_MIN_BARS closes', () => {
        const closes = Array(BX_MIN_BARS - 1).fill(100);
        const dates = closes.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
        const payload = computeBxPayload('TEST', dates, closes);
        expect(payload.bxShort).toBeNull();
        expect(payload.asOf).toBeNull();
    });
});

describe('golden BX short vs Python/yfinance adjusted closes (asOf ~2026-09-04)', () => {
    const cases = [
        { file: 'nke_daily.json', expected: 10.77 },
        { file: 'de_daily.json', expected: 40.05 },
        { file: 'eix_daily.json', expected: -39.94 },
    ];

    for (const { file, expected } of cases) {
        it(`${file} bxShort ≈ ${expected}`, () => {
            const fix = loadFixture(file);
            const idx = fix.dates.indexOf('2026-09-04');
            expect(idx).toBeGreaterThan(0);

            const series = bxShortSeries(fix.closes);
            expect(series[idx]).toBeCloseTo(expected, 1);

            // Payload uses last completed bar in fixture (= 2026-09-04)
            const payload = computeBxPayload(fix.symbol, fix.dates, fix.closes);
            expect(payload.asOf).toBe('2026-09-04');
            expect(payload.bxShort).toBeCloseTo(expected, 1);
            expect(payload.direction).toBeTruthy();
            expect(payload.magnitude).toBeTruthy();
        });
    }

    it('NKE on 2026-09-04 is rising/away vs prior day', () => {
        const fix = loadFixture('nke_daily.json');
        const payload = computeBxPayload(fix.symbol, fix.dates, fix.closes);
        expect(payload.direction).toBe('rising');
        expect(payload.magnitude).toBe('away');
        expect(formatBxChip(payload.direction, payload.magnitude)).toBe('↗ away');
    });

    it('EIX on 2026-09-04 is rising/toward vs prior day', () => {
        const fix = loadFixture('eix_daily.json');
        const payload = computeBxPayload(fix.symbol, fix.dates, fix.closes);
        expect(payload.direction).toBe('rising');
        expect(payload.magnitude).toBe('toward');
    });
});

describe('rma', () => {
    it('seeds with SMA then Wilder-smooths', () => {
        const series = [1, 2, 3, 4, 5];
        const out = rma(series, 3);
        expect(out[2]).toBeCloseTo(2, 10);
        const alpha = 1 / 3;
        expect(out[3]).toBeCloseTo(alpha * 4 + (1 - alpha) * 2, 10);
    });
});

describe('classifyBxBarColor (mini strip)', () => {
    it('colors positive bars by direction vs prior day', () => {
        expect(classifyBxBarColor(12, 8)).toBe('pos_rising');
        expect(classifyBxBarColor(8, 12)).toBe('pos_falling');
    });

    it('colors negative bars by expansion vs prior day', () => {
        expect(classifyBxBarColor(-20, -10)).toBe('neg_expanding');
        expect(classifyBxBarColor(-10, -20)).toBe('neg_contracting');
    });

    it('flat days: equal positive is pos_falling, equal negative is neg_contracting', () => {
        expect(classifyBxBarColor(5, 5)).toBe('pos_falling');
        expect(classifyBxBarColor(-5, -5)).toBe('neg_contracting');
        expect(classifyBxBarColor(0, 0)).toBe('pos_falling');
    });

    it('zero counts as positive', () => {
        expect(classifyBxBarColor(0, -3)).toBe('pos_rising');
        expect(classifyBxBarColor(0, 4)).toBe('pos_falling');
    });

    it('zero cross: first bar on the other side of zero', () => {
        expect(classifyBxBarColor(2, -6)).toBe('pos_rising');
        expect(classifyBxBarColor(-1, 3)).toBe('neg_expanding');
    });

    it('no prior bar colors by sign only', () => {
        expect(classifyBxBarColor(7, null)).toBe('pos_rising');
        expect(classifyBxBarColor(0, undefined)).toBe('pos_rising');
        expect(classifyBxBarColor(-7, null)).toBe('neg_expanding');
    });
});

describe('buildBxHistory', () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);

    it('returns 10 bars oldest → newest, using the 11th prior bar to color the first', () => {
        // idx:      0     1   2   3   4   5  6  7  8  9 10  11  12  13
        const s = [null, -12, -9, -9, -4, -6, 0, 0, 3, 8, 8, 5, -2, -2];
        const h = buildBxHistory(s, dates, 13);
        expect(h).toHaveLength(BX_HISTORY_BARS);
        expect(h[0].date).toBe('2026-10-05');
        expect(h.at(-1).date).toBe('2026-10-14');
        expect(h.map((b) => b.value)).toEqual(s.slice(4));
        expect(h.map((b) => b.color)).toEqual([
            'neg_contracting', // -4 vs -9 (11th prior bar)
            'neg_expanding',   // -6 vs -4
            'pos_rising',      // 0 vs -6 (zero cross, 0 is positive)
            'pos_falling',     // 0 vs 0 (flat positive)
            'pos_rising',      // 3 vs 0
            'pos_rising',      // 8 vs 3
            'pos_falling',     // 8 vs 8 (flat positive)
            'pos_falling',     // 5 vs 8
            'neg_expanding',   // -2 vs 5 (cross below zero)
            'neg_contracting', // -2 vs -2 (flat negative)
        ]);
    });

    it('short history: fewer bars, first colored by sign', () => {
        const s = [null, null, null, null, null, null, null, null, null, null, null, -3, -1, 2];
        const h = buildBxHistory(s, dates, 13);
        expect(h.map((b) => b.color)).toEqual(['neg_expanding', 'neg_contracting', 'pos_rising']);
    });
});

describe('computeBxPayload history (frozen fixtures)', () => {
    for (const file of ['nke_daily.json', 'de_daily.json', 'eix_daily.json']) {
        it(`${file} returns 10 colored bars ending at asOf`, () => {
            const fix = loadFixture(file);
            const payload = computeBxPayload(fix.symbol, fix.dates, fix.closes);
            const series = bxShortSeries(fix.closes);
            const end = fix.dates.indexOf(payload.asOf);

            expect(payload.history).toHaveLength(BX_HISTORY_BARS);
            expect(payload.history.at(-1).date).toBe(payload.asOf);
            expect(payload.history.at(-1).value).toBe(payload.bxShort);
            payload.history.forEach((bar, k) => {
                const idx = end - (BX_HISTORY_BARS - 1) + k;
                expect(bar.date).toBe(fix.dates[idx]);
                expect(bar.value).toBe(series[idx]);
                expect(bar.color).toBe(classifyBxBarColor(series[idx], series[idx - 1]));
            });
        });
    }

    it('keeps existing fields unchanged', () => {
        const fix = loadFixture('nke_daily.json');
        const payload = computeBxPayload(fix.symbol, fix.dates, fix.closes);
        expect(Object.keys(payload)).toEqual(['symbol', 'asOf', 'bxShort', 'direction', 'magnitude', 'history']);
        expect(payload.direction).toBe('rising');
        expect(payload.magnitude).toBe('away');
    });

    it('empty payload has an empty history', () => {
        const payload = computeBxPayload('TEST', [], []);
        expect(payload.history).toEqual([]);
    });
});
