import { Errors } from '@oclif/core';
import { expect } from 'chai';

import { exitCode, toCliError } from '../../src/cli/errors.js';
import {
    ApiError,
    AuthRequiredError,
    CancelledError,
    DeviceFlowDeniedError,
    DeviceFlowExpiredError,
    NetworkError,
    ValidationError,
} from '../../src/sdk/core/errors.js';

import type { AnySdkError } from '../../src/sdk/core/errors.js';

/** What oclif reads off a thrown error, in the two places it looks. */
type CliError = Error & { code?: string; exitCode?: number; oclif?: { exit?: number } };

const cases: [AnySdkError, number][] = [
    [new ApiError({ code: 'validation_error', message: 'title: is required', status: 400 }), exitCode.api],
    [new ApiError({ code: 'forbidden', message: 'Access denied', status: 403 }), exitCode.auth],
    [new ApiError({ code: 'migration_wizard_no_company', message: 'No company', status: 403 }), exitCode.auth],
    [new ApiError({ message: 'Forbidden', status: 403 }), exitCode.auth],
    [new ApiError({ code: 'revision_conflict', message: 'Revision changed', status: 409 }), exitCode.api],
    [new ApiError({ code: 'validation_failed', message: 'Invalid input', status: 422 }), exitCode.api],
    [new AuthRequiredError('missing'), exitCode.auth],
    [new AuthRequiredError('rejected'), exitCode.auth],
    [new CancelledError(), exitCode.cancelled],
    [new DeviceFlowDeniedError(), exitCode.auth],
    [new DeviceFlowExpiredError(), exitCode.auth],
    [new NetworkError('https://api.example.com/apps/', new TypeError('fetch failed')), exitCode.network],
    [new ValidationError([{ message: 'is required', path: 'appleBundleId' }]), exitCode.usage],
];

describe('toCliError', () => {
    it('gives every error kind an exit code and a non-empty message', () => {
        for (const [error, exit] of cases) {
            const mapped = toCliError(error) as CliError;

            expect(mapped.exitCode, error.kind).to.equal(exit);
            expect(mapped.oclif?.exit, error.kind).to.equal(exit);
            expect(mapped.message, error.kind).to.not.equal('');
        }
    });

    it('sets both places oclif takes the exit code from', () => {
        // handle() reads oclif.exit; Command.catch under --json reads exitCode and never rethrows
        const mapped = toCliError(new CancelledError()) as CliError;

        expect(mapped.oclif?.exit).to.equal(130);
        expect(mapped.exitCode).to.equal(130);
    });

    it('preserves oclif errors and their assigned exits for JSON handling', () => {
        for (const exit of [exitCode.usage, exitCode.cancelled]) {
            const error = new Errors.CLIError('Invalid flag', { code: 'invalid_flag', exit, suggestions: ['Use --help'] });
            const mapped = toCliError(error) as CliError;

            expect(mapped).to.equal(error);
            expect(mapped.exitCode).to.equal(exit);
            expect(mapped.oclif?.exit).to.equal(exit);
            expect(mapped.message).to.equal('Invalid flag');
            expect(mapped.code).to.equal('invalid_flag');
            expect(error.suggestions).to.deep.equal(['Use --help']);
        }
    });

    it('keeps an existing exitCode and does not turn non-exiting errors into usage errors', () => {
        const explicit = Object.assign(new Errors.CLIError('Already mapped', { exit: 4 }), { exitCode: 4 });
        const nonExiting = new Errors.CLIError('Handled elsewhere', { exit: false });

        expect(toCliError(explicit)).to.equal(explicit);
        expect(explicit.exitCode).to.equal(4);
        expect(toCliError(nonExiting)).to.equal(nonExiting);
        expect(nonExiting).to.not.have.property('exitCode');
    });

    it('names the flag the user typed, not the sdk field, for a validation issue', () => {
        const error = new ValidationError([
            { message: 'is required', path: 'appleBundleId' },
            { message: 'at least one store binding is required' },
        ]);

        expect(toCliError(error).message).to.equal(
            'Invalid input:\n  --apple-bundle-id: is required\n  at least one store binding is required',
        );
    });

    it('keeps a real server code and hides the synthetic http_<status> one', () => {
        const real = toCliError(new ApiError({ code: 'validation_error', message: 'title: is required', status: 400 }));
        const synthetic = toCliError(new ApiError({ code: 'http_500', message: 'Server error', status: 500 }));

        expect((real as CliError).code).to.equal('validation_error');
        expect((synthetic as CliError).code).to.equal(undefined);
    });

    it('tells which host could not be reached', () => {
        const error = new NetworkError('https://api.example.com/apps/', new TypeError('fetch failed'));

        expect(toCliError(error).message).to.contain('https://api.example.com/apps/');
    });

    it('passes a foreign error through untouched and wraps a thrown non-error', () => {
        const foreign = new TypeError('boom');

        expect(toCliError(foreign)).to.equal(foreign);
        expect(foreign).to.not.have.property('exitCode');
        expect(toCliError('boom').message).to.equal('boom');
    });
});
