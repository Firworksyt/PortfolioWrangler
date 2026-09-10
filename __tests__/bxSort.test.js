import { absBx, compareByAbsBx, matchesBxFilter } from '../lib/bxSort.js';

describe('absBx', () => {
    it('returns absolute value for finite bxShort', () => {
        expect(absBx({ bxShort: -12.5 })).toBe(12.5);
        expect(absBx({ bxShort: 3 })).toBe(3);
    });

    it('returns null for missing/non-finite', () => {
        expect(absBx(null)).toBeNull();
        expect(absBx({})).toBeNull();
        expect(absBx({ bxShort: null })).toBeNull();
        expect(absBx({ bxShort: NaN })).toBeNull();
    });
});

describe('compareByAbsBx', () => {
    it('sorts higher |BX| first', () => {
        const rows = [
            { bxShort: 5 },
            { bxShort: -40 },
            { bxShort: 10 },
        ];
        rows.sort(compareByAbsBx);
        expect(rows.map((r) => r.bxShort)).toEqual([-40, 10, 5]);
    });

    it('sinks null BX to the bottom', () => {
        const rows = [
            { bxShort: null },
            { bxShort: 2 },
            {},
            { bxShort: -9 },
        ];
        rows.sort(compareByAbsBx);
        expect(absBx(rows[0])).toBe(9);
        expect(absBx(rows[1])).toBe(2);
        expect(absBx(rows[2])).toBeNull();
        expect(absBx(rows[3])).toBeNull();
    });
});

describe('matchesBxFilter', () => {
    it('all passes everything including null', () => {
        expect(matchesBxFilter(null, 'all')).toBe(true);
        expect(matchesBxFilter({ magnitude: 'away' }, 'all')).toBe(true);
    });

    it('away/toward require matching magnitude; null fails', () => {
        expect(matchesBxFilter({ magnitude: 'away' }, 'away')).toBe(true);
        expect(matchesBxFilter({ magnitude: 'toward' }, 'away')).toBe(false);
        expect(matchesBxFilter({ magnitude: 'flat' }, 'toward')).toBe(false);
        expect(matchesBxFilter(null, 'away')).toBe(false);
        expect(matchesBxFilter({ magnitude: null }, 'toward')).toBe(false);
    });
});
