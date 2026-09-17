import { expect } from 'chai';
import sinon from 'sinon';

import { createMigrationContext } from '../../../../src/cli/context/migration/model.js';
import { requireMigrationSelection, resolveMigrationSelection } from '../../../../src/cli/context/migration/resolve.js';
import { CliError } from '../../../../src/cli/errors.js';
import { rejection } from '../../../helpers/rejection.js';

const session = { apiUrl: 'https://api.example.com/api/v1/developer', token: 'secret-token' };
const context = createMigrationContext(session, 'opaque/id');

describe('migration selection resolution', () => {
    const store = { load: () => Promise.resolve(context) };

    it('uses flag before env and context; env before context, without reading the file', async () => {
        const unreadable = { load: sinon.stub().rejects(new Error('must not read context')) };

        expect(await resolveMigrationSelection({ session, store: unreadable, migration: 'flag', envMigration: 'env' }))
            .to.deep.equal({ currentMigrationId: 'flag', source: 'flag' });

        expect(await resolveMigrationSelection({ session, store: unreadable, envMigration: 'env' }))
            .to.deep.equal({ currentMigrationId: 'env', source: 'env' });

        expect(unreadable.load.called).to.equal(false);
    });

    it('uses matching context, treating an empty environment value as absent', async () => {
        expect(await resolveMigrationSelection({ session, store, envMigration: '' }))
            .to.deep.equal({ currentMigrationId: 'opaque/id', source: 'context' });
    });

    it('keeps the selection when only the API URL changes', async () => {
        for (const changed of [
            { ...session, apiUrl: 'https://staging.example.com/api/v1/developer' },
            { ...session, apiUrl: 'https://api.example.com/other' },
        ]) {
            expect(await resolveMigrationSelection({ session: changed, store }))
                .to.deep.equal({ currentMigrationId: 'opaque/id', source: 'context' });
        }
    });

    it('ignores the selection for another token and makes it available when the original token returns', async () => {
        const changed = { ...session, token: 'other-token' };

        expect(await resolveMigrationSelection({ session: changed, store })).to.equal(undefined);
        expect(await resolveMigrationSelection({ session, store })).to.have.property('currentMigrationId', 'opaque/id');
    });

    it('requires no credentials for explicit IDs and ignores saved context without a token', async () => {
        const anonymous = { token: undefined };
        const unreadable = { load: sinon.stub().rejects(new Error('must not read context')) };

        expect(await resolveMigrationSelection({ session: anonymous, store: unreadable })).to.equal(undefined);

        expect(await resolveMigrationSelection({ session: anonymous, store, envMigration: 'env' }))
            .to.deep.equal({ currentMigrationId: 'env', source: 'env' });

        expect(await requireMigrationSelection({ session: anonymous, store, migration: 'flag' }))
            .to.deep.equal({ currentMigrationId: 'flag', source: 'flag' });

        expect(unreadable.load.called).to.equal(false);
    });

    for (const input of [{ migration: '' }, { migration: '  ' }, { envMigration: ' \t' }]) {
        it(`rejects explicitly invalid IDs without falling through: ${JSON.stringify(input)}`, async () => {
            const error = await rejection(resolveMigrationSelection({ session, store, ...input })) as CliError;

            expect(error.exitCode).to.equal(2);
            expect(error.json.code).to.equal('migration_required');
        });
    }

    it('returns no selection for current, but an actionable usage error for a required target', async () => {
        const empty = { load: () => Promise.resolve(undefined) };

        expect(await resolveMigrationSelection({ session, store: empty })).to.equal(undefined);

        const error = await rejection(requireMigrationSelection({ session, store: empty })) as CliError;

        expect(error.exitCode).to.equal(2);
        expect(error.json.code).to.equal('migration_required');
        expect(error.message).to.include('migrations list').and.include('migrations use').and.include('-m');
    });

    it('propagates invalid context when it is needed, without changing the error', async () => {
        const error = new CliError('broken', 1, 'migration_context_invalid');
        const broken = { load: sinon.stub().rejects(error) };

        expect(await rejection(resolveMigrationSelection({ session, store: broken }))).to.equal(error);
    });
});
