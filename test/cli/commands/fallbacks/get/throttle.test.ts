import { expect } from 'chai';

import { explainThrottle } from '../../../../../src/cli/commands/fallbacks/get/lib/throttle.js';
import { CliError } from '../../../../../src/cli/errors.js';
import { ApiError, NetworkError } from '../../../../../src/sdk/core/errors.js';

const throttled = (retryAfterMs?: number): ApiError => new ApiError({
    code: 'throttled',
    message: 'Too many requests',
    retryAfterMs,
    status: 429,
});

describe('fallbacks get: explainThrottle', () => {
    it('says how many seconds to wait when the server sent Retry-After', () => {
        const error = explainThrottle(throttled(120_000));

        expect(error).to.be.instanceOf(CliError);
        const cli = error as CliError;
        expect(cli.exitCode).to.equal(4);
        expect(cli.json.retry_after_seconds).to.equal(120);
        expect(cli.message).to.include('30 fallback downloads per hour for each app, shared by all tokens of the app.');
        expect(cli.message).to.include('This command does not retry.');
        expect(cli.message).to.include('Wait at least 120 seconds');
    });

    it('uses the singular for a wait of one second', () => {
        const cli = explainThrottle(throttled(1000)) as CliError;

        expect(cli.message).to.include('Wait at least 1 second (');
    });

    it('asks for a few minutes when the server sent no Retry-After', () => {
        const cli = explainThrottle(throttled()) as CliError;

        expect(cli.json.retry_after_seconds).to.equal(undefined);
        expect(cli.message).to.include('Wait a few minutes');
    });

    it('passes every other error through untouched', () => {
        const notFound = new ApiError({ message: 'Not found', status: 404 });
        const network = new NetworkError('https://api.example/x', new Error('reset'));

        expect(explainThrottle(notFound)).to.equal(notFound);
        expect(explainThrottle(network)).to.equal(network);
    });
});
