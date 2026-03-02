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
 * Quote with full fundamentals data (large-cap stock)
 */
export const quoteWithFundamentals = {
    symbol: 'AAPL',
    regularMarketPrice: 150.25,
    regularMarketPreviousClose: 148.50,
    regularMarketChange: 1.75,
    regularMarketChangePercent: 1.178,
    marketState: 'REGULAR',
    longName: 'Apple Inc.',
    shortName: 'Apple',
    marketCap: 2500000000000,
    fiftyTwoWeekHigh: 200.00,
    fiftyTwoWeekLow: 120.00,
    trailingPE: 28.5,
    forwardPE: 25.0,
    regularMarketVolume: 45000000,
    averageVolume: 55000000,
};

/**
 * ETF quote — no market cap, no P/E ratios
 */
export const etfQuote = {
    symbol: 'SPY',
    regularMarketPrice: 450.00,
    regularMarketPreviousClose: 448.00,
    regularMarketChange: 2.00,
    regularMarketChangePercent: 0.446,
    marketState: 'REGULAR',
    longName: 'SPDR S&P 500 ETF Trust',
    shortName: 'SPY',
    fiftyTwoWeekHigh: 480.00,
    fiftyTwoWeekLow: 380.00,
    regularMarketVolume: 80000000,
    averageVolume: 85000000,
};

/**
 * Crypto quote — exchange is 'CCC', which should be in SKIP_EXCHANGES
 */
export const cryptoBtcQuote = {
    symbol: 'BTC-USD',
    regularMarketPrice: 65000.00,
    regularMarketPreviousClose: 63000.00,
    regularMarketChange: 2000.00,
    regularMarketChangePercent: 3.175,
    marketState: 'REGULAR',
    longName: 'Bitcoin USD',
    shortName: 'BTC-USD',
    exchange: 'CCC',
    fullExchangeName: 'CCC',
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
