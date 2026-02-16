/**
 * Mock Yahoo Finance quote responses for testing various market scenarios.
 */

/**
 * Regular market hours quote - no extended hours data
 */
export const regularMarketQuote = {
    symbol: 'AAPL',
    regularMarketPrice: 150.25,
    regularMarketPreviousClose: 148.50,
    regularMarketChange: 1.75,
    regularMarketChangePercent: 1.178,
    marketState: 'REGULAR',
    longName: 'Apple Inc.',
    shortName: 'Apple'
};

/**
 * Pre-market quote - includes preMarketPrice
 */
export const preMarketQuote = {
    symbol: 'AAPL',
    regularMarketPrice: 150.25,
    regularMarketPreviousClose: 148.50,
    regularMarketChange: 1.75,
    regularMarketChangePercent: 1.178,
    preMarketPrice: 151.50,
    preMarketChange: 1.25,
    preMarketChangePercent: 0.833,
    marketState: 'PRE',
    longName: 'Apple Inc.',
    shortName: 'Apple'
};

/**
 * Post-market quote - includes postMarketPrice
 */
export const postMarketQuote = {
    symbol: 'AAPL',
    regularMarketPrice: 150.25,
    regularMarketPreviousClose: 148.50,
    regularMarketChange: 1.75,
    regularMarketChangePercent: 1.178,
    postMarketPrice: 149.00,
    postMarketChange: -1.25,
    postMarketChangePercent: -0.832,
    marketState: 'POST',
    longName: 'Apple Inc.',
    shortName: 'Apple'
};

/**
 * Quote with negative change (price went down)
 */
export const negativeChangeQuote = {
    symbol: 'TSLA',
    regularMarketPrice: 245.00,
    regularMarketPreviousClose: 250.00,
    regularMarketChange: -5.00,
    regularMarketChangePercent: -2.0,
    marketState: 'REGULAR',
    longName: 'Tesla, Inc.',
    shortName: 'Tesla'
};

/**
 * Quote with only short name (no long name)
 */
export const shortNameOnlyQuote = {
    symbol: 'XYZ',
    regularMarketPrice: 25.00,
    regularMarketPreviousClose: 24.50,
    regularMarketChange: 0.50,
    regularMarketChangePercent: 2.04,
    marketState: 'REGULAR',
    shortName: 'XYZ Corp'
};

/**
 * Quote with no company name
 */
export const noNameQuote = {
    symbol: 'ABC',
    regularMarketPrice: 10.00,
    regularMarketPreviousClose: 10.00,
    regularMarketChange: 0,
    regularMarketChangePercent: 0,
    marketState: 'CLOSED'
};

/**
 * Creates a mock Yahoo Finance instance
 */
export function createMockYahooFinance(quoteResponses = {}) {
    return {
        quote: jest.fn().mockImplementation(async (symbol) => {
            if (quoteResponses[symbol]) {
                return quoteResponses[symbol];
            }
            // Default to regular market quote with modified symbol
            return {
                ...regularMarketQuote,
                symbol
            };
        })
    };
}
