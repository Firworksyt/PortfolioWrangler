import { buildFundamentalsHTML } from './lib/formatters.js';

let stocks = [];
let sections = [];
const REFRESH_INTERVAL = 1 * 60 * 1000; // Refresh every minute
let lastRefreshTime = {};
let lastPrices = {};
let priceChart = null;
let currentWatchlistVersion = null;
let currentHistoryData = [];
let currentHistorySymbol = null;
let initialCommitHash = null;
let currentSort = localStorage.getItem('sort') ?? 'default';

// Dark mode initialization
const darkModeToggle = document.getElementById('darkModeToggle');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

function initializeDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDarkScheme.matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateChartTheme();
}

darkModeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateChartTheme();
});

function updateChartTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#e5e7eb' : '#1f2937';
    Chart.defaults.borderColor = isDark ? '#404040' : '#e5e7eb';

    if (priceChart) {
        priceChart.options.scales.x.grid.color = isDark ? '#404040' : '#e5e7eb';
        priceChart.options.scales.y.grid.color = isDark ? '#404040' : 'rgba(0,0,0,0.05)';
        priceChart.update();
    }
}

// Modal elements
const modal = document.getElementById('chart-modal');
const closeBtn = document.getElementsByClassName('close')[0];
const chartTitle = document.getElementById('chart-title');

closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (event) => {
    if (event.target === modal) modal.style.display = 'none';
};

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === currentSort);
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        localStorage.setItem('sort', currentSort);
        applySortToContainer();
    });
});

// Range buttons
document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const hours = btn.dataset.hours ? parseFloat(btn.dataset.hours) : null;
        renderChart(filterByHours(currentHistoryData, hours));
    });
});

function filterByHours(data, hours) {
    if (!hours) return data;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return data.filter(d => new Date(d.timestamp) >= cutoff);
}

