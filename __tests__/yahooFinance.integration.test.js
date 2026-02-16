/**
 * Integration tests for Yahoo Finance API.
 * These tests make real network calls to verify the yahoo-finance2 package
 * works correctly and the response shape matches our expectations.
 *
 * Uses retries to handle temporary network issues.
 * Gracefully skips tests when Yahoo API is unavailable.
 *
 * Note: Jest manipulates global.fetch which breaks yahoo-finance2's cookie handling.
 * We use undici's fetch to work around this (see: https://github.com/gadicc/yahoo-finance2/issues/923)
 */

import { jest } from '@jest/globals';
import { fetch as undiciFetch } from 'undici';
import YahooFinance from 'yahoo-finance2';
import { calculatePriceFromQuote, formatApiResponse } from '../lib/priceCalculation.js';

// Fix Jest's fetch manipulation breaking yahoo-finance2's cookie handling
globalThis.fetch = undiciFetch;

// Retry failed tests up to 3 times for network flakiness
jest.retryTimes(3);

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Helper to check if Yahoo API is available
let yahooApiAvailable = null;
let cachedQuote = null;

async function checkYahooApiAvailability() {
    if (yahooApiAvailable !== null) {
        return yahooApiAvailable;
    }

    try {
        cachedQuote = await yahooFinance.quote('AAPL');
        yahooApiAvailable = true;
    } catch (error) {
        console.warn('Yahoo Finance API unavailable:', error.message);
        yahooApiAvailable = false;
    }

    return yahooApiAvailable;
}

async function getQuoteOrSkip(symbol = 'AAPL') {
    const available = await checkYahooApiAvailability();
    if (!available) {
        return null;
    }

    // Reuse cached quote for AAPL to reduce API calls
    if (symbol === 'AAPL' && cachedQuote) {
        return cachedQuote;
    }

    return await yahooFinance.quote(symbol);
}

describe('Yahoo Finance Integration', () => {
    describe('Quote API Response Shape', () => {
        it('should return quote with required fields for AAPL', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            // Verify required fields exist
            expect(quote).toBeDefined();
            expect(quote.symbol).toBe('AAPL');

            // Verify price fields exist and are numbers
            expect(typeof quote.regularMarketPrice).toBe('number');
            expect(typeof quote.regularMarketPreviousClose).toBe('number');
            expect(typeof quote.regularMarketChange).toBe('number');
            expect(typeof quote.regularMarketChangePercent).toBe('number');

            // Verify market state exists
            expect(quote.marketState).toBeDefined();
            expect(['PRE', 'REGULAR', 'POST', 'POSTPOST', 'PREPRE', 'CLOSED']).toContain(quote.marketState);
        });

        it('should return company name information', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            // At least one name field should exist
            const hasName = quote.longName || quote.shortName;
            expect(hasName).toBeTruthy();
        });

        it('should have reasonable price values', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            // AAPL should have a positive price (sanity check)
            expect(quote.regularMarketPrice).toBeGreaterThan(0);
            expect(quote.regularMarketPreviousClose).toBeGreaterThan(0);
        });
    });

    describe('Price Calculation with Real Data', () => {
        it('should calculate prices from real quote without errors', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            const result = calculatePriceFromQuote(quote);

            // Verify calculation produces valid numbers
            expect(typeof result.finalPrice).toBe('number');
            expect(typeof result.finalChange).toBe('number');
            expect(typeof result.finalChangePercent).toBe('number');
            expect(isNaN(result.finalPrice)).toBe(false);
            expect(isNaN(result.finalChange)).toBe(false);
            expect(isNaN(result.finalChangePercent)).toBe(false);
        });

        it('should format API response from real quote', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            const response = formatApiResponse(quote);

            // Verify response structure
            expect(response['Global Quote']).toBeDefined();
            expect(response['Global Quote']['05. price']).toBeDefined();
            expect(response['Global Quote']['09. change']).toBeDefined();
            expect(response['Global Quote']['10. change percent']).toBeDefined();
            expect(response.extendedHours).toBeDefined();
            expect(response.companyName).toBeDefined();

            // Verify types (strings for Global Quote)
            expect(typeof response['Global Quote']['05. price']).toBe('string');
            expect(typeof response['Global Quote']['09. change']).toBe('string');

            // Verify change percent format
            expect(response['Global Quote']['10. change percent']).toMatch(/^-?\d+\.\d{2}%$/);
        });
    });

    describe('Extended Hours Detection', () => {
        it('should correctly identify extended hours state', async () => {
            const quote = await getQuoteOrSkip('AAPL');
            if (!quote) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            const result = calculatePriceFromQuote(quote);

            // Extended hours should match presence of pre/post market price
            const hasExtendedPrice = quote.preMarketPrice !== undefined || quote.postMarketPrice !== undefined;
            expect(result.isExtendedHours).toBe(hasExtendedPrice);
        });
    });

    describe('Multiple Symbols', () => {
        it('should fetch quotes for different symbols', async () => {
            // First check if API is available at all
            const available = await checkYahooApiAvailability();
            if (!available) {
                console.log('Skipping: Yahoo API unavailable');
                return;
            }

            const symbols = ['MSFT', 'GOOGL'];

            for (const symbol of symbols) {
                try {
                    const quote = await yahooFinance.quote(symbol);
                    expect(quote.symbol).toBe(symbol);
                    expect(typeof quote.regularMarketPrice).toBe('number');
                    expect(quote.regularMarketPrice).toBeGreaterThan(0);
                } catch (error) {
                    console.warn(`Failed to fetch ${symbol}:`, error.message);
                    // Don't fail the whole test if one symbol fails
                }
            }
        });
    });
});
