import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { createScriptedFetch } from '../../../src/sdk/core/testing.js';

/**
 * Who the caller is, on every request of both clients. The migrations client is the one section 3
 * asks for `X-Adapty-Interactive`, so the assertions read it there; `apps` proves the header is a
 * property of the transport, not of one resource.
 */
const setup = (interactive?: boolean) => {
    const scripted = createScriptedFetch([{ body: { available: [], items: [] } }, { body: { data: [] } }]);

    const adapty = createAdapty({
        fetch: scripted.fetch,
        interactive,
        token: 'tok',
        userAgent: 'adapty-cli/test',
    });

    return { adapty, calls: scripted.calls };
};

describe('adapty caller headers', () => {
    it('says a person is watching, on every client', async () => {
        const { adapty, calls } = setup(true);

        await adapty.migrations.list();
        await adapty.apps.list();

        expect(calls[0]?.headers.get('x-adapty-interactive')).to.equal('true');
        expect(calls[1]?.headers.get('x-adapty-interactive')).to.equal('true');
    });

    it('says nobody is, which is the half of the audit trail worth having', async () => {
        const { adapty, calls } = setup(false);

        await adapty.migrations.list();

        expect(calls[0]?.headers.get('x-adapty-interactive')).to.equal('false');
        expect(calls[0]?.headers.get('user-agent')).to.equal('adapty-cli/test');
    });

    it('stays silent when the caller does not claim to know', async () => {
        const { adapty, calls } = setup();

        await adapty.migrations.list();

        expect(calls[0]?.headers.get('x-adapty-interactive')).to.equal(null);
        expect(calls[0]?.headers.get('user-agent')).to.equal('adapty-cli/test');
    });
});
