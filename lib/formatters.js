/**
 * UI formatting helpers shared between browser (app.js) and tests.
 * This file must remain free of DOM references so it can be imported in Node.js.
 */

export function formatVolume(v) {
    if (v == null) return null;
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toString();
}

export function formatMarketCap(v) {
    if (v == null) return null;
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M';
    return '$' + v.toLocaleString();
}

export function buildFundamentalsHTML(f) {
    const items = [];
    const mcap = formatMarketCap(f.marketCap);
    if (mcap) items.push(['Mkt Cap', mcap]);
    if (f.fiftyTwoWeekLow != null && f.fiftyTwoWeekHigh != null) {
        items.push(['52W', `$${f.fiftyTwoWeekLow.toFixed(2)} \u2013 $${f.fiftyTwoWeekHigh.toFixed(2)}`]);
    }
    if (f.trailingPE != null) items.push(['P/E', f.trailingPE.toFixed(1)]);
    else if (f.forwardPE != null) items.push(['Fwd P/E', f.forwardPE.toFixed(1)]);
    const vol = formatVolume(f.regularMarketVolume);
    const avgVol = formatVolume(f.averageVolume);
    if (vol) items.push(['Vol', vol]);
    if (avgVol) items.push(['Avg Vol', avgVol]);
    return items.map(([label, value]) =>
        `<span class="fund-item"><span class="fund-label">${label}</span><span class="fund-value">${value}</span></span>`
    ).join('');
}
