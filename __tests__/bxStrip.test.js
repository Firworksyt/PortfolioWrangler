import {
    BX_STRIP_COLORS,
    bxBarColorKey,
    bxStripGeometry,
    renderBxStripSvg,
    formatBxValue,
} from '../lib/bxStrip.js';

const NVDA = [-18.81, -4.51, -1.87, -3.61, -22.38, -30.32, -24.62, -30.09, -40.85, -42.1];
const colorsFor = vals => vals.map((v, i) => {
    const prev = i === 0 ? null : vals[i - 1];
    if (v >= 0) return prev === null || v > prev ? 'pos_rising' : 'pos_falling';
    return prev === null || v < prev ? 'neg_expanding' : 'neg_contracting';
});
const hist = vals => {
    const c = colorsFor(vals);
    return vals.map((value, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, value, color: c[i] }));
};

describe('bxBarColorKey', () => {
    test('uses the server color when valid', () => {
        expect(bxBarColorKey({ value: 5, color: 'pos_falling' })).toBe('pos_falling');
        expect(bxBarColorKey({ value: -5, color: 'neg_contracting' })).toBe('neg_contracting');
    });
    test('falls back to sign when color missing or unknown (0 counts as positive)', () => {
        expect(bxBarColorKey({ value: -1 })).toBe('neg_expanding');
        expect(bxBarColorKey({ value: 0, color: 'bogus' })).toBe('pos_rising');
    });
    test('palette matches the approved sampled colors', () => {
        expect(BX_STRIP_COLORS).toEqual({
            pos_rising: '#377749', pos_falling: '#284c21',
            neg_expanding: '#440f0c', neg_contracting: '#7c3635',
        });
    });
});

describe('bxStripGeometry', () => {
    test('returns null for missing or empty history', () => {
        expect(bxStripGeometry(undefined)).toBeNull();
        expect(bxStripGeometry([])).toBeNull();
        expect(bxStripGeometry([{ value: NaN }])).toBeNull();
    });

    test('all-negative series: zero line at top, ticks 0 and min, bars hang down', () => {
        const g = bxStripGeometry(hist(NVDA), { width: 240, height: 40, gap: 3 });
        expect(g.bars).toHaveLength(10);
        expect(g.zeroY).toBeCloseTo(0);
        expect(g.ticks.map(t => t.label)).toEqual(['0', '-42']);
        g.bars.forEach(b => expect(b.y).toBeCloseTo(0));
        expect(g.bars[9].h).toBeCloseTo(40);
        expect(g.last.value).toBe(-42.1);
        const last = g.bars[g.bars.length - 1];
        expect(last.x + last.w).toBeCloseTo(240);
    });

    test('zero cross: max, 0 and min ticks with bars on both sides', () => {
        const g = bxStripGeometry(hist([-27.6, -9.68, 5.04, 6.72, -18.45, -28.52, -31.04, -6.29, -27.14, -31.09]),
            { height: 100 });
        expect(g.ticks.map(t => t.label)).toEqual(['7', '0', '-31']);
        const up = g.bars[3];
        expect(up.y + up.h).toBeCloseTo(g.zeroY);
        const down = g.bars[0];
        expect(down.y).toBeCloseTo(g.zeroY);
    });

    test('drops ticks closer than the minimum gap', () => {
        // max 7 vs min -31 at 40px: the 0 tick sits ~7.4px below 7, so 0 is dropped
        const g = bxStripGeometry(hist([-27.6, -9.68, 5.04, 6.72, -18.45, -28.52, -31.04, -6.29, -27.14, -31.09]));
        expect(g.ticks.map(t => t.label)).toEqual(['7', '-31']);
        for (let i = 1; i < g.ticks.length; i++) {
            expect(Math.abs(g.ticks[i].y - g.ticks[i - 1].y)).toBeGreaterThanOrEqual(9);
        }
    });

    test('zero-height bars still render 1px', () => {
        const g = bxStripGeometry(hist([0, 5, 5]));
        expect(g.bars[0].h).toBe(1);
        expect(g.bars[2].colorKey).toBe('pos_falling'); // equal positive
    });
});

describe('renderBxStripSvg / formatBxValue', () => {
    test('renders one rect per bar with palette fills and a dashed zero line', () => {
        const svg = renderBxStripSvg(bxStripGeometry(hist(NVDA)));
        expect((svg.match(/<rect /g) || []).length).toBe(10);
        expect(svg).toContain(BX_STRIP_COLORS.neg_expanding);
        expect(svg).toContain(BX_STRIP_COLORS.neg_contracting);
        expect(svg).toContain('stroke-dasharray="2 2"');
    });
    test('empty geometry renders nothing', () => {
        expect(renderBxStripSvg(null)).toBe('');
    });
    test('formats value with sign and one decimal', () => {
        expect(formatBxValue(4.17)).toBe('+4.2');
        expect(formatBxValue(-42.1)).toBe('-42.1');
        expect(formatBxValue(0)).toBe('0.0');
    });
});
