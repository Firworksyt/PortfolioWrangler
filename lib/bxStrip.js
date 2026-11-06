// BX mini strip (Option 2b): last ~10 daily B-Xtrender short-histogram bars
// drawn as an inline SVG with a dashed zero line and a grey max/0/min axis.
// Pure functions only, so they can run in the browser and in Jest.

// Colors sampled from the TradingView B-Xtrender reference.
export const BX_STRIP_COLORS = Object.freeze({
    pos_rising: '#377749',
    pos_falling: '#284c21',
    neg_expanding: '#440f0c',
    neg_contracting: '#7c3635',
});

export const BX_TICK_MIN_GAP_PX = 9;

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Fallback when a bar arrives without a server color: classify by sign only. */
export function bxBarColorKey(bar) {
    if (bar && BX_STRIP_COLORS[bar.color]) return bar.color;
    return bar && bar.value < 0 ? 'neg_expanding' : 'pos_rising';
}

/**
 * Compute bar rectangles, zero line and axis ticks.
 * Returns null when there is nothing drawable.
 */
export function bxStripGeometry(history, { width = 240, height = 40, gap = 3, minTickGapPx = BX_TICK_MIN_GAP_PX } = {}) {
    if (!Array.isArray(history)) return null;
    const bars = history.filter(b => b && isFiniteNumber(b.value));
    if (bars.length === 0) return null;

    const values = bars.map(b => b.value);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const span = (max - min) || 1;
    const y = v => height - ((v - min) / span) * height;
    const zeroY = y(0);
    const barW = (width - gap * (bars.length - 1)) / bars.length;

    const rects = bars.map((b, i) => {
        const yv = y(b.value);
        return {
            x: i * (barW + gap),
            y: Math.min(yv, zeroY),
            w: barW,
            h: Math.max(Math.abs(yv - zeroY), 1),
            colorKey: bxBarColorKey(b),
            date: b.date,
            value: b.value,
        };
    });

    const candidates = [max > 0 ? max : null, 0, min < 0 ? min : null].filter(v => v !== null);
    const ticks = [];
    for (const v of candidates) {
        const ty = y(v);
        if (ticks.length && Math.abs(ty - ticks[ticks.length - 1].y) < minTickGapPx) continue;
        ticks.push({ value: v, label: v === 0 ? '0' : v.toFixed(0), y: ty });
    }

    return { width, height, zeroY, bars: rects, ticks, last: bars[bars.length - 1] };
}

/** SVG markup for the bars and dashed zero line (axis labels are HTML). */
export function renderBxStripSvg(geom) {
    if (!geom) return '';
    const f = n => n.toFixed(2);
    const rects = geom.bars.map(b =>
        `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="1" fill="${BX_STRIP_COLORS[b.colorKey]}"><title>${b.date ?? ''} ${b.value.toFixed(1)}</title></rect>`
    ).join('');
    const zero = `<line class="bx-zero" x1="0" x2="${geom.width}" y1="${f(geom.zeroY)}" y2="${f(geom.zeroY)}" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>`;
    return `<svg class="bx-strip-svg" viewBox="0 0 ${geom.width} ${geom.height}" preserveAspectRatio="none" role="img" aria-label="BX last ${geom.bars.length} days">${rects}${zero}</svg>`;
}

export function formatBxValue(v) {
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
