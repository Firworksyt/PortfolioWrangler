/**
 * Response cache keyed by endpoint name + params key. Entries are kept after
 * they expire so callers can fall back to the last good value.
 */
export function createCache() {
    const store = new Map();
    const k = (endpoint, key) => `${endpoint}:${key}`;
    return {
        /** @returns {{ fetchedAt: number, value: any } | undefined} */
        get: (endpoint, key) => store.get(k(endpoint, key)),
        set: (endpoint, key, value, fetchedAt) => store.set(k(endpoint, key), { fetchedAt, value }),
        isFresh: (entry, ttlMs, nowMs) => Boolean(entry) && nowMs - entry.fetchedAt < ttlMs,
        clear: () => store.clear(),
        size: () => store.size,
    };
}
