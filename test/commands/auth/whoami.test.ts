import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../../src/cli/errors.js';
import { assertFetch, mockFetch, restoreFetch } from '../../helpers/mock-fetch.js';

import type sinon from 'sinon';

describe('auth whoami', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ companies: [], email: 'test@example.com', name: 'Test User' }]);
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('calls GET /me', async () => {
        await runCommand('auth whoami');
        assertFetch({ callIndex: 0, method: 'GET', path: '/me/', stub: fetchStub });
    });

    it('prints the answer as labelled lines and returns it untouched under --json', async () => {
        const { stdout } = await runCommand('auth whoami');

        expect(stdout).to.contain('Email: test@example.com');
        expect(stdout).to.contain('Name: Test User');

        const json = await runCommand('auth whoami --json');

        expect(JSON.parse(json.stdout)).to.deep.equal({ companies: [], email: 'test@example.com', name: 'Test User' });
    });

    it('refuses to run without a token, before any request', async () => {
        delete process.env.ADAPTY_TOKEN;

        const { error } = await runCommand('auth whoami');

        expect(error?.oclif?.exit).to.equal(exitCode.auth);
        expect(error?.message).to.contain('adapty auth login');
        expect(fetchStub.callCount).to.equal(0);
    });
});
