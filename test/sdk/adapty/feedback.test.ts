import { expect } from 'chai';

import { validateSendFeedback } from '../../../src/sdk/adapty/feedback/index.js';
import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

import type { SendFeedbackInput } from '../../../src/sdk/adapty/index.js';
import type { Issue } from '../../../src/sdk/core/errors.js';

const BASE = 'https://api.example.com/v1';
const MESSAGE = 'the config update kept failing on buttons';

const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

describe('validateSendFeedback', () => {
    const cases: { expected: string[]; input: SendFeedbackInput; name: string }[] = [
        { expected: [], input: { message: MESSAGE, sentiment: 'negative' }, name: 'a plain report' },
        { expected: [], input: { context: 'building a flow', feature: 'flow-generator.v2_beta', message: MESSAGE, sentiment: 'positive' }, name: 'every field' },
        { expected: [], input: { message: 'ok', sentiment: 'neutral' }, name: 'a short message is left to the server' },
        { expected: [], input: { feature: 'flow generator', message: MESSAGE, sentiment: 'neutral' }, name: 'feature format is left to the server' },
        { expected: [], input: { message: 'the dev_ prefix and sk_live_ alone are fine', sentiment: 'neutral' }, name: 'a key prefix without a value' },
        { expected: [], input: { message: 'see https://app.adapty.io/@me for details', sentiment: 'neutral' }, name: 'an @ that is not an email' },
        { expected: [], input: { message: 'uploaded icon@2x.png and hero@3x.webp to the flow', sentiment: 'neutral' }, name: 'retina asset names' },
        { expected: [], input: { message: 'installed @adapty/react-native@3.11.0-beta.next', sentiment: 'neutral' }, name: 'an npm spec with a version' },
        { expected: [], input: { message: 'cloned git@github.com:adaptyteam/adapty-skills.git', sentiment: 'neutral' }, name: 'a git remote' },
        { expected: [], input: { message: 'Bearer authentication-headers were rejected', sentiment: 'negative' }, name: 'prose about bearer auth' },
        { expected: [], input: { message: 'set SECRET_LIVE_API_KEY and pk_test_fixtures first', sentiment: 'neutral' }, name: 'key-like identifiers without digits' },
        { expected: [], input: { message: 'dev_test_case_1 and pk_test_fixture_v2 kept failing', sentiment: 'neutral' }, name: 'snake_case test names with digits' },
        { expected: [], input: { message: 'used bearer auth/api/v1/developer/apps in the request', sentiment: 'neutral' }, name: 'a path after bearer' },
        { expected: [], input: { message: 'the user id was foo@bar.cc1 in the logs', sentiment: 'neutral' }, name: 'a domain that does not end in letters' },
        { expected: ['message'], input: { message: 'exported ADAPTY_DEV_LIVE_AbCdEf123456', sentiment: 'neutral' }, name: 'a key glued to a prefix' },
        { expected: ['message'], input: { message: 'auth failed with dev_live_AbCdEf123456', sentiment: 'negative' }, name: 'a developer token' },
        { expected: ['message'], input: { message: 'used SECRET_LIVE_abcdef1234 for the sdk', sentiment: 'negative' }, name: 'a secret key, any case' },
        { expected: ['message'], input: { message: 'stripe sk_test_51Habcdef failed', sentiment: 'negative' }, name: 'a third-party secret key' },
        { expected: ['context'], input: { context: 'sent Authorization: Bearer abcdefghijklmnop1234', message: MESSAGE, sentiment: 'neutral' }, name: 'a bearer token in context' },
        { expected: ['message'], input: { message: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig expired', sentiment: 'neutral' }, name: 'a JWT' },
        { expected: ['message'], input: { message: 'the user jane.doe+test@example.co.uk could not log in', sentiment: 'neutral' }, name: 'an email address' },
        { expected: ['feature'], input: { feature: 'dev_live_AbCdEf123456', message: MESSAGE, sentiment: 'neutral' }, name: 'a token in feature' },
        { expected: ['message', 'message'], input: { message: 'dev_live_AbCdEf123456 belongs to a@b.io', sentiment: 'neutral' }, name: 'two kinds in one field' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateSendFeedback(input))).to.deep.equal(expected);
        });
    }

    it('stays linear on a long pasted log', () => {
        for (const chunk of ['a', 'a.', 'eyJ', 'eyJ-', 'a@', 'dev_live_', 'bearer ']) {
            validateSendFeedback({ message: chunk.repeat(1_000_000), sentiment: 'neutral' });
        }
    });
});

describe('adapty.feedback', () => {
    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);

        return { calls: scripted.calls, feedback: createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' }).feedback };
    };

    it('posts the report and leaves unset fields to the server', async () => {
        const { calls, feedback } = setup([{ status: 204 }]);

        await feedback.send({ message: MESSAGE, sentiment: 'negative' });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/feedback/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ message: MESSAGE, sentiment: 'negative' });
    });

    it('does not retry a failed post', async () => {
        const { calls, feedback } = setup([{ status: 503 }, { status: 204 }]);

        await rejection(feedback.send({ message: MESSAGE, sentiment: 'neutral' }));

        expect(calls).to.have.length(1);
    });

    it('rejects a report with a secret before any request', async () => {
        const { calls, feedback } = setup([]);

        const error = await rejection(feedback.send({ message: 'failed with dev_live_AbCdEf123456', sentiment: 'neutral' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
