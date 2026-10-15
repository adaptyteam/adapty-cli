import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, mockFetchFailure, restoreFetch } from '../helpers/mock-fetch.js';

const MESSAGE = 'flows config update rejected a valid button twice';
const SEND = `feedback --sentiment negative --message "${MESSAGE}"`;
const RATE_LIMITED = 'Rate limit for this endpoint exceeded, please try again later';

const mockNoContent = (): sinon.SinonStub =>
    sinon.stub(globalThis, 'fetch').callsFake(() => Promise.resolve(new Response(null, { status: 204 })));

describe('feedback', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('posts the report to /feedback', async () => {
        fetchStub = mockNoContent();

        const { stdout } = await runCommand(`${SEND} --feature flow-generator --context "editing the paywall screen"`);

        assertFetch({
            body: { context: 'editing the paywall screen', feature: 'flow-generator', message: MESSAGE, sentiment: 'negative' },
            callIndex: 0,
            method: 'POST',
            path: '/feedback/',
            stub: fetchStub,
        });

        expect(stdout).to.contain('Feedback sent');
    });

    it('prints a status under --json', async () => {
        fetchStub = mockNoContent();

        const { stdout } = await runCommand(`${SEND} --json`);

        expect(JSON.parse(stdout)).to.deep.equal({ status: 'sent' });
    });

    it('rejects a token in the message before requiring a token, names the flag, and does not echo it', async () => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockNoContent();

        const command = 'feedback --sentiment neutral --message "login failed with dev_live_AbCdEf123456"';
        const human = await runCommand(command);

        expect(human.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(human.error?.message).to.contain('--message');
        expect(human.error?.message).to.not.contain('AbCdEf123456');

        const json = await runCommand(`${command} --json`);
        const result = JSON.parse(json.stdout) as { error: { message: string } };

        expect(result.error.message).to.contain('--message');
        expect(result.error.message).to.not.contain('Not authenticated');
        expect(json.stdout).to.not.contain('AbCdEf123456');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('still requires a token for a valid report', async () => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockNoContent();

        const { error } = await runCommand(SEND);

        expect(error?.oclif?.exit).to.equal(exitCode.auth);
        expect(error?.message).to.contain('Not authenticated');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('accepts only the three sentiments', async () => {
        fetchStub = mockNoContent();

        const { error } = await runCommand(`feedback --sentiment angry --message "${MESSAGE}"`);

        expect(error?.message).to.contain('positive, neutral, negative');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('exits 4 with the server message when the report is over the rate limit', async () => {
        fetchStub = mockFetchFailure(
            { error_code: 'base_error', errors: { non_field_errors: [RATE_LIMITED] }, status_code: 429 },
            { status: 429 },
        );

        const { error } = await runCommand(SEND);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error?.message).to.contain(RATE_LIMITED);
        expect(fetchStub.callCount).to.equal(1);
    });
});
