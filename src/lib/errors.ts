export type ApiErrorBody = {
    detail?: string | undefined;
    error?: string | undefined;
    error_code?: string | undefined;
    errors?: Record<string, string[]> | undefined;
    retry_after_seconds?: number | undefined;
    status_code?: number | undefined;
};

export type ApiErrorFormat = 'asa' | 'developer';

export type ApiErrorOptions = {
    detail?: string | undefined;
    retryAfterSeconds?: number | undefined;
};

export type ListedError = {
    apple_error_code?: null | string;
    apple_error_message?: null | string;
    error_code?: string;
    field_name?: null | string;
    input_ref?: null | number;
    message?: string;
    validation_error_code?: string;
    validation_error_message?: string;
};

export function describeListedError(error: ListedError): { code: string | undefined; text: string } {
    const code = error.error_code ?? error.apple_error_code ?? error.validation_error_code ?? undefined;
    const reason = error.message ?? error.apple_error_message ?? error.validation_error_message ?? code ?? 'rejected';
    const position = error.input_ref === null || error.input_ref === undefined ? '' : ` (item ${error.input_ref + 1})`;
    const field = error.field_name ? `${error.field_name}: ` : '';

    return { code, text: `${field}${reason}${position}` };
}

export class ApiError extends Error {
    // Read by oclif's prettyPrint to render a `Code: ...` line under the message.
    code?: string | undefined;
    detail?: string | undefined;
    errorCode: string;
    fieldErrors: Record<string, string[]>;
    retryAfterSeconds?: number | undefined;
    statusCode: number;

    constructor(
        statusCode: number,
        errorCode: string,
        fieldErrors: Record<string, string[]>,
        opts: ApiErrorOptions = {},
    ) {
    // `message` is what oclif's default error renderer prints. Prefer the server's human text (an ASA
    // `detail` or the developer API's field errors) over the bare code, which reads as gibberish on its own.
        super(ApiError.humanMessage(errorCode, fieldErrors, opts.detail));
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.fieldErrors = fieldErrors;
        this.detail = opts.detail;
        this.retryAfterSeconds = opts.retryAfterSeconds;

        // Surface real server codes as a secondary line; hide synthetic `http_<status>` fallbacks.
        if (!errorCode.startsWith('http_')) {
            this.code = errorCode;
        }
    }

    private static humanMessage(errorCode: string, fieldErrors: Record<string, string[]>, detail?: string): string {
        if (detail) {
            return detail;
        }

        const parts: string[] = [];

        for (const [field, msgs] of Object.entries(fieldErrors)) {
            for (const msg of msgs) {
                parts.push(field === 'non_field_errors' ? msg : `${field}: ${msg}`);
            }
        }

        return parts.length > 0 ? parts.join('; ') : errorCode;
    }

    toHuman(): string {
        const lines: string[] = [`Error: ${this.errorCode}`];
        const entries = Object.entries(this.fieldErrors);

        if (entries.length > 0) {
            lines.push('Field errors:');

            for (const [field, msgs] of entries) {
                for (const msg of msgs) {
                    lines.push(`  ${field}: ${msg}`);
                }
            }
        }

        return lines.join('\n');
    }

    toJSON(): ApiErrorBody {
        return {
            detail: this.detail,
            error_code: this.errorCode,
            errors: Object.keys(this.fieldErrors).length > 0 ? this.fieldErrors : undefined,
            retry_after_seconds: this.retryAfterSeconds,
            status_code: this.statusCode,
        };
    }
}

export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }

    toHuman(): string {
        return `Error: Could not reach Adapty API. ${this.message}`;
    }

    toJSON(): ApiErrorBody {
        return { error_code: 'network_error', errors: { connection: [this.message] }, status_code: 0 };
    }
}

export class AuthRequiredError extends Error {
    constructor() {
        super('Not authenticated. Run `adapty auth login`.');
        this.name = 'AuthRequiredError';
    }
}

function parseListedErrors(errors: ListedError[], statusCode: number, opts: ApiErrorOptions): ApiError {
    const fieldErrors: Record<string, string[]> = {};

    for (const item of errors) {
        if (item.field_name && item.message) {
            fieldErrors[item.field_name] = [...(fieldErrors[item.field_name] ?? []), item.message];
        }
    }

    const described = errors.map(item => describeListedError(item));
    const detail = described.map(item => item.text).join('; ');

    return new ApiError(statusCode, described[0]?.code ?? `http_${statusCode}`, fieldErrors, {
        ...opts,
        detail: detail || undefined,
    });
}

export function parseApiError(
    statusCode: number,
    body: unknown,
    opts: ApiErrorOptions = {},
    format: ApiErrorFormat = 'developer',
): ApiError {
    if (!body || typeof body !== 'object') {
        return new ApiError(statusCode, `http_${statusCode}`, {}, opts);
    }

    const parsed = body as ApiErrorBody & { detail?: unknown; errors?: unknown };

    if (format === 'asa' && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        return parseListedErrors(parsed.errors as ListedError[], statusCode, opts);
    }

    if (parsed.error_code) {
        return new ApiError(statusCode, parsed.error_code, parsed.errors ?? {}, opts);
    }

    if (parsed.error) {
        return new ApiError(statusCode, parsed.error, {}, opts);
    }

    if (format === 'asa' && Array.isArray(parsed.detail)) {
        const fieldErrors: Record<string, string[]> = {};

        for (const item of parsed.detail as { loc?: unknown[]; msg?: string }[]) {
            const field = (item.loc ?? []).slice(1).join('.') || 'body';

            if (item.msg) {
                fieldErrors[field] = [...(fieldErrors[field] ?? []), item.msg];
            }
        }

        return new ApiError(statusCode, `http_${statusCode}`, fieldErrors, opts);
    }

    if (format === 'asa' && typeof parsed.detail === 'string') {
        return new ApiError(statusCode, `http_${statusCode}`, {}, { ...opts, detail: parsed.detail });
    }

    return new ApiError(statusCode, `http_${statusCode}`, {}, opts);
}
