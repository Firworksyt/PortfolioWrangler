import { parseIvrBound, ivrFilterState, passesIvrFilter } from '../lib/ivrFilter.js';

describe('parseIvrBound', () => {
    it('treats empty, whitespace and missing as no bound', () => {
        expect(parseIvrBound('')).toBeNull();
        expect(parseIvrBound('   ')).toBeNull();
        expect(parseIvrBound(null)).toBeNull();
        expect(parseIvrBound(undefined)).toBeNull();
    });

    it('parses numbers, including decimals and values over 100', () => {
        expect(parseIvrBound('30')).toBe(30);
        expect(parseIvrBound(' 42.5 ')).toBe(42.5);
        expect(parseIvrBound('150')).toBe(150);
        expect(parseIvrBound(0)).toBe(0);
        expect(parseIvrBound('0')).toBe(0);
    });

    it('ignores non-numeric text', () => {
        expect(parseIvrBound('abc')).toBeNull();
        expect(parseIvrBound('NaN')).toBeNull();
    });
});

describe('ivrFilterState', () => {
    it('is inactive when both bounds are empty', () => {
        expect(ivrFilterState('', '')).toEqual({ min: null, max: null, invalid: false, active: false });
    });

    it('is active with only a min or only a max', () => {
        expect(ivrFilterState('30', '')).toMatchObject({ min: 30, max: null, active: true, invalid: false });
        expect(ivrFilterState('', '60')).toMatchObject({ min: null, max: 60, active: true, invalid: false });
    });

    it('allows min equal to max', () => {
        expect(ivrFilterState('50', '50')).toMatchObject({ active: true, invalid: false });
    });

    it('flags min > max as invalid and inactive', () => {
        expect(ivrFilterState('70', '20')).toMatchObject({ min: 70, max: 20, invalid: true, active: false });
    });
});

describe('passesIvrFilter', () => {
    const f = (min, max) => ivrFilterState(min, max);

    it('shows everything, including names without IVR, when no bound is set', () => {
        expect(passesIvrFilter(10, f('', ''))).toBe(true);
        expect(passesIvrFilter(null, f('', ''))).toBe(true);
        expect(passesIvrFilter(undefined, f('', ''))).toBe(true);
    });

    it('min only keeps IVR >= min (inclusive)', () => {
        expect(passesIvrFilter(30, f('30', ''))).toBe(true);
        expect(passesIvrFilter(29, f('30', ''))).toBe(false);
        expect(passesIvrFilter(81.7, f('30', ''))).toBe(true);
    });

    it('max only keeps IVR <= max (inclusive)', () => {
        expect(passesIvrFilter(60, f('', '60'))).toBe(true);
        expect(passesIvrFilter(61, f('', '60'))).toBe(false);
        expect(passesIvrFilter(5, f('', '60'))).toBe(true);
    });

    it('both bounds keep names inside the range', () => {
        expect(passesIvrFilter(76.4, f('70', '80'))).toBe(true);
        expect(passesIvrFilter(81.7, f('70', '80'))).toBe(false);
        expect(passesIvrFilter(69, f('70', '80'))).toBe(false);
    });

    it('matches the rounded number shown on the card', () => {
        // card reads "IVR 82" for 81.7
        expect(passesIvrFilter(81.7, f('82', ''))).toBe(true);
        expect(passesIvrFilter(81.7, f('', '82'))).toBe(true);
        expect(passesIvrFilter(81.4, f('82', ''))).toBe(false);
        expect(passesIvrFilter(60.4, f('', '60'))).toBe(true);
        expect(passesIvrFilter(60.5, f('', '60'))).toBe(false);
        // decimal bounds compare against the whole number on the card
        expect(passesIvrFilter(81.7, f('81.5', ''))).toBe(true);
        expect(passesIvrFilter(81.7, f('82.5', ''))).toBe(false);
    });

    it('does not clamp at 100 like the gauge does', () => {
        expect(passesIvrFilter(101.3, f('100', ''))).toBe(true);
        expect(passesIvrFilter(101.3, f('', '100'))).toBe(false);
    });

    it('hides names without IVR while any bound is set', () => {
        expect(passesIvrFilter(null, f('30', ''))).toBe(false);
        expect(passesIvrFilter(undefined, f('', '60'))).toBe(false);
        expect(passesIvrFilter(NaN, f('0', '100'))).toBe(false);
    });

    it('leaves the list unfiltered when min > max', () => {
        expect(passesIvrFilter(50, f('70', '20'))).toBe(true);
        expect(passesIvrFilter(null, f('70', '20'))).toBe(true);
    });
});
