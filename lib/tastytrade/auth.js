import { TOKEN_ENDPOINT } from './allowlist.js';
import { AuthError, TastytradeError } from './errors.js';

const EXPIRY_BUFFER_MS = 60 * 1000;

/**
 * OAuth access-token manager. Trades the refresh token for short-lived access
 * tokens, keeps them in memory only, and refreshes on expiry or on demand
 * (after a 401). Concurrent callers share one in-flight refresh.
 */
export function createTokenManager({ config, http, now = () => Date.now() }) {
    let accessToken = null;
    let expiresAt = 0;
    let inflight = null;

    async function refresh() {
        let data;
        try {
            data = await http.request(TOKEN_ENDPOINT.method, TOKEN_ENDPOINT.path, {
                body: {
                    grant_type: 'refresh_token',
                    refresh_token: config.refreshToken,
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                },
            });
        } catch (err) {
            // Any 4xx from the token endpoint means the credentials are bad.
            if (err instanceof TastytradeError && err.status >= 400 && err.status < 500) throw new AuthError(err.status);
            throw err;
        }
        if (!data || typeof data.access_token !== 'string' || !data.access_token) throw new AuthError();
        accessToken = data.access_token;
        const lifetimeSec = Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : 900;
        expiresAt = now() + lifetimeSec * 1000;
        return accessToken;
    }

    /** @param {{ force?: boolean }} [opts] */
    async function getAccessToken({ force = false } = {}) {
        if (!force && accessToken && now() < expiresAt - EXPIRY_BUFFER_MS) return accessToken;
        if (!inflight) inflight = refresh().finally(() => { inflight = null; });
        return inflight;
    }

    function invalidate() {
        accessToken = null;
        expiresAt = 0;
    }

    return { getAccessToken, invalidate };
}
