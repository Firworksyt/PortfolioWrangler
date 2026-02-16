/**
 * Price calculation and formatting logic extracted from server.js
 * for testability and reuse.
 */

/**
 * Calculate final price values from a Yahoo Finance quote.
 * Handles regular market, pre-market, and post-market scenarios.
 *
 * @param {Object} quote - Yahoo Finance quote object
 * @returns {Object} Calculated price data
 */
export function calculatePriceFromQuote(quote) {
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
 * Format a Yahoo Finance quote into the API response format.
 *
 * @param {Object} quote - Yahoo Finance quote object
 * @returns {Object} Formatted API response
 */
export function formatApiResponse(quote) {
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
 * Format cached price data into the API response format.
 * Used when live data fetch fails.
 *
 * @param {string} symbol - Stock symbol
 * @param {Object} cachedData - Cached price data
 * @returns {Object} Formatted API response
 */
export function formatCachedResponse(symbol, cachedData) {
    return {
        'Global Quote': {
            '05. price': cachedData.price.toString(),
            '09. change': cachedData.change.toString(),
            '10. change percent': cachedData.changePercent.toFixed(2) + '%'
        },
        extendedHours: {
            isExtendedHours: false,
            price: null,
            change: null,
            marketState: 'CLOSED'
        },
        companyName: symbol,
        fromCache: true
    };
}

/**
 * Parse YAML config and extract settings.
 *
 * @param {Object} config - Parsed YAML config object
 * @param {Object} env - Environment variables (process.env)
 * @returns {Object} Extracted settings
 */
export function extractConfigSettings(config, env = {}) {
    return {
        watchlist: config?.watchlist || [],
        port: env.PORT || config?.server?.port || 3000
    };
}
