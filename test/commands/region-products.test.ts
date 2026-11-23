import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { ASA_API_BASE, EMPTY_LIST_RESPONSE, mockFetch, restoreFetch } from '../helpers/mock-fetch.js';
import { allOn, urlsOf, writeSession } from '../helpers/region.js';

import type * as sinon from 'sinon';

const ATTRIBUTION_BASE = 'https://api-ua.adapty.io/api/v1/cli';
const ASA_DEV = 'https://asa.dev.example.com/api/v1/cli';
const ATTRIBUTION_DEV = 'https://ua.dev.example.com/api/v1/cli';

const ASA = 'asa campaigns list';
const ATTRIBUTION = 'attribution dimensions';

const ASA_REFUSAL = 'Apple Search Ads commands are not available for EU accounts.';
const ATTRIBUTION_REFUSAL = 'Attribution commands are not available for EU accounts.';

const dimensionsAnswer = { data: { dimensions: [] }, meta: null, success: true };

const session = (region: string): Record<string, unknown> => ({ access_token: 'file-token', region, user: { name: 'Dev' } });

/**
 * Admission: hard-limit and external. Apple Search Ads and attribution have no EU service: an EU
 * token must never reach the US one (no request at all), and the refusal is an exit code and a JSON
 * error an agent reads. A US account keeps its hosts and overrides.
 */
describe('Apple Search Ads and attribution by region', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_ASA_API_URL;
        delete process.env.ADAPTY_ATTRIBUTION_API_URL;
    });

    // tc_dzkvf60g: an EU region stops both products before any request, override or not
    const refused: { command: string; id: string; message: string; override?: [string, string] }[] = [
        { command: ASA, id: 'asa', message: ASA_REFUSAL },
        { command: ASA, id: 'asa-override', message: ASA_REFUSAL, override: ['ADAPTY_ASA_API_URL', ASA_DEV] },
        { command: ATTRIBUTION, id: 'attribution', message: ATTRIBUTION_REFUSAL },
        {
            command: ATTRIBUTION,
            id: 'attribution-override',
            message: ATTRIBUTION_REFUSAL,
            override: ['ADAPTY_ATTRIBUTION_API_URL', ATTRIBUTION_DEV],
        },
    ];

    for (const row of refused) {
        it(`tc_dzkvf60g ${row.id}: exit 2 with the EU refusal, no request`, async () => {
            await writeSession(session('eu'));
            fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

            if (row.override !== undefined) {
                process.env[row.override[0]] = row.override[1];
            }

            const { error } = await runCommand(row.command);

            expect(error?.oclif?.exit, `${row.id}: exit code`).to.equal(2);
            expect(error?.message, `${row.id}: message`).to.equal(row.message);
            expect(fetchStub.callCount, `${row.id}: requests sent`).to.equal(0);
        });
    }

    // tc_ww9xgvn4: the same refusal under --json, one shape for both products
    for (const [id, command, message] of [['asa', ASA, ASA_REFUSAL], ['attribution', ATTRIBUTION, ATTRIBUTION_REFUSAL]] as const) {
        it(`tc_ww9xgvn4 ${id}: --json prints region_not_supported and exits 2, no request`, async () => {
            await writeSession(session('eu'));
            fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${command} --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            expect(JSON.parse(stdout), `${id}: stdout`).to.deep.equal({ error: { code: 'region_not_supported', message } });
            expect(exit, `${id}: exit code`).to.equal(2);
            expect(fetchStub.callCount, `${id}: requests sent`).to.equal(0);
        });
    }

    // tc_fmgdqmqf: a US region keeps each product on its own host, as before
    const kept: { answer: unknown; command: string; host: string; id: string; override?: string }[] = [
        { answer: EMPTY_LIST_RESPONSE, command: ASA, host: ASA_API_BASE, id: 'asa' },
        { answer: EMPTY_LIST_RESPONSE, command: ASA, host: ASA_DEV, id: 'asa-override', override: 'ADAPTY_ASA_API_URL' },
        { answer: dimensionsAnswer, command: ATTRIBUTION, host: ATTRIBUTION_BASE, id: 'attribution' },
        {
            answer: dimensionsAnswer,
            command: ATTRIBUTION,
            host: ATTRIBUTION_DEV,
            id: 'attribution-override',
            override: 'ADAPTY_ATTRIBUTION_API_URL',
        },
    ];

    for (const row of kept) {
        it(`tc_fmgdqmqf ${row.id}: the request goes to ${row.host}`, async () => {
            await writeSession(session('us'));
            fetchStub = mockFetch([row.answer]);

            if (row.override !== undefined) {
                process.env[row.override] = row.host;
            }

            const { error } = await runCommand(row.command);

            expect(error, `${row.id}: command failed`).to.equal(undefined);
            expect(allOn(fetchStub, row.host), `${row.id}: requests went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
        });
    }
});
