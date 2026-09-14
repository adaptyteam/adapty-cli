import { expect } from 'chai';

import { renderMigrationList } from '../../../../../src/cli/commands/migrations/list/lib/render.js';

import type { Migration, MigrationState } from '../../../../../src/sdk/adapty/index.js';

type App = NonNullable<Migration['app']>;

const UPDATED_AT = '2026-09-14T09:00:00Z';

const migration = (id: string, state: MigrationState, app: App): Migration => ({
    app,
    created_at: UPDATED_AT,
    flow: 'flow',
    id,
    poll_after_seconds: 0,
    progress: null,
    revision: 1,
    state,
    summary: `summary ${id}`,
    updated_at: UPDATED_AT,
});

describe('renderMigrationList', () => {
    it('groups migrations and available flows by app', () => {
        const alpha = { id: 'app-a', name: 'Alpha' };
        const beta = { id: 'app-b', name: 'Beta' };

        const result = renderMigrationList({
            available: [{
                app: alpha,
                detail: 'Ready',
                flow: 'import',
                title: 'Import catalog',
            }],
            items: [
                migration('m-a1', 'running', alpha),
                migration('m-b', 'running', beta),
                migration('m-a2', 'running', alpha),
            ],
        });

        expect(result).to.equal([
            'Alpha (app-a)',
            '  running',
            `    m-a1  flow  ${UPDATED_AT}  summary m-a1`,
            `    m-a2  flow  ${UPDATED_AT}  summary m-a2`,
            '  Available to start:',
            '    import  Import catalog  Ready',
            '',
            'Beta (app-b)',
            '  running',
            `    m-b  flow  ${UPDATED_AT}  summary m-b`,
        ].join('\n'));
    });

    it('sorts states by the user-action priority', () => {
        const app = { id: 'app-a', name: 'Alpha' };

        const result = renderMigrationList({
            available: [],
            items: [
                migration('c', 'canceled', app),
                migration('d', 'completed', app),
                migration('f', 'failed', app),
                migration('r', 'running', app),
                migration('a', 'action_required', app),
            ],
        });

        expect(result).to.equal([
            'Alpha (app-a)',
            '  action_required',
            `    a  flow  ${UPDATED_AT}  summary a`,
            '  running',
            `    r  flow  ${UPDATED_AT}  summary r`,
            '  failed',
            `    f  flow  ${UPDATED_AT}  summary f`,
            '  completed',
            `    d  flow  ${UPDATED_AT}  summary d`,
            '  canceled',
            `    c  flow  ${UPDATED_AT}  summary c`,
        ].join('\n'));
    });

    it('shows a start hint for an empty list', () => {
        expect(renderMigrationList({ available: [], items: [] }))
            .to.equal('No migrations yet. Start one: `adapty migration create --name <app name>`');
    });
});
