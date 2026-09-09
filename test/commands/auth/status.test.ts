import { runCommand } from '@oclif/test';
import { expect } from 'chai';

describe('auth status', () => {
    it('shows not authenticated when no config', async () => {
        const { stdout } = await runCommand('auth status');
        expect(stdout).to.contain('Not authenticated');
    });

    it('returns json when --json flag passed', async () => {
        const { stdout } = await runCommand('auth status --json');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- FIXME if you see this
        const result = JSON.parse(stdout);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- FIXME if you see this
        expect(result.authenticated).to.equal(false);
    });
});
