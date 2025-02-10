let stocks = [];
const REFRESH_INTERVAL = 5 * 60 * 1000; // Refresh every 5 minutes
let lastRefreshTime = {};
let lastPrices = {};
let priceChart = null;

// Dark mode initialization
const darkModeToggle = document.getElementById('darkModeToggle');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

// Initialize dark mode from localStorage or system preference
function initializeDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDarkScheme.matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateChartTheme();
}

// Toggle dark mode
darkModeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateChartTheme();
});

// Update chart colors based on theme
function updateChartTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#e5e7eb' : '#1f2937';
    Chart.defaults.borderColor = isDark ? '#404040' : '#e5e7eb';
    
    if (priceChart) {
        priceChart.options.scales.x.grid.color = isDark ? '#404040' : '#e5e7eb';
        priceChart.options.scales.y.grid.color = isDark ? '#404040' : '#e5e7eb';
        priceChart.update();
    }
}

// Modal elements
const modal = document.getElementById('chart-modal');
const closeBtn = document.getElementsByClassName('close')[0];
const chartTitle = document.getElementById('chart-title');

// Close modal when clicking X or outside
closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

async function loadWatchlist() {
    try {
        const response = await fetch('/api/watchlist');
        const data = await response.json();
        stocks = data.watchlist;
        
        // Initialize the stock cards
        stocks.forEach(symbol => {
            const container = document.getElementById('stocks-container');
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
            container.appendChild(stockCard);
        });
        fetchAllStockPrices();
    } catch (error) {
        console.error('Error loading watchlist:', error);
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
            const quote = data['Global Quote'];
            // Always update the refresh time when we get new data
            lastRefreshTime[symbol] = new Date();
            displayStockPrice(symbol, quote, data.companyName);
        } else if (data.error) {
            console.error('API Error:', data.error);
        } else {
            console.error('Invalid response:', data);
        }
    } catch (error) {
        console.error('Error fetching stock data:', error);
    }
}

function displayStockPrice(symbol, quote, companyName) {
    const stockCard = document.querySelector(`[data-symbol="${symbol}"]`);
    if (!stockCard) return;
    
    const price = parseFloat(quote['05. price']).toFixed(2);
    const change = parseFloat(quote['09. change']).toFixed(2);
    const changePercent = parseFloat(quote['10. change percent']).toFixed(2);
    // Always use the latest refresh time
    const lastUpdated = lastRefreshTime[symbol].toLocaleTimeString();
    const extendedHours = quote.extendedHours || {};

    // Determine price change animation
    let priceChangeClass = 'price-neutral';
    if (lastPrices[symbol]) {
        if (price > lastPrices[symbol]) {
            priceChangeClass = 'price-up';
        } else if (price < lastPrices[symbol]) {
            priceChangeClass = 'price-down';
        }
    }
    lastPrices[symbol] = price;

    // Remove any existing animation classes
    stockCard.classList.remove('price-up', 'price-down', 'price-neutral');
    // Trigger reflow to restart animation
    void stockCard.offsetWidth;
    // Add new animation class
    stockCard.classList.add(priceChangeClass);

    const changeClass = change >= 0 ? 'positive' : 'negative';
    const changePrefix = change >= 0 ? '+' : '';

    // Create extended hours badge if needed
    const extendedHoursBadge = extendedHours.isExtendedHours 
        ? `<span class="extended-hours-badge">${new Date().getHours() < 12 ? 'Pre-Market' : 'After-Hours'}</span>`
        : '';
    
    stockCard.innerHTML = `
        <h2>${symbol} ${extendedHoursBadge}</h2>
        <div class="company-name">${companyName || symbol}</div>
        <div class="stock-price">$${price}</div>
        <div class="stock-details">
            <div class="change-info ${changeClass}">
                ${changePrefix}${change} (${changePrefix}${changePercent}%)
            </div>
            <div class="last-updated">Updated: ${lastUpdated}</div>
        </div>
    `;
}

async function showPriceHistory(symbol) {
    try {
        const response = await fetch(`/api/history/${symbol}`);
        const history = await response.json();

        if (history.length === 0) {
            alert('No historical data available yet');
            return;
        }

        // Prepare data for the chart
        const data = history.reverse();
        const labels = data.map(d => new Date(d.timestamp).toLocaleString());
        const prices = data.map(d => d.price);

        // Update chart
        if (priceChart) {
            priceChart.destroy();
        }

        const ctx = document.getElementById('priceChart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} Price`,
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
                    title: {
                        display: true,
                        text: `${symbol} - ${symbol}`,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Price ($)'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Show modal
        chartTitle.textContent = `${symbol} Price History`;
        modal.style.display = 'block';
    } catch (error) {
        console.error('Error fetching price history:', error);
        alert('Error loading price history');
    }
}

function fetchAllStockPrices() {
    if (stocks.length > 0) {
        stocks.forEach((symbol, index) => {
            setTimeout(() => fetchStockPrice(symbol), index * 1000);
        });
    }
}

// Initial load
initializeDarkMode();
loadWatchlist();

// Auto-refresh
setInterval(fetchAllStockPrices, REFRESH_INTERVAL);
