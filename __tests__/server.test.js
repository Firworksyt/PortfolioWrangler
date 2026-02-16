import yaml from 'js-yaml';
import {
    regularMarketQuote,
    preMarketQuote,
    postMarketQuote,
    negativeChangeQuote,
    shortNameOnlyQuote,
    noNameQuote
} from './mocks/yahooFinance.js';

/**
 * Business logic functions extracted from server.js for testing.
 * These mirror the calculations performed in the server endpoints.
 */

/**
 * Calculate final price values from a Yahoo Finance quote.
 * This mirrors the logic in server.js updateStock and /api/stock/:symbol
 */
function calculatePriceFromQuote(quote) {
    const regularPrice = quote.regularMarketPrice;
    const previousClose = quote.regularMarketPreviousClose;
    const regularChange = quote.regularMarketChange;
    const regularChangePercent = quote.regularMarketChangePercent;

    // Get pre/post market data if available
    const isPreMarket = quote.preMarketPrice !== undefined;
    const isPostMarket = quote.postMarketPrice !== undefined;
    const extendedPrice = isPreMarket ? quote.preMarketPrice : (isPostMarket ? quote.postMarketPrice : null);
    const extendedChange = isPreMarket ? quote.preMarketChange : (isPostMarket ? quote.postMarketChange : null);

    // Calculate final values
    const finalPrice = extendedPrice || regularPrice;
    const finalChange = (extendedPrice ? extendedChange + regularChange : regularChange) || 0;
    const finalChangePercent = (finalChange / previousClose) * 100;

    return {
        finalPrice,
        finalChange,
        finalChangePercent,
        regularMarketPrice: regularPrice,
        regularMarketChange: regularChange,
        regularMarketChangePercent: regularChangePercent,
        isExtendedHours: isPreMarket || isPostMarket,
        extendedHoursPrice: extendedPrice,
        extendedHoursChange: extendedChange,
        marketState: quote.marketState
    };
}

/**
 * Format API response from quote data.
 * This mirrors the response format in /api/stock/:symbol
 */
function formatApiResponse(quote) {
    const priceData = calculatePriceFromQuote(quote);

    return {
        'Global Quote': {
            '05. price': priceData.finalPrice.toString(),
            '09. change': priceData.finalChange.toString(),
            '10. change percent': priceData.finalChangePercent.toFixed(2) + '%'
        },
        extendedHours: {
            isExtendedHours: priceData.isExtendedHours,
            price: priceData.extendedHoursPrice,
            change: priceData.extendedHoursChange,
            marketState: priceData.marketState
        },
        companyName: quote.longName || quote.shortName || quote.symbol
    };
}

/**
 * Parse YAML config and extract watchlist.
 * This mirrors the config loading logic in server.js
 */
function parseConfig(yamlContent) {
    const config = yaml.load(yamlContent);
    return {
        watchlist: config?.watchlist || [],
        port: config?.server?.port || 3000
    };
}

describe('Price Calculation', () => {
    describe('Regular market hours', () => {
        it('should use regular market price when no extended hours data', () => {
            const result = calculatePriceFromQuote(regularMarketQuote);

            expect(result.finalPrice).toBe(150.25);
            expect(result.isExtendedHours).toBe(false);
            expect(result.extendedHoursPrice).toBeNull();
        });

        it('should calculate change from regular market data', () => {
            const result = calculatePriceFromQuote(regularMarketQuote);

            expect(result.finalChange).toBe(1.75);
            expect(result.finalChangePercent).toBeCloseTo(1.178, 2);
        });

        it('should handle negative changes', () => {
            const result = calculatePriceFromQuote(negativeChangeQuote);

            expect(result.finalPrice).toBe(245.00);
            expect(result.finalChange).toBe(-5.00);
            expect(result.finalChangePercent).toBe(-2.0);
        });
    });

    describe('Pre-market hours', () => {
        it('should use pre-market price when available', () => {
            const result = calculatePriceFromQuote(preMarketQuote);

            expect(result.finalPrice).toBe(151.50);
            expect(result.isExtendedHours).toBe(true);
            expect(result.extendedHoursPrice).toBe(151.50);
        });

        it('should combine regular and pre-market changes', () => {
            const result = calculatePriceFromQuote(preMarketQuote);

            // finalChange = extendedChange + regularChange = 1.25 + 1.75 = 3.00
            expect(result.finalChange).toBe(3.00);
            // finalChangePercent = (3.00 / 148.50) * 100 = 2.02%
            expect(result.finalChangePercent).toBeCloseTo(2.02, 1);
        });

        it('should indicate pre-market state', () => {
            const result = calculatePriceFromQuote(preMarketQuote);

            expect(result.marketState).toBe('PRE');
        });
    });

    describe('Post-market hours', () => {
        it('should use post-market price when available', () => {
            const result = calculatePriceFromQuote(postMarketQuote);

            expect(result.finalPrice).toBe(149.00);
            expect(result.isExtendedHours).toBe(true);
            expect(result.extendedHoursPrice).toBe(149.00);
        });

        it('should combine regular and post-market changes', () => {
            const result = calculatePriceFromQuote(postMarketQuote);

            // finalChange = extendedChange + regularChange = -1.25 + 1.75 = 0.50
            expect(result.finalChange).toBe(0.50);
            // finalChangePercent = (0.50 / 148.50) * 100 = 0.34%
            expect(result.finalChangePercent).toBeCloseTo(0.34, 1);
        });

        it('should indicate post-market state', () => {
            const result = calculatePriceFromQuote(postMarketQuote);

            expect(result.marketState).toBe('POST');
        });
    });
});

