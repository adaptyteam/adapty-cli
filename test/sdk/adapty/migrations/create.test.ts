import { expect } from 'chai';

import { toCreateRequest } from '../../../../src/sdk/adapty/migrations/create.js';
import { validateCreateMigration } from '../../../../src/sdk/adapty/migrations/index.js';

import type { CreateMigrationInput } from '../../../../src/sdk/adapty/index.js';
import type { Issue } from '../../../../src/sdk/core/errors.js';

const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

describe('validateCreateMigration', () => {
    const cases: { expected: (string | undefined)[]; input: CreateMigrationInput; name: string }[] = [
        { expected: [], input: { appName: 'Acme Fitness' }, name: 'a name for the app the main flow creates' },
        { expected: [], input: { appId: 'app-1', flow: 'transactions' }, name: 'a flow for an app that exists' },
        { expected: [undefined], input: {}, name: 'nothing at all: the input as a whole is wrong' },
        { expected: ['name'], input: { appName: '  ' }, name: 'a name of spaces' },
        { expected: ['name'], input: { appName: 'Acme', flow: 'transactions' }, name: 'a name mixed with a flow' },
        { expected: ['name'], input: { appId: 'app-1', appName: 'Acme' }, name: 'a name mixed with an app' },
        { expected: ['flow'], input: { appId: 'app-1' }, name: 'an app without a flow' },
        { expected: ['flow', 'app'], input: { flow: '' }, name: 'an empty flow and no app' },
        { expected: ['app'], input: { flow: 'transactions' }, name: 'a flow without an app' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateCreateMigration(input))).to.deep.equal(expected);
        });
    }
});

describe('toCreateRequest', () => {
    it('turns a name into the main flow, never letting the caller pick it', () => {
        expect(toCreateRequest({ appName: 'Acme Fitness' })).to.deep.equal({ app_name: 'Acme Fitness', flow: 'main' });
    });

    it('sends an optional flow with the app it runs for', () => {
        expect(toCreateRequest({ appId: 'app-1', flow: 'transactions' })).to.deep.equal({ app_id: 'app-1', flow: 'transactions' });
    });
});
