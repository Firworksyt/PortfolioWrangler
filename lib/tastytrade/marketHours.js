/** US regular session, Mon-Fri 9:30-16:00 America/New_York (exchange holidays not modeled). */
export function isUsMarketOpen(date) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

/** TTL helper for market data: short while the market is open, long while closed. */
export function marketHoursTtl({ openMs, closedMs }) {
    return (nowMs) => (isUsMarketOpen(new Date(nowMs)) ? openMs : closedMs);
}
