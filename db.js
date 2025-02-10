import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database initialization
export async function initializeDatabase() {
    const db = await open({
        filename: path.join(__dirname, 'data', 'stocks.db'),
        driver: sqlite3.Database
    });

    // Create tables if they don't exist
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

// Add price data to history
export async function addPriceHistory(db, symbol, price, change, changePercent) {
    const timestamp = new Date().toISOString();
    await db.run(
        `INSERT OR REPLACE INTO price_history (symbol, timestamp, price, change, change_percent)
         VALUES (?, ?, ?, ?, ?)`,
        [symbol, timestamp, price, change, changePercent]
    );
}

// Get price history for a symbol
export async function getPriceHistory(db, symbol, limit = 100) {
    return await db.all(
        `SELECT * FROM price_history 
         WHERE symbol = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [symbol, limit]
    );
}

// Get the latest price for a symbol
export async function getLatestPrice(db, symbol) {
    return await db.get(
        `SELECT * FROM price_history 
         WHERE symbol = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [symbol]
    );
}