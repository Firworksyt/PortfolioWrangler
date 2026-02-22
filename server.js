import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import { initializeDatabase, addPriceHistory, getPriceHistory } from './db.js';
import { networkInterfaces } from 'os';
import { calculatePriceFromQuote, formatApiResponse, formatCachedResponse } from './lib/priceCalculation.js';
import { parseConfigFile, diffWatchlist } from './lib/configLoader.js';
import { getAppVersion } from './lib/version.js';

const app = express();

// Create our directory path constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Version info (resolved once at startup)
const appVersion = getAppVersion({ dirname: __dirname, env: process.env });
console.log(`App version: ${appVersion.commitHash} (built ${appVersion.buildTimestamp})`);

// Config state
const configPath = path.join(__dirname, 'config.yaml');
let watchlist = [];
let config;
let watchlistVersion = 0;
// Maps a normalised display name → { displayName, marketState }
let marketStates = new Map();

// Yahoo Finance exchange codes → human-readable display names.
// Codes that share a display name are intentionally merged into one pill
// (e.g. NMS/NGM/NCM are all NASDAQ tiers but the same exchange operationally).
// NYSE Arca (PCX) opens/closes with NYSE so we fold it in — no need for a
// separate pill that would confuse users.
const EXCHANGE_DISPLAY = {
    // US
    NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ',
    NYQ: 'NYSE', PCX: 'NYSE', ASE: 'NYSE',
    // UK
    LSE: 'London',
    // Europe
    HEL: 'Helsinki', STO: 'Stockholm', CPH: 'Copenhagen', OSL: 'Oslo',
    ETR: 'XETRA', PAR: 'Euronext Paris', AMS: 'Euronext AMS',
    MCE: 'Madrid', MIL: 'Milan', SWX: 'SIX Swiss',
    // Asia-Pacific
    TYO: 'Tokyo', OSA: 'Osaka', HKG: 'Hong Kong',
    SGX: 'Singapore', ASX: 'ASX', TAI: 'Taiwan',
    BSE: 'BSE India', NSE: 'NSE India',
    // Americas
    TSX: 'TSX', SAO: 'B3',
};

// OTC/Pink Sheet exchanges are skipped entirely. ADRs like RYCEY/TOTDY trade on
// these during US hours — identical to NYSE/NASDAQ hours already shown — so
// an "OTC Markets" pill is redundant and misleading (users expect the
// underlying exchange, e.g. London or Tokyo, not a US OTC wrapper).
// Yahoo Finance uses several codes for OTC tiers; we catch them by code and
// also by fullExchangeName as a fallback for any codes not listed here.
const SKIP_EXCHANGES = new Set([
    'PNK',     // OTC Pink tier
    'OQB',     // OTC OTCQB tier
    'OTCMKTS', // generic OTC Markets code
    'OTCPK', 'OTCQB', 'OTCQX', 'OBB', 'OTC', 'OTCBB',
]);

function isOtcExchange(exchange, fullExchangeName) {
    if (SKIP_EXCHANGES.has(exchange)) return true;
    const name = fullExchangeName ?? '';
    return name.includes('OTC') || name.toLowerCase().includes('pink');
}

// Load (or reload) the configuration file
function loadConfig({ initial = false } = {}) {
    try {
        const result = parseConfigFile(configPath);
        const newWatchlist = result.watchlist;
        const newConfig = result.config;

        if (!initial) {
            const diff = diffWatchlist(watchlist, newWatchlist);
            if (!diff.changed) {
                console.log('Config file changed but watchlist is identical, skipping reload');
                return;
            }
            console.log(`Watchlist changed — added: [${diff.added}], removed: [${diff.removed}]`);

            // Clean up latestPrices for removed symbols
            for (const symbol of diff.removed) {
                latestPrices.delete(symbol);
            }

            // Reset market states — will repopulate on next poll cycle
            marketStates.clear();

            // Load initial prices for newly added symbols
            loadInitialPricesForSymbols(diff.added);
        }

        watchlist = newWatchlist;
        config = newConfig;
        watchlistVersion++;

        console.log('Successfully loaded configuration file');
        console.log('Loaded watchlist contains', watchlist.length, 'items:', watchlist);

        // Restart the update loop on reload (initial schedule is started at module level)
        if (!initial) {
            calculateUpdateSchedule();
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('Configuration file not found at:', configPath);
        } else if (error.name === 'YAMLException') {
            console.error('YAML parsing error in config file:', error.message);
        } else {
            console.error('Unexpected error loading config:', error.message);
        }

        if (initial) {
            process.exit(1);
        }
        // On reload failure, keep existing config running
    }
}

// Initial config load (exits on failure)
loadConfig({ initial: true });

const PORT = process.env.PORT || config.server?.port || 3000;

// Initialize Yahoo Finance
const yahooFinance = new YahooFinance();

// Initialize database and load initial prices
let db;
let latestPrices = new Map();

async function loadInitialPricesForSymbols(symbols) {
    for (const symbol of symbols) {
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
}

(async () => {
    // Ensure data directory exists for Docker volume
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    db = await initializeDatabase();
    console.log('Database initialized');

    // Load initial prices for all watchlist symbols
    await loadInitialPricesForSymbols(watchlist);
})();

// Request scheduling
const UPDATE_INTERVAL = 10000; // 10 seconds between each stock update
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
                marketState: priceData.marketState,
                exchange: quote.exchange ?? null,
                fullExchangeName: quote.fullExchangeName ?? null,
            };
        } catch (error) {
            console.error(`Error updating ${symbol}:`, error);
            return null;
        }
    }

    function recordStockResult(symbol, result) {
        latestPrices.set(symbol, result);
        if (result.exchange && result.marketState && !isOtcExchange(result.exchange, result.fullExchangeName)) {
            const displayName = EXCHANGE_DISPLAY[result.exchange] ?? result.fullExchangeName ?? result.exchange;
            marketStates.set(displayName, { displayName, marketState: result.marketState });
        }
    }

    // Start the update cycle
    let currentIndex = 0;
    updateInterval = setInterval(async () => {
        const symbol = watchlist[currentIndex];
        const result = await updateStock(symbol);
        if (result) recordStockResult(symbol, result);
        currentIndex = (currentIndex + 1) % stockCount;
    }, UPDATE_INTERVAL);

    // Run the first update immediately
    updateStock(watchlist[0]).then(result => {
        if (result) recordStockResult(watchlist[0], result);
    });
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
        initialPrices,
        watchlistVersion
    });
});

// Version endpoint
app.get('/api/version', (req, res) => {
    res.json(appVersion);
});

// Market status endpoint
app.get('/api/market-status', (req, res) => {
    res.json({ markets: [...marketStates.values()], asOf: new Date().toISOString() });
});

// Start the update schedule
calculateUpdateSchedule();

// Watch config file for changes
function watchConfigFile() {
    let debounceTimer = null;

    function onConfigChange() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log('Config file change detected, reloading...');
            loadConfig();
        }, 500);
    }

    function startWatcher() {
        try {
            const watcher = fs.watch(configPath, (eventType) => {
                if (eventType === 'rename') {
                    // File was replaced (atomic save) — re-establish watcher
                    watcher.close();
                    setTimeout(startWatcher, 100);
                }
                onConfigChange();
            });

            watcher.on('error', (err) => {
                console.error('Config watcher error:', err.message);
                watcher.close();
                setTimeout(startWatcher, 5000);
            });
        } catch (err) {
            console.error('Failed to watch config file:', err.message);
            setTimeout(startWatcher, 5000);
        }
    }

    startWatcher();
}

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

    // Start watching config file for hot-reload
    watchConfigFile();
});
