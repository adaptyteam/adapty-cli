import { expect } from 'chai';

import { explainHeadersTimeout } from '../../../../../src/cli/commands/fallbacks/get/lib/timeout.js';
import { CliError } from '../../../../../src/cli/errors.js';
import { ApiError, NetworkError } from '../../../../../src/sdk/core/errors.js';

const URL = 'https://api.example/apps/x/fallbacks/';

/** What fetch rejects with when undici waited 300 s for the headers: the code sits one cause deep. */
const fetchFailed = (code: string): TypeError =>
    new TypeError('fetch failed', { cause: Object.assign(new Error('Headers Timeout Error'), { code }) });

describe('fallbacks get: explainHeadersTimeout', () => {
    it('says the server did not answer in 300 s, as exit 5 with the network_error code', () => {
        const error = explainHeadersTimeout(new NetworkError(URL, fetchFailed('UND_ERR_HEADERS_TIMEOUT')));

        expect(error).to.be.instanceOf(CliError);
        const cli = error as CliError;
        expect(cli.exitCode).to.equal(5);
        expect(cli.json.code).to.equal('network_error');

        expect(cli.message).to.equal('The server did not answer in 300 s. It builds the file before it answers; '
            + 'a large app can take minutes. Try again later.');

        expect(cli.json.message).to.equal(cli.message);
    });

    it('passes every other error through untouched', () => {
        const reset = new NetworkError(URL, fetchFailed('ECONNRESET'));
        const api = new ApiError({ message: 'Not found', status: 404 });

        expect(explainHeadersTimeout(reset)).to.equal(reset);
        expect(explainHeadersTimeout(api)).to.equal(api);
    });
});