describe('API Response Formatting', () => {
    it('should format Global Quote with correct keys', () => {
        const response = formatApiResponse(regularMarketQuote);

        expect(response['Global Quote']).toBeDefined();
        expect(response['Global Quote']['05. price']).toBe('150.25');
        expect(response['Global Quote']['09. change']).toBe('1.75');
        expect(response['Global Quote']['10. change percent']).toMatch(/^\d+\.\d{2}%$/);
    });

    it('should include extended hours information', () => {
        const response = formatApiResponse(preMarketQuote);

        expect(response.extendedHours).toBeDefined();
        expect(response.extendedHours.isExtendedHours).toBe(true);
        expect(response.extendedHours.price).toBe(151.50);
        expect(response.extendedHours.marketState).toBe('PRE');
    });

    it('should use longName for company name when available', () => {
        const response = formatApiResponse(regularMarketQuote);

        expect(response.companyName).toBe('Apple Inc.');
    });

    it('should fall back to shortName when longName missing', () => {
        const response = formatApiResponse(shortNameOnlyQuote);

        expect(response.companyName).toBe('XYZ Corp');
    });

    it('should fall back to symbol when no names available', () => {
        const response = formatApiResponse(noNameQuote);

        expect(response.companyName).toBe('ABC');
    });

    it('should format change percent with 2 decimal places and % sign', () => {
        const response = formatApiResponse(regularMarketQuote);

        expect(response['Global Quote']['10. change percent']).toMatch(/^\d+\.\d{2}%$/);
    });

    it('should convert price values to strings', () => {
        const response = formatApiResponse(regularMarketQuote);

        expect(typeof response['Global Quote']['05. price']).toBe('string');
        expect(typeof response['Global Quote']['09. change']).toBe('string');
    });
});

describe('YAML Config Parsing', () => {
    it('should extract watchlist from config', () => {
        const yamlContent = `
watchlist:
  - AAPL
  - TSLA
  - MSFT
`;
        const config = parseConfig(yamlContent);

        expect(config.watchlist).toEqual(['AAPL', 'TSLA', 'MSFT']);
    });

    it('should return empty array when watchlist missing', () => {
        const yamlContent = `
server:
  port: 3000
`;
        const config = parseConfig(yamlContent);

        expect(config.watchlist).toEqual([]);
    });

    it('should extract server port from config', () => {
        const yamlContent = `
server:
  port: 8080
`;
        const config = parseConfig(yamlContent);

        expect(config.port).toBe(8080);
    });

    it('should default port to 3000 when not specified', () => {
        const yamlContent = `
watchlist:
  - AAPL
`;
        const config = parseConfig(yamlContent);

        expect(config.port).toBe(3000);
    });

    it('should handle empty config file', () => {
        const yamlContent = '';
        const config = parseConfig(yamlContent);

        expect(config.watchlist).toEqual([]);
        expect(config.port).toBe(3000);
    });

    it('should handle complete config with all options', () => {
        const yamlContent = `
watchlist:
  - AAPL
  - TSLA
  - GOOGL
  - MSFT
server:
  port: 5000
`;
        const config = parseConfig(yamlContent);

        expect(config.watchlist).toHaveLength(4);
        expect(config.port).toBe(5000);
    });

    it('should handle watchlist with single item', () => {
        const yamlContent = `
watchlist:
  - AAPL
`;
        const config = parseConfig(yamlContent);

        expect(config.watchlist).toEqual(['AAPL']);
    });
});
