import { formatVolume, formatMarketCap, buildFundamentalsHTML } from '../lib/formatters.js';

describe('formatVolume', () => {
    it('should return null for null input', () => {
        expect(formatVolume(null)).toBeNull();
        expect(formatVolume(undefined)).toBeNull();
    });

    it('should format values under 1K as plain string', () => {
        expect(formatVolume(0)).toBe('0');
        expect(formatVolume(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
        expect(formatVolume(1000)).toBe('1K');
        expect(formatVolume(1500)).toBe('2K');
        expect(formatVolume(999999)).toBe('1000K');
    });

    it('should format millions with M suffix', () => {
        expect(formatVolume(1000000)).toBe('1.0M');
        expect(formatVolume(12300000)).toBe('12.3M');
        expect(formatVolume(999999999)).toBe('1000.0M');
    });

    it('should format billions with B suffix', () => {
        expect(formatVolume(1000000000)).toBe('1.0B');
        expect(formatVolume(2500000000)).toBe('2.5B');
    });
});

describe('formatMarketCap', () => {
    it('should return null for null input', () => {
        expect(formatMarketCap(null)).toBeNull();
        expect(formatMarketCap(undefined)).toBeNull();
    });

    it('should format trillions with T suffix', () => {
        expect(formatMarketCap(1e12)).toBe('$1.00T');
        expect(formatMarketCap(2.5e12)).toBe('$2.50T');
    });

    it('should format billions with B suffix', () => {
        expect(formatMarketCap(1.5e9)).toBe('$1.5B');
        expect(formatMarketCap(500e9)).toBe('$500.0B');
    });

    it('should format millions with M suffix', () => {
        expect(formatMarketCap(500e6)).toBe('$500M');
        expect(formatMarketCap(1.2e6)).toBe('$1M');
    });

    it('should format small values with dollar sign and locale string', () => {
        expect(formatMarketCap(500000)).toBe('$500,000');
    });
});

describe('buildFundamentalsHTML', () => {
    const fullFundamentals = {
        marketCap: 2.5e12,
        fiftyTwoWeekHigh: 200.00,
        fiftyTwoWeekLow: 120.00,
        trailingPE: 28.5,
        forwardPE: 25.0,
        regularMarketVolume: 45e6,
        averageVolume: 55e6,
    };

    it('should include market cap item', () => {
        const html = buildFundamentalsHTML(fullFundamentals);
        expect(html).toContain('Mkt Cap');
        expect(html).toContain('$2.50T');
    });

    it('should include 52-week range item', () => {
        const html = buildFundamentalsHTML(fullFundamentals);
        expect(html).toContain('52W');
        expect(html).toContain('$120.00');
        expect(html).toContain('$200.00');
    });

    it('should prefer trailing P/E over forward P/E', () => {
        const html = buildFundamentalsHTML(fullFundamentals);
        expect(html).toContain('>P/E<');
        expect(html).toContain('28.5');
        expect(html).not.toContain('Fwd P/E');
    });

    it('should fall back to forward P/E when trailing is null', () => {
        const html = buildFundamentalsHTML({ ...fullFundamentals, trailingPE: null });
        expect(html).toContain('Fwd P/E');
        expect(html).toContain('25.0');
    });

    it('should skip P/E items when both are null', () => {
        const html = buildFundamentalsHTML({ ...fullFundamentals, trailingPE: null, forwardPE: null });
        expect(html).not.toContain('P/E');
    });

    it('should include volume items', () => {
        const html = buildFundamentalsHTML(fullFundamentals);
        expect(html).toContain('>Vol<');
        expect(html).toContain('45.0M');
        expect(html).toContain('Avg Vol');
        expect(html).toContain('55.0M');
    });

    it('should return empty string when all fields are null', () => {
        const html = buildFundamentalsHTML({
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            trailingPE: null,
            forwardPE: null,
            regularMarketVolume: null,
            averageVolume: null,
        });
        expect(html).toBe('');
    });

    it('should skip 52W range if only one bound is present', () => {
        const html = buildFundamentalsHTML({ ...fullFundamentals, fiftyTwoWeekLow: null });
        expect(html).not.toContain('52W');
    });

    it('should wrap each item in fund-item span with fund-label and fund-value', () => {
        const html = buildFundamentalsHTML(fullFundamentals);
        expect(html).toContain('class="fund-item"');
        expect(html).toContain('class="fund-label"');
        expect(html).toContain('class="fund-value"');
    });
});
