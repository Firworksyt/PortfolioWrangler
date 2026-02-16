import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

/**
 * Creates an in-memory SQLite database for isolated test runs.
 * Each call returns a fresh database instance with the price_history table.
 */
export async function createTestDatabase() {
    const db = await open({
        filename: ':memory:',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS price_history (
            symbol TEXT,
            timestamp DATETIME,
            price REAL,
            change REAL,
            change_percent REAL,
            PRIMARY KEY (symbol, timestamp)
        );

        CREATE INDEX IF NOT EXISTS idx_symbol_timestamp
        ON price_history(symbol, timestamp);
    `);

    return db;
}

/**
 * Closes the test database connection.
 */
export async function closeTestDatabase(db) {
    if (db) {
        await db.close();
    }
}

/**
 * Inserts test price data directly into the database.
 * Useful for setting up test scenarios.
 */
export async function insertTestPriceData(db, symbol, price, change, changePercent, timestamp = null) {
    const ts = timestamp || new Date().toISOString();
    await db.run(
        `INSERT OR REPLACE INTO price_history (symbol, timestamp, price, change, change_percent)
         VALUES (?, ?, ?, ?, ?)`,
        [symbol, ts, price, change, changePercent]
    );
}

/**
 * Clears all data from the price_history table.
 */
export async function clearTestData(db) {
    await db.run('DELETE FROM price_history');
}
