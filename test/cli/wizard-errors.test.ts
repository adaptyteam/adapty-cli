import { expect } from 'chai';

import { toCliError } from '../../src/cli/errors.js';
import { ApiError } from '../../src/sdk/core/errors.js';

import type { CliError } from '../../src/cli/errors.js';

const mapError = (details: unknown): CliError => toCliError(new ApiError({
    code: 'validation_error', details, message: 'Invalid input', status: 422,
})) as CliError;

describe('Wizard Service error diagnostics', () => {
    it('preserves null, false, empty fields and zero delay in JSON without rendering empty sections', () => {
        for (const delay of [null, 0]) {
            const diagnostics = {
                detail: null,
                fields: [],
                next_step: null,
                request_id: '',
                retry_after_seconds: delay,
                retryable: false,
            };

            const mapped = mapError({ error: { code: 'validation_error', ...diagnostics } });

            expect(mapped.json).to.deep.include(diagnostics);
            expect(mapped.message).to.equal('Invalid input');
        }
    });

    it('preserves retry guidance without appending it to the original JSON message', () => {
        const mapped = mapError({ error: {
            code: 'validation_error',
            detail: 'Invalid input',
            next_step: 'Check status.',
            request_id: 'req_test',
            retry_after_seconds: 30,
            retryable: true,
        } });

        expect(mapped.json).to.include({ message: 'Invalid input', retry_after_seconds: 30, retryable: true });
        expect(mapped.message).to.equal('Invalid input\n\nNext step: Check status.\nRequest ID: req_test');
    });

    it('omits missing diagnostics for minimal or non-object responses', () => {
        for (const body of [null, 'Bad gateway', {}, { error: null }, { error: { code: 'validation_error' } }]) {
            const mapped = mapError(body);

            expect(JSON.parse(JSON.stringify(mapped.json))).to.deep.equal({
                code: 'validation_error',
                error_code: 'validation_error',
                message: 'Invalid input',
                status: 422,
                status_code: 422,
            });

            expect(mapped.message).to.equal('Invalid input');
        }
    });

    it('ignores malformed diagnostics and strips unknown fields from the response', () => {
        const mapped = mapError({ error: {
            code: 'validation_error',
            detail: {},
            fields: [null, 'invalid', { path: 'input.name' }, { path: 'input.id', message: 'Required', internal: 'hidden' }],
            internal: 'hidden',
            next_step: [],
            request_id: 42,
            retry_after_seconds: -1,
            retryable: 'false',
        } });

        expect(JSON.parse(JSON.stringify(mapped.json))).to.deep.equal({
            code: 'validation_error',
            error_code: 'validation_error',
            fields: [{ path: 'input.id', message: 'Required' }],
            message: 'Invalid input',
            status: 422,
            status_code: 422,
        });

        expect(mapped.message).to.equal('Invalid input\n\n  input.id: Required');
    });

    it('keeps Developer API errors and their precedence when both error formats are present', () => {
        const fields = { title: ['must not be blank'] };

        const mapped = mapError({
            error: { code: 'nested_code', detail: 'Not the selected error', fields: [] },
            error_code: 'validation_error',
            errors: fields,
        });

        expect(JSON.parse(JSON.stringify(mapped.json))).to.deep.equal({
            code: 'validation_error',
            error_code: 'validation_error',
            errors: fields,
            message: 'Invalid input',
            status: 422,
            status_code: 422,
        });

        expect(mapped.message).to.equal('Invalid input');
    });
});
