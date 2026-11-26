import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import {
    ASA_API_BASE,
    assertFetch,
    mockFetch,
    mockFetchSteps,
    requestOf,
    restoreFetch,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const STATUS = {
    dry_run: true,
    effective_enabled: true,
    enabled: true,
    enrolled: true,
    excluded_campaigns: 0,
    last_run: { run_id: TEST_RESOURCE_ID, status: 'applied' },
    live_available: true,
    mode: 'dry_run',
    open_decisions: { planned: 1, retry_wait: 0, sending: 0 },
};

const FRONT = {
    campaign_id: TEST_RESOURCE_ID,
    campaign_name: 'Brand US',
    country_or_region: 'US',
    currency: 'USD',
    excluded: null,
    monthly_budget: '3000.00',
    pending_change: { decision_id: TEST_RESOURCE_ID, execution_status: 'planned', monthly_budget_to: '3300.00' },
};

const DECISION = {
    budget_change: { campaign_monthly_from: '3000', campaign_monthly_to: '3300', currency: 'USD', receiver_monthly_from: null, receiver_monthly_to: null },
    campaign: { campaign_id: TEST_RESOURCE_ID, campaign_name: 'Brand US' },
    created_at: '2026-09-09T08:00:00Z',
    decision_kind: 'transfer',
    execution_status: 'applied',
    mode: 'live',
    needs_attention: false,
    receiver_campaign: { campaign_id: TEST_RESOURCE_ID, campaign_name: 'Generic US' },
    severity: 'notable',
    text: { decision: 'Move 300 USD', saw: 'Cheap payers', title: 'Budget moved', why: 'Below target' },
};

const NO_CONTENT = { body: undefined, status: 204 };

const unwrap = (stderr: string) => stderr.replaceAll(/\s*[›»]\s*/g, ' ').replaceAll(/\s+/g, ' ');

const sentBody = (stub: sinon.SinonStub, callIndex: number): unknown =>
    JSON.parse(requestOf(stub, callIndex).body ?? '{}');

const queryOf = (stub: sinon.SinonStub, callIndex: number): URLSearchParams =>
    new URLSearchParams(requestOf(stub, callIndex).url.split('?')[1] ?? '');

const methodsOf = (stub: sinon.SinonStub): (string | undefined)[] =>
    stub.getCalls().map((_, i) => requestOf(stub, i).method);

describe('asa budget-autopilot', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'dev_live_test';
        delete process.env.ADAPTY_ASA_API_URL;
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    describe('status', () => {
        it('reads the status and returns it unchanged for --json', async () => {
            fetchStub = mockFetch([STATUS]);

            const human = await runCommand('asa budget-autopilot status');

            assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/budget-autopilot/status/', stub: fetchStub });
            expect(human.stdout).to.contain('Mode: dry_run');
            expect(human.stdout).to.contain('Planned: 1');
            expect(human.stdout).to.not.contain('not connected');

            const json = await runCommand('asa budget-autopilot status --json');

            expect(JSON.parse(json.stdout)).to.deep.equal(STATUS);
        });

        it('says so when the company is not enrolled', async () => {
            fetchStub = mockFetch([{ ...STATUS, enrolled: false }]);

            const { stdout } = await runCommand('asa budget-autopilot status');

            expect(stdout).to.contain('The company is not connected to the budget autopilot.');
        });
    });

    describe('update', () => {
        it('goes live from an enabled dry run: status, fronts, then a PUT with both fields', async () => {
            fetchStub = mockFetch([STATUS, { items: [FRONT, { ...FRONT, campaign_name: 'Out', excluded: { reason: 'manual' } }] }, STATUS]);

            const { stderr, stdout } = await runCommand('asa budget-autopilot update --mode live --yes --idempotency-key k-1');

            expect(methodsOf(fetchStub)).to.deep.equal(['GET', 'GET', 'PUT']);
            assertFetch({ base: ASA_API_BASE, callIndex: 1, method: 'GET', path: '/budget-autopilot/fronts/', stub: fetchStub });

            assertFetch({
                base: ASA_API_BASE,
                body: { dry_run: false, enabled: true },
                callIndex: 2,
                headers: { 'Idempotency-Key': 'k-1' },
                method: 'PUT',
                path: '/budget-autopilot/settings/',
                stub: fetchStub,
            });

            expect(sentBody(fetchStub, 2)).to.deep.equal({ dry_run: false, enabled: true });
            expect(stderr).to.contain('Brand US, US, 3000.00 USD a month');
            expect(stderr).to.not.contain('Out,');
            expect(stderr).to.contain('never changes bids');
            expect(stdout).to.contain('Budget autopilot updated.');
        });

        it('--enable on a stopped company with a stored live mode goes live: fronts read, preview, PUT', async () => {
            fetchStub = mockFetch([{ ...STATUS, dry_run: false, enabled: false }, { items: [FRONT] }, STATUS]);

            const { stderr } = await runCommand('asa budget-autopilot update --enable --yes');

            expect(methodsOf(fetchStub)).to.deep.equal(['GET', 'GET', 'PUT']);
            expect(sentBody(fetchStub, 2)).to.deep.equal({ dry_run: false, enabled: true });
            expect(stderr).to.contain('Brand US, US, 3000.00 USD a month');
        });

        it('--mode dry_run from Live reads no fronts and sends the PUT', async () => {
            fetchStub = mockFetch([{ ...STATUS, dry_run: false, mode: 'live' }, STATUS]);

            await runCommand('asa budget-autopilot update --mode dry_run --yes');

            expect(methodsOf(fetchStub)).to.deep.equal(['GET', 'PUT']);
            expect(sentBody(fetchStub, 1)).to.deep.equal({ dry_run: true, enabled: true });
        });

        it('--mode live when already Live changes nothing', async () => {
            fetchStub = mockFetch([{ ...STATUS, dry_run: false, mode: 'live' }]);

            const { stdout } = await runCommand('asa budget-autopilot update --mode live --yes');

            expect(stdout).to.contain('Nothing to change');
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });

        it('--mode live on a stopped company only stores the mode: no fronts, no live check, own summary', async () => {
            const off = { ...STATUS, enabled: false, live_available: false };

            fetchStub = mockFetch([off, STATUS]);

            await runCommand('asa budget-autopilot update --mode live --yes');

            expect(methodsOf(fetchStub)).to.deep.equal(['GET', 'PUT']);
            expect(sentBody(fetchStub, 1)).to.deep.equal({ dry_run: false, enabled: false });

            restoreFetch(fetchStub);
            fetchStub = mockFetch([off]);

            const { stderr } = await runCommand('asa budget-autopilot update --mode live --json');

            expect(stderr).to.contain('Set the stored mode to live: the budget autopilot stays off and writes nothing to Apple Ads');
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });

        it('keeps the turn-off summary for a company that was on', async () => {
            fetchStub = mockFetch([STATUS]);

            const { stderr } = await runCommand('asa budget-autopilot update --disable --json');

            expect(stderr).to.contain('Turn the budget autopilot off: budgets stay as they are');
        });

        it('lists at most 20 campaigns in the Live preview and counts the rest', async () => {
            const items = Array.from({ length: 23 }, (_, i) => ({ ...FRONT, campaign_name: `C${i}` }));

            fetchStub = mockFetch([STATUS, { items }, STATUS]);

            const { stderr } = await runCommand('asa budget-autopilot update --mode live --yes');

            expect(stderr).to.contain('C19, US');
            expect(stderr).to.not.contain('C20, US');
            expect(stderr).to.contain('and 3 more');
        });

        it('tells when no campaign is managed yet', async () => {
            fetchStub = mockFetch([STATUS, { items: [] }, STATUS]);

            const { stderr } = await runCommand('asa budget-autopilot update --mode live --yes');

            expect(stderr).to.contain('No campaigns are managed yet');
        });

        it('--disable keeps the current mode and reads no fronts', async () => {
            fetchStub = mockFetch([{ ...STATUS, dry_run: false }, STATUS]);

            await runCommand('asa budget-autopilot update --disable --yes');

            expect(methodsOf(fetchStub)).to.deep.equal(['GET', 'PUT']);
            expect(sentBody(fetchStub, 1)).to.deep.equal({ dry_run: false, enabled: false });
        });

        it('sends no PUT when the company is not enrolled', async () => {
            fetchStub = mockFetch([{ ...STATUS, enrolled: false }]);

            const { error } = await runCommand('asa budget-autopilot update --enable --yes');

            expect(error?.message).to.contain('so there is nothing to update');
            expect(error?.oclif?.exit).to.equal(1);
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });

        it('sends no PUT when the state already matches', async () => {
            fetchStub = mockFetch([STATUS]);

            const { stdout } = await runCommand('asa budget-autopilot update --mode dry_run --yes');

            expect(stdout).to.contain('Nothing to change: the budget autopilot is already set this way.');
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });

        it('sends no PUT when Live is not available', async () => {
            fetchStub = mockFetch([{ ...STATUS, live_available: false }]);

            const { error } = await runCommand('asa budget-autopilot update --mode live --yes');

            expect(error?.message).to.contain('Live mode is not available for this company right now.');
            expect(error?.oclif?.exit).to.equal(1);
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });

        it('says so on a replay and does not claim an update', async () => {
            fetchStub = mockFetchSteps([{ body: STATUS }, { body: STATUS, headers: { 'Idempotency-Replayed': 'true' } }]);

            const { stdout } = await runCommand('asa budget-autopilot update --disable --yes');

            expect(stdout).to.contain('Already applied earlier');
            expect(stdout).to.not.contain('Budget autopilot updated.');
        });

        it('refuses no flag at all and --enable with --disable before any request', async () => {
            fetchStub = mockFetch([STATUS]);

            const none = await runCommand('asa budget-autopilot update');
            const both = await runCommand('asa budget-autopilot update --enable --disable');
            const mode = await runCommand('asa budget-autopilot update --mode preview');

            expect(none.error?.oclif?.exit).to.equal(2);
            expect(both.error?.oclif?.exit).to.equal(2);
            expect(mode.error?.oclif?.exit).to.equal(2);
            expect(fetchStub.called).to.equal(false);
        });

        it('writes nothing without --yes under --json', async () => {
            fetchStub = mockFetch([STATUS]);

            const { stderr } = await runCommand('asa budget-autopilot update --disable --json');

            expect(unwrap(stderr)).to.contain('--yes');
            expect(stderr).to.contain('PUT /budget-autopilot/settings/');
            expect(methodsOf(fetchStub)).to.deep.equal(['GET']);
        });
    });

    describe('fronts', () => {
        it('sends the scope filters and prints one block per campaign', async () => {
            fetchStub = mockFetch([{ items: [FRONT] }]);

            const { stdout } = await runCommand(`asa budget-autopilot fronts --campaign-group ${TEST_RESOURCE_ID} --adam-id 1668337467`);

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: '/budget-autopilot/fronts/',
                query: { adam_id: '1668337467', campaign_group_id: TEST_RESOURCE_ID },
                stub: fetchStub,
            });

            expect(stdout).to.contain('Campaign Name: Brand US');
            expect(stdout).to.contain('Monthly Budget To: 3300.00');
        });

        it('tells when the list is empty and keeps --json unchanged', async () => {
            fetchStub = mockFetch([{ items: [] }]);

            const human = await runCommand('asa budget-autopilot fronts');
            const json = await runCommand('asa budget-autopilot fronts --json');

            expect(human.stdout).to.contain('No campaigns are managed by the budget autopilot yet.');
            expect(JSON.parse(json.stdout)).to.deep.equal({ items: [] });
        });

        it('refuses a bad campaign group ID', async () => {
            fetchStub = mockFetch([{ items: [] }]);

            const { error } = await runCommand('asa budget-autopilot fronts --campaign-group nope');

            expect(error?.oclif?.exit).to.equal(2);
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('decisions', () => {
        const FEED = { has_more: true, items: [DECISION], limit: 20, offset: 0 };

        it('sends the window, every filter, limit and offset and prints the blocks and the next offset', async () => {
            fetchStub = mockFetch([FEED]);

            const { stdout } = await runCommand(
                `asa budget-autopilot decisions --date-from 2026-09-01 --date-to 2026-09-07 --severity critical --severity notable --decision-kind transfer --execution-status failed --campaign ${TEST_RESOURCE_ID} --campaign-group ${TEST_RESOURCE_ID} --adam-id 42 --limit 50 --offset 100`,
            );

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: '/budget-autopilot/decisions/',
                query: {
                    adam_id: '42',
                    campaign_group_id: TEST_RESOURCE_ID,
                    campaign_id: TEST_RESOURCE_ID,
                    date_from: '2026-09-01T00:00:00Z',
                    date_to: '2026-09-08T00:00:00Z',
                    decision_kind: 'transfer',
                    execution_status: 'failed',
                    limit: '50',
                    offset: '100',
                },
                stub: fetchStub,
            });

            expect(queryOf(fetchStub, 0).getAll('severity')).to.deep.equal(['critical', 'notable']);
            expect(stdout).to.contain('Receiver campaign: Generic US');
            expect(stdout).to.contain('Title: Budget moved');
            expect(stdout).to.contain('Monthly budget: 3000 -> 3300 USD');
            expect(stdout).to.contain('Needs attention: false');
            expect(stdout).to.contain('--offset 20');
        });

        it('pins the default end in the next-page hint', async () => {
            fetchStub = mockFetch([FEED]);

            const { stdout } = await runCommand('asa budget-autopilot decisions');

            expect(stdout).to.contain(`use --date-to ${queryOf(fetchStub, 0).get('date_to')} --offset 20 for the next page`);
        });

        it('defaults to 7 days, limit 20 and offset 0, and keeps --json unchanged', async () => {
            fetchStub = mockFetch([{ ...FEED, has_more: false }]);

            const { stdout } = await runCommand('asa budget-autopilot decisions --json');
            const query = queryOf(fetchStub, 0);

            expect(Date.parse(query.get('date_to') ?? '') - Date.parse(query.get('date_from') ?? '')).to.equal(7 * 86_400_000);
            expect(query.get('limit')).to.equal('20');
            expect(query.get('offset')).to.equal('0');
            expect(JSON.parse(stdout)).to.deep.equal({ ...FEED, has_more: false });
        });

        it('refuses bad input before the network', async () => {
            fetchStub = mockFetch([FEED]);

            const cases = [
                'asa budget-autopilot decisions --limit 201',
                'asa budget-autopilot decisions --campaign nope',
                'asa budget-autopilot decisions --campaign-group nope',
                'asa budget-autopilot decisions --date-from 2026-09-07 --date-to 2026-09-01',
                'asa budget-autopilot decisions --severity info',
                'asa budget-autopilot decisions --decision-kind nope',
                'asa budget-autopilot decisions --decision-kind campaign_enrolled',
                'asa budget-autopilot decisions --execution-status nope',
            ];

            for (const command of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(2);
            }

            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('exclude', () => {
        it('posts without a body and prints the item, with a note on a replay', async () => {
            fetchStub = mockFetchSteps([
                { body: FRONT, status: 201 },
                { body: FRONT, headers: { 'Idempotency-Replayed': 'true' } },
            ]);

            const first = await runCommand(`asa budget-autopilot exclude --yes ${TEST_RESOURCE_ID} --idempotency-key k-2`);

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                headers: { 'Idempotency-Key': 'k-2' },
                method: 'POST',
                path: `/budget-autopilot/campaigns/${TEST_RESOURCE_ID}/exclusion/`,
                stub: fetchStub,
            });

            expect(requestOf(fetchStub, 0).body).to.equal(undefined);
            expect(first.stdout).to.contain('Campaign excluded.');
            expect(first.stdout).to.contain('Campaign Name: Brand US');

            const replay = await runCommand(`asa budget-autopilot exclude --yes ${TEST_RESOURCE_ID}`);

            expect(replay.stdout).to.contain('Already applied earlier');
            expect(replay.stdout).to.not.contain('Campaign excluded.');
        });

        it('refuses a bad UUID and a write without --yes under --json', async () => {
            fetchStub = mockFetch([FRONT]);

            const bad = await runCommand('asa budget-autopilot exclude --yes nope');
            const unconfirmed = await runCommand(`asa budget-autopilot exclude --json ${TEST_RESOURCE_ID}`);

            expect(bad.error?.oclif?.exit).to.equal(2);
            expect(unwrap(unconfirmed.stderr)).to.contain('--yes');
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('include', () => {
        it('posts without a body, accepts the 204 and prints one line', async () => {
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const { stdout } = await runCommand(`asa budget-autopilot include --yes ${TEST_RESOURCE_ID} --idempotency-key k-3`);

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                headers: { 'Idempotency-Key': 'k-3' },
                method: 'POST',
                path: `/budget-autopilot/campaigns/${TEST_RESOURCE_ID}/include/`,
                stub: fetchStub,
            });

            expect(requestOf(fetchStub, 0).body).to.equal(undefined);
            expect(stdout.trim()).to.equal('Exclusion lifted. The next weekly run decides whether the campaign is managed again.');
        });

        it('returns an acknowledgement for --json and notes a replayed 204', async () => {
            fetchStub = mockFetchSteps([{ ...NO_CONTENT, headers: { 'Idempotency-Replayed': 'true' } }]);

            const human = await runCommand(`asa budget-autopilot include --yes ${TEST_RESOURCE_ID}`);

            expect(human.stdout).to.contain('Already applied earlier');

            restoreFetch(fetchStub);
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const json = await runCommand(`asa budget-autopilot include --yes --json ${TEST_RESOURCE_ID}`);

            expect(JSON.parse(json.stdout)).to.deep.equal({ campaign_id: TEST_RESOURCE_ID, included: true });
        });

        it('refuses a bad UUID and a write without --yes under --json', async () => {
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const bad = await runCommand('asa budget-autopilot include --yes nope');
            const unconfirmed = await runCommand(`asa budget-autopilot include --json ${TEST_RESOURCE_ID}`);

            expect(bad.error?.oclif?.exit).to.equal(2);
            expect(unwrap(unconfirmed.stderr)).to.contain('--yes');
            expect(fetchStub.called).to.equal(false);
        });
    });
});
