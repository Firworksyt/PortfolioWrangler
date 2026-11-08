import { ENDPOINTS } from './endpoints/index.js';

/** OAuth access-token refresh. The only non-market-data call. */
export const TOKEN_ENDPOINT = Object.freeze({ method: 'POST', path: '/oauth/token' });

/**
 * Read-only allowlist: token refresh plus the market-data endpoint definitions.
 * Exact method + path match; no prefixes, so account, order, balance and
 * position paths can never be reached.
 */
export const ALLOWED_ENDPOINTS = Object.freeze([
    TOKEN_ENDPOINT,
    ...Object.values(ENDPOINTS).map((e) => Object.freeze({ method: e.method, path: e.path })),
]);

export function isAllowedEndpoint(method, path) {
    const m = String(method || '').toUpperCase();
    return ALLOWED_ENDPOINTS.some((e) => e.method === m && e.path === path);
}
