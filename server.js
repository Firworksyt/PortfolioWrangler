import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import yahooFinance from 'yahoo-finance2';
import yaml from 'js-yaml';
import fs from 'fs';
import { initializeDatabase, addPriceHistory, getPriceHistory } from './db.js';
import { networkInterfaces } from 'os';

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

            // Store in database
            await addPriceHistory(db, symbol, finalPrice, finalChange, finalChangePercent);
            
            console.log(`Updated ${symbol} at ${new Date().toLocaleTimeString()}`);
            
            return {
                price: finalPrice,
                change: finalChange,
                changePercent: finalChangePercent,
                regularMarketPrice: regularPrice,
                regularMarketChange: regularChange,
                regularMarketChangePercent: regularChangePercent,
                isExtendedHours: isPreMarket || isPostMarket,
                extendedHoursPrice: extendedPrice,
                extendedHoursChange: extendedChange,
                marketState: quote.marketState
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
                const response = {
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
                res.json(response);
                return;
            }
            res.status(500).json({ error: 'Failed to fetch stock data' });
            return;
        }

        const regularPrice = data.regularMarketPrice;
        const previousClose = data.regularMarketPreviousClose;
        const regularChange = data.regularMarketChange;
        
        // Get pre/post market data if available
        const isPreMarket = data.preMarketPrice !== undefined;
        const isPostMarket = data.postMarketPrice !== undefined;
        const extendedPrice = isPreMarket ? data.preMarketPrice : (isPostMarket ? data.postMarketPrice : null);
        const extendedChange = isPreMarket ? data.preMarketChange : (isPostMarket ? data.postMarketChange : null);
        
        // Calculate final values
        const finalPrice = extendedPrice || regularPrice;
        const finalChange = (extendedPrice ? extendedChange + regularChange : regularChange) || 0;
        const finalChangePercent = (finalChange / previousClose) * 100;

        // Format the response to match our frontend expectations
        const response = {
            'Global Quote': {
                '05. price': finalPrice.toString(),
                '09. change': finalChange.toString(),
                '10. change percent': finalChangePercent.toFixed(2) + '%'
            },
            extendedHours: {
                isExtendedHours: isPreMarket || isPostMarket,
                price: extendedPrice,
                change: extendedChange,
                marketState: data.marketState
            },
            companyName: data.longName || data.shortName || symbol
        };

        res.json(response);
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