import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import yaml from 'js-yaml';
import fs from 'fs';
import { initializeDatabase, addPriceHistory, getPriceHistory } from './db.js';
import { networkInterfaces } from 'os';
import { calculatePriceFromQuote, formatApiResponse, formatCachedResponse } from './lib/priceCalculation.js';

const app = express();

// Create our directory path constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration with better error handling
let watchlist = [];
let config;
try {
    // Read and parse the YAML file
    const configPath = path.join(__dirname, 'config.yaml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(configFile);
    
    // Extract and validate watchlist with a default empty array
    watchlist = config?.watchlist || [];
    
    // Log success with more detailed information
    console.log('Successfully loaded configuration file');
    console.log('Loaded watchlist contains', watchlist.length, 'items:', watchlist);
} catch (error) {
    // Provide more specific error handling
    if (error.code === 'ENOENT') {
        console.error('Configuration file not found at:', path.join(__dirname, 'config.yaml'));
    } else if (error instanceof yaml.YAMLException) {
        console.error('YAML parsing error in config file:', error.message);
    } else {
        console.error('Unexpected error loading config:', error.message);
    }
    process.exit(1);
}

const PORT = process.env.PORT || config.server?.port || 3000;

// Initialize Yahoo Finance
const yahooFinance = new YahooFinance();

// Initialize database and load initial prices
let db;
let latestPrices = new Map();

(async () => {
    // Ensure data directory exists for Docker volume
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
    
    db = await initializeDatabase();
    console.log('Database initialized');

    // Load initial prices for all watchlist symbols
    for (const symbol of watchlist) {
        try {
            const history = await getPriceHistory(db, symbol);
            if (history && history.length > 0) {
                const latest = history[history.length - 1];
                latestPrices.set(symbol, {
                    price: latest.price,
                    change: latest.change,
                    changePercent: latest.changePercent,
                    timestamp: latest.timestamp
                });
                console.log(`Loaded initial price for ${symbol} from database`);
            }
        } catch (error) {
            console.error(`Error loading initial price for ${symbol}:`, error);
        }
    }
})();

// Request scheduling
const UPDATE_INTERVAL = 1000; // 10 seconds between each stock update
let updateInterval;

function calculateUpdateSchedule() {
    const stockCount = watchlist.length;
    if (stockCount === 0) return;

    console.log(`Update schedule:
        - Stocks to update: ${stockCount}
        - Update interval: ${UPDATE_INTERVAL}ms between stocks`);

    // Clear existing interval if any
    if (updateInterval) {
        clearInterval(updateInterval);
    }

    // Function to update a stock using Yahoo Finance
    async function updateStock(symbol) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const priceData = calculatePriceFromQuote(quote);

            // Store in database
            await addPriceHistory(db, symbol, priceData.finalPrice, priceData.finalChange, priceData.finalChangePercent);

            console.log(`Updated ${symbol} at ${new Date().toLocaleTimeString()}`);

            return {
                price: priceData.finalPrice,
                change: priceData.finalChange,
                changePercent: priceData.finalChangePercent,
                regularMarketPrice: priceData.regularMarketPrice,
                regularMarketChange: priceData.regularMarketChange,
                regularMarketChangePercent: priceData.regularMarketChangePercent,
                isExtendedHours: priceData.isExtendedHours,
                extendedHoursPrice: priceData.extendedHoursPrice,
                extendedHoursChange: priceData.extendedHoursChange,
                marketState: priceData.marketState
            };
        } catch (error) {
            console.error(`Error updating ${symbol}:`, error);
            return null;
        }
    }

    // Start the update cycle
    let currentIndex = 0;
    updateInterval = setInterval(async () => {
        const symbol = watchlist[currentIndex];
        await updateStock(symbol);
        
        currentIndex = (currentIndex + 1) % stockCount;
    }, UPDATE_INTERVAL);

    // Run the first update immediately
    updateStock(watchlist[0]);
}

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Endpoint to fetch stock data
app.get('/api/stock/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const data = await yahooFinance.quote(symbol);

        if (!data) {
            // If live data fetch fails, try to return cached data from database
            const cachedData = latestPrices.get(symbol);
            if (cachedData) {
                res.json(formatCachedResponse(symbol, cachedData));
                return;
            }
            res.status(500).json({ error: 'Failed to fetch stock data' });
            return;
        }

        res.json(formatApiResponse(data));
    } catch (error) {
        console.error('Error fetching stock data:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

// Get price history for a symbol
app.get('/api/history/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const history = await getPriceHistory(db, symbol);
        res.json(history);
    } catch (error) {
        console.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// Get watchlist
app.get('/api/watchlist', (req, res) => {
    // Convert latestPrices Map to an object for each symbol
    const initialPrices = {};
    for (const [symbol, data] of latestPrices.entries()) {
        if (data && typeof data.price !== 'undefined') {
            initialPrices[symbol] = {
                'Global Quote': {
                    '05. price': data.price?.toString() || '0',
                    '09. change': data.change?.toString() || '0',
                    '10. change percent': (data.changePercent || 0).toString()
                },
                fromCache: true,
                companyName: symbol
            };
        }
    }
    
    res.json({ 
        watchlist,
        initialPrices
    });
});

// Start the update schedule
calculateUpdateSchedule();

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Get local IP address for easy mobile testing
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`Access on your local network: http://${net.address}:${PORT}`);
            }
        }
    }
});