import yaml from 'js-yaml';
import {
    calculatePriceFromQuote,
    formatApiResponse,
    formatCachedResponse,
    extractConfigSettings
} from '../lib/priceCalculation.js';
import {
    regularMarketQuote,
    preMarketQuote,
    postMarketQuote,
    negativeChangeQuote,
    shortNameOnlyQuote,
    noNameQuote,
    quoteWithFundamentals,
    etfQuote
} from './mocks/yahooFinance.js';

/**
 * Helper to parse YAML and extract config (mirrors server.js logic)
 */
function parseConfig(yamlContent) {
    const config = yaml.load(yamlContent);
    return extractConfigSettings(config);
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
        expect(response['Global Quote']['10. change percent']).toMatch(/^-?\d+\.\d{2}%$/);
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

        expect(response['Global Quote']['10. change percent']).toMatch(/^-?\d+\.\d{2}%$/);
    });

    it('should convert price values to strings', () => {
        const response = formatApiResponse(regularMarketQuote);

        expect(typeof response['Global Quote']['05. price']).toBe('string');
        expect(typeof response['Global Quote']['09. change']).toBe('string');
    });
});

describe('Fundamentals Block', () => {
    it('should include fundamentals key in response', () => {
        const response = formatApiResponse(quoteWithFundamentals);

        expect(response.fundamentals).toBeDefined();
    });

    it('should map all fundamentals fields from quote', () => {
        const response = formatApiResponse(quoteWithFundamentals);
        const f = response.fundamentals;

        expect(f.marketCap).toBe(2500000000000);
        expect(f.fiftyTwoWeekHigh).toBe(200.00);
        expect(f.fiftyTwoWeekLow).toBe(120.00);
        expect(f.trailingPE).toBe(28.5);
        expect(f.forwardPE).toBe(25.0);
        expect(f.regularMarketVolume).toBe(45000000);
        expect(f.averageVolume).toBe(55000000);
    });

    it('should return null for missing PE fields on ETF', () => {
        const response = formatApiResponse(etfQuote);
        const f = response.fundamentals;

        expect(f.trailingPE).toBeNull();
        expect(f.forwardPE).toBeNull();
    });

    it('should still include 52W range and volume for ETF', () => {
        const response = formatApiResponse(etfQuote);
        const f = response.fundamentals;

        expect(f.fiftyTwoWeekHigh).toBe(480.00);
        expect(f.fiftyTwoWeekLow).toBe(380.00);
        expect(f.regularMarketVolume).toBe(80000000);
        expect(f.averageVolume).toBe(85000000);
    });

    it('should return null for fundamentals fields absent from quote', () => {
        const response = formatApiResponse(regularMarketQuote);
        const f = response.fundamentals;

        expect(f.marketCap).toBeNull();
        expect(f.fiftyTwoWeekHigh).toBeNull();
        expect(f.trailingPE).toBeNull();
        expect(f.regularMarketVolume).toBeNull();
    });
});

describe('Cached Response Formatting', () => {
    it('should format cached data correctly', () => {
        const cachedData = {
            price: 150.25,
            change: 1.75,
            changePercent: 1.18
        };
        const response = formatCachedResponse('AAPL', cachedData);

        expect(response['Global Quote']['05. price']).toBe('150.25');
        expect(response['Global Quote']['09. change']).toBe('1.75');
        expect(response.companyName).toBe('AAPL');
        expect(response.fromCache).toBe(true);
    });

    it('should indicate not extended hours for cached data', () => {
        const cachedData = {
            price: 150.25,
            change: 1.75,
            changePercent: 1.18
        };
        const response = formatCachedResponse('AAPL', cachedData);

        expect(response.extendedHours.isExtendedHours).toBe(false);
        expect(response.extendedHours.marketState).toBe('CLOSED');
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
