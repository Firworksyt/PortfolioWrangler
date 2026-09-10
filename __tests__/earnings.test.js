import {
    coerceDate,
    pickNextEarningsDate,
    formatEarningsLabel,
    buildEarningsPayload,
} from '../lib/earnings.js';

describe('earnings helpers', () => {
    const now = new Date(2026, 8, 10); // local Sep 10, 2026

    test('coerceDate handles Date, ms, seconds, ISO', () => {
        expect(coerceDate(new Date('2026-09-12T12:00:00Z')).toISOString()).toContain('2026-09-12');
        expect(coerceDate(Date.parse('2026-09-12T00:00:00Z')).getTime()).toBe(Date.parse('2026-09-12T00:00:00Z'));
        expect(coerceDate(1726185600).getFullYear()).toBeGreaterThan(2010);
        expect(coerceDate('not-a-date')).toBeNull();
        expect(coerceDate(null)).toBeNull();
    });

    test('pickNextEarningsDate skips past and picks earliest upcoming', () => {
        const next = pickNextEarningsDate(
            ['2026-09-01T00:00:00', '2026-09-12T00:00:00', '2026-09-15T00:00:00'],
            now,
        );
        expect(next.getFullYear()).toBe(2026);
        expect(next.getMonth()).toBe(8);
        expect(next.getDate()).toBe(12);
    });

    test('pickNextEarningsDate returns null when all past or empty', () => {
        expect(pickNextEarningsDate(['2026-09-01'], now)).toBeNull();
        expect(pickNextEarningsDate([], now)).toBeNull();
        expect(pickNextEarningsDate(null, now)).toBeNull();
    });

    test('formatEarningsLabel today/tomorrow/M/D', () => {
        expect(formatEarningsLabel(new Date(2026, 8, 10), now)).toBe('Earn today');
        expect(formatEarningsLabel(new Date(2026, 8, 11), now)).toBe('Earn tomorrow');
        expect(formatEarningsLabel(new Date(2026, 8, 12), now)).toBe('Earn 9/12');
    });

    test('buildEarningsPayload hides when unknown', () => {
        expect(buildEarningsPayload('AAPL', null, now)).toEqual({
            symbol: 'AAPL',
            date: null,
            label: null,
            isEstimate: false,
        });
    });

    test('buildEarningsPayload formats estimate', () => {
        const payload = buildEarningsPayload(
            'AAPL',
            {
                earnings: {
                    earningsDate: [new Date(2026, 8, 12)],
                    isEarningsDateEstimate: true,
                },
            },
            now,
        );
        expect(payload.label).toBe('Earn ~9/12');
        expect(payload.isEstimate).toBe(true);
        expect(payload.date).toBeTruthy();
    });
});
