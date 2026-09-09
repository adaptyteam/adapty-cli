import { runCommand } from '@oclif/test';

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
});
