/**
 * Days-until-earnings for watchlist card chips.
 * Day math is done on calendar dates in America/Chicago, independent of the
 * server's and browser's own time zones.
 */

export const EARNINGS_TIME_ZONE = 'America/Chicago';
const MS_PER_DAY = 86400000;

/**
 * Calendar date of `now` in the given zone as 'YYYY-MM-DD'.
 * @param {Date} now
 * @param {string} [timeZone]
 */
export function calendarDateInZone(now, timeZone = EARNINGS_TIME_ZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * @param {string} ymd 'YYYY-MM-DD'
 * @returns {{y:number,m:number,d:number}|null}
 */
function parseYmd(ymd) {
    if (typeof ymd !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!match) return null;
    const [y, m, d] = match.slice(1).map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y, m, d };
}

/**
 * Whole calendar days from today (America/Chicago) to `dateYmd`.
 * Negative when the date has passed; null when the date is missing or invalid.
 * @param {string|null|undefined} dateYmd
 * @param {Date} [now]
 */
export function daysUntilEarnings(dateYmd, now = new Date()) {
    const target = parseYmd(dateYmd);
    const today = parseYmd(calendarDateInZone(now));
    if (!target || !today) return null;
    const diff = Date.UTC(target.y, target.m - 1, target.d) - Date.UTC(today.y, today.m - 1, today.d);
    return Math.round(diff / MS_PER_DAY);
}

/**
 * Chip text for an /api/earnings payload, or null to hide the chip.
 * Upcoming dates get a day count (e.g. "Earn 11/17 11d"); today reads
 * "Earn today" and tomorrow "Earn tomorrow". Past or missing dates fall back
 * to the server label unchanged.
 * @param {{date?: string|null, label?: string|null, isEstimate?: boolean}|null|undefined} payload
 * @param {Date} [now]
 */
export function formatEarningsChip(payload, now = new Date()) {
    if (!payload || !payload.label) return null;
    const days = daysUntilEarnings(payload.date, now);
    if (days == null || days < 0) return payload.label;
    if (days === 0) return 'Earn today';
    if (days === 1) return 'Earn tomorrow';
    const { m, d } = parseYmd(payload.date);
    return `Earn ${payload.isEstimate ? '~' : ''}${m}/${d} ${days}d`;
}
