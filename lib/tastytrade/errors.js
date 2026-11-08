// Typed errors for the tastytrade module. Messages never include credentials,
// tokens, or upstream response bodies.

export class TastytradeError extends Error {
    /** @param {string} message @param {{ status?: number|null, code?: string }} [opts] */
    constructor(message, { status = null, code = 'error' } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
    }
}

/** Credentials are missing; the module is idle. */
export class NotConfiguredError extends TastytradeError {
    constructor() {
        super('tastytrade not configured', { code: 'not_configured' });
    }
}

/** Token refresh failed or the API rejected the access token. */
export class AuthError extends TastytradeError {
    constructor(status = null) {
        super('tastytrade auth failed', { status, code: 'auth' });
    }
}

/** 429 after retries. */
export class RateLimitedError extends TastytradeError {
    constructor(status = 429) {
        super('tastytrade rate limited', { status, code: 'rate_limited' });
    }
}

/** 5xx, unexpected 4xx, network failure, or malformed response. */
export class UpstreamError extends TastytradeError {
    constructor(detail, status = null) {
        super(`tastytrade upstream error (${detail})`, { status, code: 'upstream' });
    }
}

/** Request exceeded the timeout. */
export class TimeoutError extends TastytradeError {
    constructor() {
        super('tastytrade request timed out', { code: 'timeout' });
    }
}

/** Path is not on the read-only market-data allowlist. Thrown before any request. */
export class EndpointNotAllowedError extends TastytradeError {
    constructor(method, path) {
        super(`tastytrade endpoint not allowed: ${method} ${path}`, { code: 'not_allowed' });
    }
}
