/**
 * Next-earnings helpers for watchlist card badges.
 * Dates come from yahoo-finance2 quoteSummary calendarEvents.earnings.earningsDate.
 */

/**
 * @param {unknown} value
 * @returns {Date|null}
 */
export function coerceDate(value) {
    if (value == null) return null;
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }
    if (typeof value === 'number') {
        // Yahoo sometimes returns seconds
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string') {
        const d = new Date(value);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
}

/**
 * Start of local calendar day for `now`.
 * @param {Date} now
 */
export function startOfLocalDay(now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Pick the next earnings date on or after today (local).
 * Yahoo often returns a 1–2 element range; we take the earliest upcoming.
 * @param {unknown[]} rawDates
 * @param {Date} [now]
 * @returns {Date|null}
 */
export function pickNextEarningsDate(rawDates, now = new Date()) {
    if (!Array.isArray(rawDates) || rawDates.length === 0) return null;
    const today = startOfLocalDay(now);
    const upcoming = [];
    for (const raw of rawDates) {
        const d = coerceDate(raw);
        if (!d) continue;
        const day = startOfLocalDay(d);
        if (day.getTime() >= today.getTime()) upcoming.push(day);
    }
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => a.getTime() - b.getTime());
    return upcoming[0];
}

/**
 * @param {Date} date
 * @param {Date} [now]
 * @returns {string} e.g. "Earn today", "Earn tomorrow", "Earn 9/12"
 */
export function formatEarningsLabel(date, now = new Date()) {
    const day = startOfLocalDay(date);
    const today = startOfLocalDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (day.getTime() === today.getTime()) return 'Earn today';
    if (day.getTime() === tomorrow.getTime()) return 'Earn tomorrow';
    return `Earn ${day.getMonth() + 1}/${day.getDate()}`;
}

/**
 * Build API/UI payload from calendarEvents-shaped data.
 * @param {string} symbol
 * @param {{ earnings?: { earningsDate?: unknown[], isEarningsDateEstimate?: boolean } } | null | undefined} calendarEvents
 * @param {Date} [now]
 */
export function buildEarningsPayload(symbol, calendarEvents, now = new Date()) {
    const earnings = calendarEvents?.earnings;
    const next = pickNextEarningsDate(earnings?.earningsDate ?? [], now);
    if (!next) {
        return {
            symbol,
            date: null,
            label: null,
            isEstimate: false,
        };
    }
    const isEstimate = Boolean(earnings?.isEarningsDateEstimate);
    let label = formatEarningsLabel(next, now);
    if (isEstimate && !label.includes('today') && !label.includes('tomorrow')) {
        label = label.replace(/^Earn /, 'Earn ~');
    }
    return {
        symbol,
        date: next.toISOString().slice(0, 10),
        label,
        isEstimate,
    };
}
