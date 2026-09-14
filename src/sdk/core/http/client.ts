import { systemClock } from '../clock.js';
import { ApiError, AuthRequiredError, CancelledError, isAbortError, NetworkError } from '../errors.js';

import { defaultErrorParser, defaultShouldRetry } from './policies.js';
import { defaultRetryPolicy, retry } from './retry.js';
import { buildUrl } from './url.js';

import type { Clock } from '../clock.js';
import type { ErrorParser, ShouldRetry } from './policies.js';
import type { RetryAttempt, RetryPolicy } from './retry.js';
import type { QueryParams } from './url.js';

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type RequestOptions = {
    /** A JSON-serializable value, or FormData for file uploads. */
    body?: unknown;
    headers?: Record<string, string> | undefined;
    /** Retry on 429, 5xx and network errors. On by default for GET only. */
    idempotent?: boolean | undefined;
    /** Response headers, e.g. an ETag for optimistic locking. */
    onResponse?: ((headers: Headers) => void) | undefined;
    query?: QueryParams | undefined;
    signal?: AbortSignal | undefined;
};

type BodylessOptions = Omit<RequestOptions, 'body'>;

export type Http = {
    delete<T>(path: string, options?: BodylessOptions): Promise<T>;
    get<T>(path: string, options?: BodylessOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
};

export type HttpOptions = {
    baseUrl: string;
    clock?: Clock | undefined;
    fetch?: typeof globalThis.fetch | undefined;
    headers?: Record<string, string> | undefined;
    onRetry?: ((info: RetryAttempt) => void) | undefined;
    parseError?: ErrorParser | undefined;
    retry?: RetryPolicy | undefined;
    /** When to retry an idempotent request. */
    shouldRetry?: ShouldRetry | undefined;
    signal?: AbortSignal | undefined;
    token?: string | undefined;
    /** Trailing slash in paths (Django style). On by default. */
    trailingSlash?: boolean | undefined;
};

/**
 * The transport: base URL, bearer token, JSON both ways, responses mapped to sdk errors,
 * retry for idempotent requests. It knows nothing about resources or about the CLI.
 */
export const createHttp = (options: HttpOptions): Http => {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const clock = options.clock ?? systemClock;
    const policy = options.retry ?? defaultRetryPolicy;
    const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
    const parseError = options.parseError ?? defaultErrorParser;
    const trailingSlash = options.trailingSlash ?? true;

    const send = async <T>(method: HttpMethod, path: string, req: RequestOptions): Promise<T> => {
        const url = buildUrl(options.baseUrl, path, req.query, trailingSlash);
        const signal = combineSignals(options.signal, req.signal);
        const headers = new Headers({ accept: 'application/json', ...options.headers, ...req.headers });

        if (options.token !== undefined) {
            headers.set('authorization', `Bearer ${options.token}`);
        }

        const init: RequestInit = { headers, method };

        if (req.body instanceof FormData) {
            init.body = req.body;
        } else if (req.body !== undefined) {
            headers.set('content-type', 'application/json');
            init.body = JSON.stringify(req.body);
        }

        if (signal) {
            init.signal = signal;
        }

        let response: Response;

        try {
            response = await fetchImpl(url, init);
        } catch (error) {
            if (signal?.aborted === true || isAbortError(error)) {
                throw new CancelledError();
            }

            throw new NetworkError(url, error);
        }

        req.onResponse?.(response.headers);

        // fetch resolves at the headers; reading the body can still fail or be cancelled.
        // Keep the caller's onResponse callback outside this network-error conversion.
        let payload: unknown;

        try {
            payload = await readBody(response);
        } catch (error) {
            if (signal?.aborted === true || isAbortError(error)) {
                throw new CancelledError();
            }

            throw new NetworkError(url, error);
        }

        if (response.ok) {
            return payload as T;
        }

        if (response.status === 401) {
            throw new AuthRequiredError('rejected');
        }

        const parsed = parseError(response.status, payload);

        throw new ApiError({
            code: parsed.code ?? `http_${response.status}`,
            details: payload,
            message: parsed.message ?? `${method} ${path} failed with HTTP ${response.status}`,
            retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), clock),
            status: response.status,
        });
    };

    const request = <T>(method: HttpMethod, path: string, req: RequestOptions = {}): Promise<T> => {
        const idempotent = req.idempotent ?? method === 'GET';

        if (!idempotent) {
            return send<T>(method, path, req);
        }

        return retry(() => send<T>(method, path, req), {
            clock,
            onRetry: options.onRetry,
            policy,
            shouldRetry,
            signal: combineSignals(options.signal, req.signal),
        });
    };

    return {
        request,
        delete: <T>(path: string, req?: BodylessOptions) => request<T>('DELETE', path, req),
        get: <T>(path: string, req?: BodylessOptions) => request<T>('GET', path, req),
        patch: <T>(path: string, body?: unknown, req?: BodylessOptions) => request<T>('PATCH', path, { ...req, body }),
        post: <T>(path: string, body?: unknown, req?: BodylessOptions) => request<T>('POST', path, { ...req, body }),
        put: <T>(path: string, body?: unknown, req?: BodylessOptions) => request<T>('PUT', path, { ...req, body }),
    };
};

const combineSignals = (...signals: (AbortSignal | undefined)[]): AbortSignal | undefined => {
    const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);

    if (present.length <= 1) {
        return present[0];
    }

    return AbortSignal.any(present);
};

const readBody = async (response: Response): Promise<unknown> => {
    if (response.status === 204) {
        return undefined;
    }

    const text = await response.text();

    if (text.length === 0) {
        return undefined;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

const parseRetryAfter = (header: null | string, clock: Clock): number | undefined => {
    if (header === null) {
        return undefined;
    }

    const seconds = Number(header);

    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(header);

    return Number.isNaN(date) ? undefined : Math.max(0, date - clock.now());
};
