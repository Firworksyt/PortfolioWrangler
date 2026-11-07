import {
    calendarDateInZone,
    daysUntilEarnings,
    formatEarningsChip,
} from '../lib/earningsDays.js';

// Instants are given in UTC so the tests do not depend on the machine's zone.
const at = (iso) => new Date(iso);

describe('calendarDateInZone', () => {
    test('uses the Chicago calendar date, not UTC', () => {
        // 10:30 PM CST Nov 6 is already Nov 7 in UTC
        expect(calendarDateInZone(at('2026-11-07T04:30:00Z'))).toBe('2026-11-06');
        expect(calendarDateInZone(at('2026-11-07T06:00:00Z'))).toBe('2026-11-07');
    });
});

describe('daysUntilEarnings', () => {
    const noonNov6 = at('2026-11-06T18:00:00Z'); // 12:00 PM CST

    test('today is 0 and tomorrow is 1', () => {
        expect(daysUntilEarnings('2026-11-06', noonNov6)).toBe(0);
        expect(daysUntilEarnings('2026-11-07', noonNov6)).toBe(1);
    });

    test('counts calendar days ahead', () => {
        expect(daysUntilEarnings('2026-11-17', noonNov6)).toBe(11);
    });

    test('late evening in Chicago that is already the next day in UTC', () => {
        const lateNov6 = at('2026-11-07T05:30:00Z'); // 11:30 PM CST Nov 6
        expect(daysUntilEarnings('2026-11-06', lateNov6)).toBe(0);
        expect(daysUntilEarnings('2026-11-07', lateNov6)).toBe(1);
        expect(daysUntilEarnings('2026-11-17', lateNov6)).toBe(11);
    });

    test('run-up to the spring-forward DST change (Mar 8, 2026)', () => {
        const mar6 = at('2026-03-06T23:00:00Z'); // 5 PM CST
        expect(daysUntilEarnings('2026-03-08', mar6)).toBe(2);
        expect(daysUntilEarnings('2026-03-09', mar6)).toBe(3);
        expect(daysUntilEarnings('2026-03-10', at('2026-03-08T05:30:00Z'))).toBe(3); // 11:30 PM CST Mar 7
    });

    test('run-up to the fall-back DST change (Nov 1, 2026)', () => {
        const oct30 = at('2026-10-31T04:30:00Z'); // 11:30 PM CDT Oct 30
        expect(daysUntilEarnings('2026-11-01', oct30)).toBe(2);
        expect(daysUntilEarnings('2026-11-02', oct30)).toBe(3);
    });

    test('month and year boundaries', () => {
        expect(daysUntilEarnings('2026-12-01', at('2026-11-30T18:00:00Z'))).toBe(1);
        expect(daysUntilEarnings('2027-01-05', at('2026-12-31T18:00:00Z'))).toBe(5);
        // 11 PM CST Dec 31 is Jan 1 in UTC
        expect(daysUntilEarnings('2027-01-01', at('2027-01-01T05:00:00Z'))).toBe(1);
        expect(daysUntilEarnings('2028-03-01', at('2028-02-28T18:00:00Z'))).toBe(2); // leap year
    });

    test('past, missing and invalid dates', () => {
        expect(daysUntilEarnings('2026-11-01', noonNov6)).toBe(-5);
        expect(daysUntilEarnings(null, noonNov6)).toBeNull();
        expect(daysUntilEarnings('11/17/2026', noonNov6)).toBeNull();
    });
});

describe('formatEarningsChip', () => {
    const noonNov6 = at('2026-11-06T18:00:00Z');

    test('upcoming date shows date and day count', () => {
        expect(formatEarningsChip({ date: '2026-11-17', label: 'Earn 11/17' }, noonNov6)).toBe('Earn 11/17 11d');
    });

    test('estimated date keeps the ~ marker', () => {
        expect(formatEarningsChip({ date: '2026-11-25', label: 'Earn ~11/25', isEstimate: true }, noonNov6))
            .toBe('Earn ~11/25 19d');
    });

    test('today and tomorrow use words', () => {
        expect(formatEarningsChip({ date: '2026-11-06', label: 'Earn 11/6' }, noonNov6)).toBe('Earn today');
        expect(formatEarningsChip({ date: '2026-11-07', label: 'Earn 11/7' }, noonNov6)).toBe('Earn tomorrow');
    });

    test('past or missing dates keep the server label; no label hides the chip', () => {
        expect(formatEarningsChip({ date: '2026-11-01', label: 'Earn 11/1' }, noonNov6)).toBe('Earn 11/1');
        expect(formatEarningsChip({ date: null, label: 'Earn soon' }, noonNov6)).toBe('Earn soon');
        expect(formatEarningsChip({ date: null, label: null }, noonNov6)).toBeNull();
        expect(formatEarningsChip(null, noonNov6)).toBeNull();
    });
});