function formatChartLabel(timestamp, spansMultipleDays) {
    const date = new Date(timestamp);
    if (spansMultipleDays) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderChart(data) {
    if (data.length === 0) return;

    const first = new Date(data[0].timestamp);
    const last = new Date(data[data.length - 1].timestamp);
    const spansMultipleDays = first.toDateString() !== last.toDateString();

    const labels = data.map(d => formatChartLabel(d.timestamp, spansMultipleDays));
    const prices = data.map(d => d.price);

    if (priceChart) priceChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const ctx = document.getElementById('priceChart').getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `${currentHistorySymbol} Price`,
                data: prices,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                pointRadius: 1,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 8,
                        maxRotation: 0
                    },
                    grid: { display: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Price ($)' },
                    grid: {
                        color: isDark ? '#404040' : 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function createStockCard(symbol) {
    const stockCard = document.createElement('div');
    stockCard.className = 'stock-card';
    stockCard.setAttribute('data-symbol', symbol);
    stockCard.onclick = () => showPriceHistory(symbol);
    stockCard.innerHTML = `
        <h2>${symbol}</h2>
        <div class="company-name">Loading...</div>
        <div class="stock-price">Loading...</div>
        <div class="stock-details">
            <div class="change-info">Loading...</div>
            <div class="last-updated">Loading...</div>
        </div>
    `;
    return stockCard;
}

async function loadWatchlist() {
    try {
        const response = await fetch('/api/watchlist');
        const data = await response.json();
        stocks = data.watchlist;
        sections = data.sections || [{ name: null, stocks: data.watchlist }];
        currentWatchlistVersion = data.watchlistVersion;

        const container = document.getElementById('stocks-container');
        sections.forEach((section, i) => {
            if (section.name !== null) {
                const header = document.createElement('div');
                header.className = 'section-header';
                header.textContent = section.name;
                container.appendChild(header);
            }
            section.stocks.forEach(symbol => {
                const stockCard = createStockCard(symbol);
                stockCard.dataset.sectionIndex = i;
                container.appendChild(stockCard);

                if (data.initialPrices && data.initialPrices[symbol]) {
                    const initialData = data.initialPrices[symbol];
                    displayStockPrice(symbol, initialData['Global Quote'], initialData.companyName, initialData.fundamentals);
                }
            });
        });

        fetchAllStockPrices();
    } catch (error) {
        console.error('Error loading watchlist:', error);
    }
}

async function checkWatchlistChanges() {
    try {
        const response = await fetch('/api/watchlist');
        const data = await response.json();

        if (data.watchlistVersion !== currentWatchlistVersion) {
            console.log('Watchlist changed, rebuilding...');
            currentWatchlistVersion = data.watchlistVersion;
            stocks = data.watchlist;
            sections = data.sections || [{ name: null, stocks: data.watchlist }];

            const container = document.getElementById('stocks-container');
            container.innerHTML = '';
            lastRefreshTime = {};
            lastPrices = {};

            sections.forEach((section, i) => {
                if (section.name !== null) {
                    const header = document.createElement('div');
                    header.className = 'section-header';
                    header.textContent = section.name;
                    container.appendChild(header);
                }
                section.stocks.forEach(symbol => {
                    const stockCard = createStockCard(symbol);
                    stockCard.dataset.sectionIndex = i;
                    container.appendChild(stockCard);

                    if (data.initialPrices && data.initialPrices[symbol]) {
                        const initialData = data.initialPrices[symbol];
                        displayStockPrice(symbol, initialData['Global Quote'], initialData.companyName, initialData.fundamentals);
                    }
                });
            });

            fetchAllStockPrices();
        }
    } catch (error) {
        console.error('Error checking watchlist changes:', error);
    }
}

async function fetchStockPrice(symbol) {
    try {
        const response = await fetch(`/api/stock/${symbol}`);
        if (response.status === 429) {
            console.warn('Rate limit reached. Will retry on next refresh.');
            return;
        }
        const data = await response.json();

        if (data['Global Quote']) {
            lastRefreshTime[symbol] = new Date();
            displayStockPrice(symbol, data['Global Quote'], data.companyName, data.fundamentals);
        } else if (data.error) {
            console.error('API Error:', data.error);
        } else {
            console.error('Invalid response:', data);
        }
    } catch (error) {
        console.error('Error fetching stock data:', error);
    }
}

function displayStockPrice(symbol, quote, companyName, fundamentals = null) {
    const stockCard = document.querySelector(`.stock-card[data-symbol="${symbol}"]`);
    if (!stockCard) return;

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent']);
    const lastUpdate = lastRefreshTime[symbol] || new Date();
    const previousPrice = lastPrices[symbol]?.price;

    lastPrices[symbol] = { price, changePercent };

    const companyNameElement = stockCard.querySelector('.company-name');
    companyNameElement.textContent = companyName || symbol;

    const priceElement = stockCard.querySelector('.stock-price');
    priceElement.textContent = `$${price.toFixed(2)}`;
    if (previousPrice) {
        priceElement.classList.remove('price-up', 'price-down');
        if (price > previousPrice) {
            priceElement.classList.add('price-up');
        } else if (price < previousPrice) {
            priceElement.classList.add('price-down');
        }
    }

    const changeInfoElement = stockCard.querySelector('.change-info');
    const arrow = change >= 0 ? '▲' : '▼';
    const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
    changeInfoElement.textContent = `${arrow} ${changeText}`;
    changeInfoElement.className = 'change-info ' + (change >= 0 ? 'positive' : 'negative');

    stockCard.classList.remove('card-positive', 'card-negative');
    if (change > 0) stockCard.classList.add('card-positive');
    else if (change < 0) stockCard.classList.add('card-negative');

    const lastUpdatedElement = stockCard.querySelector('.last-updated');
    lastUpdatedElement.textContent = `Updated ${lastUpdate.toLocaleTimeString()}`;
    if (quote.fromCache) {
        lastUpdatedElement.textContent += ' (cached)';
        stockCard.classList.add('cached');
    } else {
        stockCard.classList.remove('cached');
    }

    let strip = stockCard.querySelector('.fundamentals-strip');
    if (!strip) {
        strip = document.createElement('div');
        strip.className = 'fundamentals-strip';
        stockCard.appendChild(strip);
    }
    if (fundamentals) {
        strip.innerHTML = buildFundamentalsHTML(fundamentals);
        strip.style.display = '';
    } else {
        strip.style.display = 'none';
    }
}


async function showPriceHistory(symbol) {
    try {
        const response = await fetch(`/api/history/${symbol}`);
        const history = await response.json();

        if (history.length === 0) {
            alert('No historical data available yet');
            return;
        }

        currentHistoryData = history.reverse(); // oldest → newest
        currentHistorySymbol = symbol;

        chartTitle.textContent = `${symbol} Price History`;

        // Reset range buttons to "All"
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        const allBtn = document.querySelector('.range-btn[data-hours=""]');
        if (allBtn) allBtn.classList.add('active');

        modal.style.display = 'block';
        renderChart(currentHistoryData);
    } catch (error) {
        console.error('Error fetching price history:', error);
        alert('Error loading price history');
    }
}

function applySortToContainer() {
    const container = document.getElementById('stocks-container');

    if (currentSort !== 'default') {
        // Hide section headers and sort all cards globally
        container.querySelectorAll('.section-header').forEach(h => { h.style.display = 'none'; });
        const cards = [...container.querySelectorAll('.stock-card')];
        cards.sort((a, b) => {
            const symA = a.dataset.symbol, symB = b.dataset.symbol;
            if (currentSort === 'gainers') return (lastPrices[symB]?.changePercent ?? 0) - (lastPrices[symA]?.changePercent ?? 0);
            if (currentSort === 'losers')  return (lastPrices[symA]?.changePercent ?? 0) - (lastPrices[symB]?.changePercent ?? 0);
            if (currentSort === 'alpha')   return symA.localeCompare(symB);
        });
        cards.forEach(c => container.appendChild(c));
    } else {
        // Show section headers and restore declared order
        const headers = [...container.querySelectorAll('.section-header')];
        headers.forEach(h => { h.style.display = ''; });
        sections.forEach((section, i) => {
            const header = headers[i];
            if (header) container.appendChild(header);
            const cards = [...container.querySelectorAll(`.stock-card[data-section-index="${i}"]`)];
            cards.forEach(c => container.appendChild(c));
        });
    }
}

function fetchAllStockPrices() {
    const total = stocks.length;
    stocks.forEach((symbol, index) => {
        setTimeout(() => {
            fetchStockPrice(symbol);
            if (index === total - 1) {
                setTimeout(() => applySortToContainer(), 100);
            }
        }, index * 1000);
    });
}

async function fetchMarketStatus() {
    try {
        const res = await fetch('/api/market-status');
        const { markets } = await res.json();
        updateMarketStatusBar(markets);
    } catch { /* silent */ }
}

function updateMarketStatusBar(markets) {
    const bar = document.getElementById('market-status-bar');
    if (!bar) return;
    if (!markets || markets.length === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = '';
    bar.className = 'market-status-bar';
    bar.innerHTML = markets.map(buildMarketPillHTML).join('');
}

function buildMarketPillHTML({ displayName, marketState }) {
    const stateMap = {
        REGULAR:   { label: 'Open',   cls: 'pill-open'     },
        PRE:       { label: 'Pre',    cls: 'pill-extended'  },
        POST:      { label: 'After',  cls: 'pill-extended'  },
        PREPRE:    { label: 'Closed', cls: 'pill-closed'    },
        POSTPOST:  { label: 'Closed', cls: 'pill-closed'    },
    };
    const s = stateMap[marketState] ?? { label: 'Closed', cls: 'pill-closed' };
    return `<span class="market-pill ${s.cls}"><span class="status-dot"></span>${displayName}<span class="pill-status">${s.label}</span></span>`;
}

async function loadVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const el = document.getElementById('version-info');
        if (el && data.commitHash) {
            const date = new Date(data.buildTimestamp);
            const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            el.textContent = `v${data.commitHash} \u00b7 ${formatted}`;
            initialCommitHash = data.commitHash;
        }
    } catch (error) {
        console.error('Error loading version:', error);
    }
}

async function checkForUpdates() {
    if (!initialCommitHash) return;
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        if (data.commitHash && data.commitHash !== initialCommitHash) {
            showUpdateToast();
        }
    } catch {
        // Server may be mid-restart; will check again next interval
    }
}

function showUpdateToast() {
    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.innerHTML = '<i class="fas fa-arrows-rotate"></i> New version deployed — refreshing...';
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
    setTimeout(() => window.location.reload(), 4000);
}

// Initial load
initializeDarkMode();
loadWatchlist();
loadVersion();
fetchMarketStatus();

// Auto-refresh — also checks for watchlist changes and new deployments
setInterval(() => {
    checkWatchlistChanges();
    fetchAllStockPrices();
    checkForUpdates();
    fetchMarketStatus();
}, REFRESH_INTERVAL);
