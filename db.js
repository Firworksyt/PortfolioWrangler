const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

// Database initialization
async function initializeDatabase() {
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
async function addPriceHistory(db, symbol, price, change, changePercent) {
    const timestamp = new Date().toISOString();
    await db.run(
        `INSERT OR REPLACE INTO price_history (symbol, timestamp, price, change, change_percent)
         VALUES (?, ?, ?, ?, ?)`,
        [symbol, timestamp, price, change, changePercent]
    );
}

// Get price history for a symbol
async function getPriceHistory(db, symbol, limit = 100) {
    return await db.all(
        `SELECT * FROM price_history 
         WHERE symbol = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [symbol, limit]
    );
}

// Get the latest price for a symbol
async function getLatestPrice(db, symbol) {
    return await db.get(
        `SELECT * FROM price_history 
         WHERE symbol = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [symbol]
    );
}

module.exports = {
    initializeDatabase,
    addPriceHistory,
    getPriceHistory,
    getLatestPrice
};
