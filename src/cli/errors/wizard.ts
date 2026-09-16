import type { WizardError } from '../../sdk/adapty/migrations/index.js';

export type WizardDiagnostics = Partial<Omit<WizardError['error'], 'code' | 'message'>>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** Copy only known, correctly typed diagnostics from the untrusted response body. */
export const wizardDiagnostics = (body: unknown): WizardDiagnostics => {
    if (!isRecord(body) || (typeof body.error_code === 'string' && body.error_code !== '')) {
        return {};
    }

    const error = body.error;

    if (!isRecord(error) || typeof error.code !== 'string' || error.code === '') {
        return {};
    }

    const diagnostics: WizardDiagnostics = {};

    for (const key of ['detail', 'next_step'] as const) {
        if (typeof error[key] === 'string' || error[key] === null) {
            diagnostics[key] = error[key];
        }
    }

    if (typeof error.retryable === 'boolean') {
        diagnostics.retryable = error.retryable;
    }

    const delay = error.retry_after_seconds;

    if (delay === null || (typeof delay === 'number' && Number.isFinite(delay) && delay >= 0)) {
        diagnostics.retry_after_seconds = delay;
    }

    if (typeof error.request_id === 'string') {
        diagnostics.request_id = error.request_id;
    }

    if (Array.isArray(error.fields)) {
        diagnostics.fields = [];

        for (const field of error.fields as unknown[]) {
            if (isRecord(field) && typeof field.path === 'string' && typeof field.message === 'string') {
                diagnostics.fields.push({ path: field.path, message: field.message });
            }
        }
    }

    return diagnostics;
};

export const wizardErrorMessage = (message: string, diagnostics: WizardDiagnostics): string => {
    const lines = [message];

    if (diagnostics.detail && diagnostics.detail !== message) {
        lines.push(diagnostics.detail);
    }

    if (diagnostics.fields?.length) {
        lines.push('', ...diagnostics.fields.map(field => `  ${field.path}: ${field.message}`));
    }

    if (diagnostics.next_step) {
        lines.push('', `Next step: ${diagnostics.next_step}`);
    }

    if (diagnostics.request_id) {
        lines.push(`Request ID: ${diagnostics.request_id}`);
    }

    return lines.join('\n');
};
