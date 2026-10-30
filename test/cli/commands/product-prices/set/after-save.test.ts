import { expect } from 'chai';

import { afterSave } from '../../../../../src/cli/commands/product-prices/set/lib/after-save.js';
import { CliError, exitCode } from '../../../../../src/cli/errors.js';
import { CancelledError, NetworkError } from '../../../../../src/sdk/core/errors.js';

describe('afterSave', () => {
    it('turns Ctrl+C during the wait into exit 130 that still says the prices were saved', () => {
        const error = afterSave(new CancelledError(), 2);

        expect(error.exitCode).to.equal(exitCode.cancelled);
        expect(error.json).to.include({ saved: true, saved_rows: 2 });
        expect(error.message).to.equal('The prices were saved, but the wait was cancelled; `product-prices list` shows the sync.');
    });

    it('keeps the exit code and the code of a network failure', () => {
        const error = afterSave(new NetworkError('https://api.example/prices', new TypeError('fetch failed')), 1);

        expect(error.exitCode).to.equal(exitCode.network);
        expect(error.json).to.include({ code: 'network_error' });
        expect(error.json).to.include({ saved: true, saved_rows: 1 });
        expect(error.message).to.match(/^The prices were saved, but reading the sync failed: /);
    });

    it('passes an error that already says saved through unchanged', () => {
        const failure = new CliError('The prices were saved, but the store sync failed', exitCode.api, 'price_sync_failed', {
            json: { saved: true, saved_rows: 1 },
        });

        expect(afterSave(failure, 1)).to.equal(failure);
    });

    it('gives a plain error exit 1 and still says saved', () => {
        const error = afterSave(new Error('boom'), 1);

        expect(error.exitCode).to.equal(1);
        expect(error.json).to.include({ message: error.message, saved: true, saved_rows: 1 });
    });
});
