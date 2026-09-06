/**
 * B-Xtrender short-term (Puppytherapy / QuantTherapy) — TradingView-compatible.
 *
 * bxShort = RSI(EMA(close,5) − EMA(close,20), 5) − 50
 *
 * EMA: α=2/(len+1), seed = SMA of first `length` finite values
 * RSI: Wilder RMA (α=1/length) on change of the input series;
 *      first avg gain/loss = SMA of first `length` gains/losses
 */

export const BX_SHORT_L1 = 5;
export const BX_SHORT_L2 = 20;
export const BX_SHORT_L3 = 5;
/** Minimum completed daily bars before showing BX on a card. */
export const BX_MIN_BARS = 60;
const EPS = 1e-12;

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * TradingView ta.ema
 * @param {Array<number|null|undefined>} series
 * @param {number} length
 * @returns {(number|null)[]}
 */
export function ema(series, length) {
    if (length < 1) throw new Error('EMA length must be >= 1');
    const n = series.length;
    const out = new Array(n).fill(null);
    if (n === 0) return out;

    const alpha = 2 / (length + 1);
    const vals = [];
    let seedI = -1;
    for (let i = 0; i < n; i++) {
        if (!isFiniteNumber(series[i])) continue;
        vals.push(series[i]);
        if (vals.length === length) {
            seedI = i;
            break;
        }
    }
    if (seedI < 0) return out;

    let prev = vals.reduce((a, b) => a + b, 0) / length;
    out[seedI] = prev;
    for (let i = seedI + 1; i < n; i++) {
        if (!isFiniteNumber(series[i])) {
            out[i] = null;
            continue;
        }
        if (!isFiniteNumber(prev)) continue;
        prev = alpha * series[i] + (1 - alpha) * prev;
        out[i] = prev;
    }
    return out;
}

/**
 * Wilder RMA (TradingView ta.rma)
 * @param {Array<number|null|undefined>} series
 * @param {number} length
 * @returns {(number|null)[]}
 */
export function rma(series, length) {
    if (length < 1) throw new Error('RMA length must be >= 1');
    const n = series.length;
    const out = new Array(n).fill(null);
    const alpha = 1 / length;

    const vals = [];
    let seedI = -1;
    for (let i = 0; i < n; i++) {
        if (!isFiniteNumber(series[i])) continue;
        vals.push(series[i]);
        if (vals.length === length) {
            seedI = i;
            break;
        }
    }
    if (seedI < 0) return out;

    let prev = vals.reduce((a, b) => a + b, 0) / length;
    out[seedI] = prev;
    for (let i = seedI + 1; i < n; i++) {
        if (!isFiniteNumber(series[i])) {
            out[i] = null;
            continue;
        }
        if (!isFiniteNumber(prev)) continue;
        prev = alpha * series[i] + (1 - alpha) * prev;
        out[i] = prev;
    }
    return out;
}

/**
 * TradingView ta.rsi on an arbitrary series (change of THAT series).
 * @param {Array<number|null|undefined>} series
 * @param {number} length
 * @returns {(number|null)[]}
 */
export function rsiRma(series, length) {
    if (length < 1) throw new Error('RSI length must be >= 1');
    const n = series.length;
    const gain = new Array(n).fill(null);
    const loss = new Array(n).fill(null);

    for (let i = 1; i < n; i++) {
        if (!isFiniteNumber(series[i]) || !isFiniteNumber(series[i - 1])) continue;
        const delta = series[i] - series[i - 1];
        gain[i] = Math.max(delta, 0);
        loss[i] = Math.max(-delta, 0);
    }

    const avgGain = rma(gain, length);
    const avgLoss = rma(loss, length);
    const out = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
        const g = avgGain[i];
        const l = avgLoss[i];
        if (!isFiniteNumber(g) || !isFiniteNumber(l)) continue;
        if (g === 0 && l === 0) {
            out[i] = 50;
        } else if (l === 0 && g > 0) {
            out[i] = 100;
        } else if (g === 0 && l > 0) {
            out[i] = 0;
        } else {
            const rs = g / l;
            out[i] = 100 - 100 / (1 + rs);
        }
    }
    return out;
}

/**
 * Short-term BX series: RSI(EMA5 − EMA20, 5) − 50
 * @param {Array<number|null|undefined>} closes Adjusted daily closes, oldest → newest
 * @returns {(number|null)[]}
 */
export function bxShortSeries(closes, {
    shortL1 = BX_SHORT_L1,
    shortL2 = BX_SHORT_L2,
    shortL3 = BX_SHORT_L3,
} = {}) {
    const emaFast = ema(closes, shortL1);
    const emaSlow = ema(closes, shortL2);
    const src = closes.map((_, i) => {
        if (!isFiniteNumber(emaFast[i]) || !isFiniteNumber(emaSlow[i])) return null;
        return emaFast[i] - emaSlow[i];
    });
    const rsi = rsiRma(src, shortL3);
    return rsi.map((v) => (isFiniteNumber(v) ? v - 50 : null));
}

/**
 * Compare today vs yesterday BX for direction / magnitude chips.
 * @param {number} today
 * @param {number} yesterday
 * @returns {{ direction: 'rising'|'falling'|'flat', magnitude: 'away'|'toward'|'flat' }}
 */
export function classifyBxMove(today, yesterday) {
    let direction = 'flat';
    if (today > yesterday + EPS) direction = 'rising';
    else if (today < yesterday - EPS) direction = 'falling';

    const absToday = Math.abs(today);
    const absYesterday = Math.abs(yesterday);
    let magnitude = 'flat';
    if (absToday > absYesterday + EPS) magnitude = 'away';
    else if (absToday < absYesterday - EPS) magnitude = 'toward';

    return { direction, magnitude };
}

/**
 * Build the watchlist-card payload for the last completed daily bar.
 * Returns null fields (bxShort) when history is insufficient (< minBars) or BX is not yet defined.
 *
 * @param {string} symbol
 * @param {string[]} dates ISO date strings (YYYY-MM-DD), oldest → newest
 * @param {Array<number|null|undefined>} closes Adjusted closes aligned with dates
 * @param {{ minBars?: number }} [opts]
 * @returns {{ symbol: string, asOf: string|null, bxShort: number|null, direction: string|null, magnitude: string|null }}
 */
export function computeBxPayload(symbol, dates, closes, { minBars = BX_MIN_BARS } = {}) {
    const empty = {
        symbol,
        asOf: null,
        bxShort: null,
        direction: null,
        magnitude: null,
    };

    if (!Array.isArray(closes) || closes.length < minBars) {
        return empty;
    }

    const series = bxShortSeries(closes);
    let i = series.length - 1;
    while (i >= 0 && !isFiniteNumber(series[i])) i--;
    if (i < 1 || !isFiniteNumber(series[i - 1])) {
        return empty;
    }

    const today = series[i];
    const yesterday = series[i - 1];
    const { direction, magnitude } = classifyBxMove(today, yesterday);

    return {
        symbol,
        asOf: dates[i] ?? null,
        bxShort: today,
        direction,
        magnitude,
    };
}

/**
 * Format chip label for UI: "↗ away" / "↘ toward" / "flat"
 */
export function formatBxChip(direction, magnitude) {
    if (!direction || !magnitude || direction === 'flat') return 'flat';
    const arrow = direction === 'rising' ? '\u2197' : '\u2198';
    return `${arrow} ${magnitude}`;
}
