import { systemClock } from '../clock.js';
import { ApiError, AuthRequiredError } from '../errors.js';

import { guardBody, readPayload, transportError } from './body.js';
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

/** A 2xx answer whose body nobody has read: the caller decides where the bytes go. */
export type StreamedResponse = {
    /** Errors while reading arrive as sdk errors: NetworkError, or CancelledError on abort. */
    body: ReadableStream<Uint8Array>;
    headers: Headers;
};

type StreamRequest = Omit<BodylessOptions, 'idempotent'> & {
    /**
     * A stream is a GET, so it is retried up to the headers by default; never after them, because a
     * body handed over is the caller's to read. `false` sends exactly one request, for an answer so
     * expensive to build that a retry costs the server more than the failure did.
     */
    retry?: false | undefined;
};

export type Http = {
    delete<T>(path: string, options?: BodylessOptions): Promise<T>;
    get<T>(path: string, options?: BodylessOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T>;
    request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
    /** A GET whose body is handed over unread, for answers too large to hold in memory. */
    stream(path: string, options?: StreamRequest): Promise<StreamedResponse>;
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
 * retry for idempotent requests. It knows nothing about resources or about the CLI. `stream()` is
 * the one exception to "JSON both ways": a 2xx body goes to the caller as bytes.
 */
export const createHttp = (options: HttpOptions): Http => {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const clock = options.clock ?? systemClock;
    const policy = options.retry ?? defaultRetryPolicy;
    const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
    const parseError = options.parseError ?? defaultErrorParser;
    const trailingSlash = options.trailingSlash ?? true;

    /** Sends the request and maps a non-2xx answer to an sdk error; a 2xx body stays unread. */
    const open = async (method: HttpMethod, path: string, req: RequestOptions): Promise<Response> => {
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
            throw transportError(url, signal, error);
        }

        req.onResponse?.(response.headers);

        if (response.ok) {
            return response;
        }

        const payload = await readPayload(response, url, signal);

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

    const send = async <T>(method: HttpMethod, path: string, req: RequestOptions): Promise<T> => {
        const response = await open(method, path, req);
        const url = buildUrl(options.baseUrl, path, req.query, trailingSlash);

        return await readPayload(response, url, combineSignals(options.signal, req.signal)) as T;
    };

    const retried = <T>(attempt: () => Promise<T>, req: RequestOptions): Promise<T> => retry(attempt, {
        clock,
        onRetry: options.onRetry,
        policy,
        shouldRetry,
        signal: combineSignals(options.signal, req.signal),
    });

    const request = <T>(method: HttpMethod, path: string, req: RequestOptions = {}): Promise<T> => {
        const idempotent = req.idempotent ?? method === 'GET';

        if (!idempotent) {
            return send<T>(method, path, req);
        }

        return retried(() => send<T>(method, path, req), req);
    };

    const stream = (path: string, req: StreamRequest = {}): Promise<StreamedResponse> => {
        const url = buildUrl(options.baseUrl, path, req.query, trailingSlash);
        const signal = combineSignals(options.signal, req.signal);

        const attempt = async (): Promise<StreamedResponse> => {
            const response = await open('GET', path, req);

            return { body: guardBody(response.body, url, signal), headers: response.headers };
        };

        return req.retry === false ? attempt() : retried(attempt, req);
    };

    return {
        request,
        stream,
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
