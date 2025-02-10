# PortfolioWrangler

A self-hosted, realish-time stock dashboard that displays current prices including pre-market, and after-hours data for your watchlist. Built with Node.js and vanilla JavaScript.

[![CI](https://github.com/Firworksyt/PortfolioWrangler/actions/workflows/ci.yml/badge.svg)](https://github.com/Firworksyt/PortfolioWrangler/actions/workflows/ci.yml)
[![Security Scan](https://github.com/Firworksyt/PortfolioWrangler/actions/workflows/security.yml/badge.svg)](https://github.com/Firworksyt/PortfolioWrangler/actions/workflows/security.yml)

## Features

- 📈 Real-time stock price updates
- 🌙 Pre-market and after-hours trading data
- 📊 Interactive price charts
- 📝 Configurable watchlist via YAML
- 💾 Historical price tracking
- 🎨 Clean, responsive UI with price change animations

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/Firworksyt/PortfolioWrangler.git
cd PortfolioWrangler
```

2. Install dependencies:
```bash
npm install
```

3. Set up your configuration:
```bash
cp example.config.yaml config.yaml
# Edit config.yaml with your preferred stocks and settings
```

4. Start the server:
```bash
npm start
```

5. Open your browser to `http://localhost:3000` (or your configured port)

## Configuration

Copy `example.config.yaml` to `config.yaml` and customize it:
```yaml
# Server configuration
server:
  port: 3000  # Change this if you want to use a different port

# Stock watchlist
watchlist:
  - SKYT  # Add your stock symbols here
```

## Technical Stack

- Frontend: Vanilla JavaScript, Chart.js
- Backend: Node.js, Express
- Database: SQLite
- Data Provider: Yahoo Finance API

## Development

The project uses a simple architecture:
- `server.js`: Express server and API endpoints
- `app.js`: Frontend JavaScript
- `db.js`: Database operations
- `styles.css`: UI styling
- `config.yaml`: Watchlist configuration

## Known Issues

### Security

- Medium severity vulnerability in `inflight@1.0.6` (dependency of sqlite3): [SNYK-JS-INFLIGHT-6095116](https://security.snyk.io/vuln/SNYK-JS-INFLIGHT-6095116)
  - No upgrade path or patch available
  - Only affects development dependencies
  - Will be resolved when a fix is available upstream

## Planned Updates

- Automatically pickup changes to the config file and reload the server
- Initialize prices from the database when the server starts
- Cleanup structure to make it more maintainable