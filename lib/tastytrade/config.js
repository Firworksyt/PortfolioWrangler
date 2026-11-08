// Configuration for the tastytrade module. OAuth only: a client id, a client
// secret and a long-lived refresh token, exchanged for short-lived access
// tokens. This is the only auth flow the module supports.

export const DEFAULT_API_BASE = 'https://api.tastyworks.com';

/**
 * @typedef {object} TastytradeConfig
 * @property {boolean} configured   true only when all three OAuth values are present
 * @property {string|null} clientId
 * @property {string|null} clientSecret
 * @property {string|null} refreshToken
 * @property {string} apiBase       TASTYTRADE_API_BASE override (e.g. a local mock), else production
 */

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** @param {Record<string, string|undefined>} env @returns {TastytradeConfig} */
export function loadTastytradeConfig(env = {}) {
    const clientId = clean(env.TASTYTRADE_CLIENT_ID);
    const clientSecret = clean(env.TASTYTRADE_CLIENT_SECRET);
    const refreshToken = clean(env.TASTYTRADE_REFRESH_TOKEN);
    let apiBase = clean(env.TASTYTRADE_API_BASE) || DEFAULT_API_BASE;
    apiBase = apiBase.replace(/\/+$/, '');
    return {
        configured: Boolean(clientId && clientSecret && refreshToken),
        clientId,
        clientSecret,
        refreshToken,
        apiBase,
    };
}
