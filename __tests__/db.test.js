import { addPriceHistory, getPriceHistory, getLatestPrice } from '../db.js';
import { createTestDatabase, closeTestDatabase, insertTestPriceData, clearTestData } from './helpers/testDb.js';

describe('Database Module', () => {
    let db;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    afterEach(async () => {
        await closeTestDatabase(db);
    });

    describe('addPriceHistory', () => {
        it('should insert a price record', async () => {
            await addPriceHistory(db, 'AAPL', 150.25, 1.75, 1.18);

            const result = await db.get('SELECT * FROM price_history WHERE symbol = ?', ['AAPL']);
            expect(result).toBeDefined();
            expect(result.symbol).toBe('AAPL');
            expect(result.price).toBe(150.25);
            expect(result.change).toBe(1.75);
            expect(result.change_percent).toBe(1.18);
        });

        it('should handle negative price changes', async () => {
            await addPriceHistory(db, 'TSLA', 245.00, -5.00, -2.0);

            const result = await db.get('SELECT * FROM price_history WHERE symbol = ?', ['TSLA']);
            expect(result.change).toBe(-5.00);
            expect(result.change_percent).toBe(-2.0);
        });

        it('should handle zero values', async () => {
            await addPriceHistory(db, 'XYZ', 100.00, 0, 0);

            const result = await db.get('SELECT * FROM price_history WHERE symbol = ?', ['XYZ']);
            expect(result.price).toBe(100.00);
            expect(result.change).toBe(0);
            expect(result.change_percent).toBe(0);
        });

        it('should create timestamp automatically', async () => {
            const beforeInsert = new Date();
            await addPriceHistory(db, 'AAPL', 150.25, 1.75, 1.18);
            const afterInsert = new Date();

            const result = await db.get('SELECT * FROM price_history WHERE symbol = ?', ['AAPL']);
            const timestamp = new Date(result.timestamp);

            expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
            expect(timestamp.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 1000);
        });

        it('should allow multiple records for same symbol with different timestamps', async () => {
            await insertTestPriceData(db, 'AAPL', 150.00, 1.00, 0.67, '2024-01-01T10:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 151.00, 2.00, 1.34, '2024-01-01T11:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 152.00, 3.00, 2.01, '2024-01-01T12:00:00.000Z');

            const count = await db.get('SELECT COUNT(*) as count FROM price_history WHERE symbol = ?', ['AAPL']);
            expect(count.count).toBe(3);
        });
    });

    describe('getPriceHistory', () => {
        beforeEach(async () => {
            // Insert test data with known timestamps
            await insertTestPriceData(db, 'AAPL', 150.00, 1.00, 0.67, '2024-01-01T10:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 151.00, 2.00, 1.34, '2024-01-01T11:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 152.00, 3.00, 2.01, '2024-01-01T12:00:00.000Z');
            await insertTestPriceData(db, 'TSLA', 245.00, -5.00, -2.0, '2024-01-01T10:00:00.000Z');
        });

        it('should return all records for a symbol', async () => {
            const history = await getPriceHistory(db, 'AAPL');

            expect(history).toHaveLength(3);
            expect(history.every(h => h.symbol === 'AAPL')).toBe(true);
        });

        it('should filter by symbol', async () => {
            const aaplHistory = await getPriceHistory(db, 'AAPL');
            const tslaHistory = await getPriceHistory(db, 'TSLA');

            expect(aaplHistory).toHaveLength(3);
            expect(tslaHistory).toHaveLength(1);
        });

        it('should order by timestamp descending (most recent first)', async () => {
            const history = await getPriceHistory(db, 'AAPL');

            expect(history[0].timestamp).toBe('2024-01-01T12:00:00.000Z');
            expect(history[1].timestamp).toBe('2024-01-01T11:00:00.000Z');
            expect(history[2].timestamp).toBe('2024-01-01T10:00:00.000Z');
        });

        it('should respect limit parameter', async () => {
            const history = await getPriceHistory(db, 'AAPL', 2);

            expect(history).toHaveLength(2);
            // Should get the 2 most recent
            expect(history[0].price).toBe(152.00);
            expect(history[1].price).toBe(151.00);
        });

        it('should return empty array for unknown symbol', async () => {
            const history = await getPriceHistory(db, 'UNKNOWN');

            expect(history).toEqual([]);
        });

        it('should use default limit of 5000', async () => {
            // This test verifies the default limit doesn't break with small datasets
            const history = await getPriceHistory(db, 'AAPL');

            expect(history.length).toBeLessThanOrEqual(5000);
            expect(history).toHaveLength(3);
        });
    });

    describe('getLatestPrice', () => {
        beforeEach(async () => {
            await insertTestPriceData(db, 'AAPL', 150.00, 1.00, 0.67, '2024-01-01T10:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 151.00, 2.00, 1.34, '2024-01-01T11:00:00.000Z');
            await insertTestPriceData(db, 'AAPL', 152.00, 3.00, 2.01, '2024-01-01T12:00:00.000Z');
        });

        it('should return the most recent record', async () => {
            const latest = await getLatestPrice(db, 'AAPL');

            expect(latest).toBeDefined();
            expect(latest.price).toBe(152.00);
            expect(latest.timestamp).toBe('2024-01-01T12:00:00.000Z');
        });

        it('should return undefined for missing symbol', async () => {
            const latest = await getLatestPrice(db, 'UNKNOWN');

            expect(latest).toBeUndefined();
        });

        it('should return single record when only one exists', async () => {
            await clearTestData(db);
            await insertTestPriceData(db, 'XYZ', 25.00, 0.50, 2.04, '2024-01-01T10:00:00.000Z');

            const latest = await getLatestPrice(db, 'XYZ');

            expect(latest).toBeDefined();
            expect(latest.symbol).toBe('XYZ');
            expect(latest.price).toBe(25.00);
        });

        it('should include all fields in result', async () => {
            const latest = await getLatestPrice(db, 'AAPL');

            expect(latest).toHaveProperty('symbol');
            expect(latest).toHaveProperty('timestamp');
            expect(latest).toHaveProperty('price');
            expect(latest).toHaveProperty('change');
            expect(latest).toHaveProperty('change_percent');
        });
    });
});
