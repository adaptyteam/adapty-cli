import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { resolveFeedWindow } from '../../src/lib/asa-flags.js';
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

const NOW = new Date('2026-09-10T12:30:45.123Z');
const NO_CONTENT = { body: undefined, status: 204 };

const DECISION = {
    bid_from: '1.00',
    bid_to: '1.20',
    keyword_id: TEST_RESOURCE_ID,
    kind: 'bid',
    occurred_at: '2026-09-09T08:00:00Z',
    severity: 'action',
    status_from: null,
    status_to: 'working',
    text: { client_visible: true, decision: 'Raise the bid to 1.20', saw: 'Few taps', title: 'Bid raised', why: 'Below target' },
};

const KEYWORD = {
    country: 'US',
    internal_id: TEST_RESOURCE_ID,
    last_decision: DECISION,
    status: 'working',
    text: 'running shoes',
};

const PAGE = { data: [KEYWORD], meta: { pagination: { count: 1, page: 1, pages: 1 } } };

const unwrap = (stderr: string) => stderr.replaceAll(/\s*[›»]\s*/g, ' ').replaceAll(/\s+/g, ' ');

const sentBody = (stub: sinon.SinonStub, callIndex: number): Record<string, unknown> =>
    JSON.parse(requestOf(stub, callIndex).body ?? '{}') as Record<string, unknown>;

const queryOf = (stub: sinon.SinonStub, callIndex: number): URLSearchParams =>
    new URLSearchParams(requestOf(stub, callIndex).url.split('?')[1] ?? '');

describe('asa keyword-autopilot', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'dev_live_test';
        delete process.env.ADAPTY_ASA_API_URL;
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    describe('list', () => {
        it('sends page, page_size and repeated filters, and shows the last decision as one value', async () => {
            fetchStub = mockFetch([PAGE]);

            const { stdout } = await runCommand(
                'asa keyword-autopilot list --status paused --status working --paused-code no_volume --no-enabled --page 2 --page-size 200',
            );

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: '/keyword-autopilot/keywords/',
                query: { enabled: 'false', page: '2', page_size: '200', paused_code: 'no_volume' },
                stub: fetchStub,
            });

            expect(queryOf(fetchStub, 0).getAll('status')).to.deep.equal(['paused', 'working']);
            expect(stdout).to.contain('Last Decision: Bid raised (2026-09-09T08:00:00Z)');
            expect(stdout).to.contain('Page 1 of 1 (1 total)');
        });

        it('omits enabled when neither flag is given and returns the answer unchanged for --json', async () => {
            fetchStub = mockFetch([PAGE]);

            const { stdout } = await runCommand('asa keyword-autopilot list --json');

            expect(queryOf(fetchStub, 0).has('enabled')).to.equal(false);
            expect(JSON.parse(stdout)).to.deep.equal(PAGE);
        });

        it('tells when the page is empty, by filter and by page, and keeps --json unchanged', async () => {
            const empty = { data: [], meta: { pagination: { count: 0, page: 1, pages: 0 } } };

            fetchStub = mockFetch([empty]);
            const plain = await runCommand('asa keyword-autopilot list');
            restoreFetch(fetchStub);
            fetchStub = mockFetch([empty]);
            const filtered = await runCommand('asa keyword-autopilot list --status paused');
            restoreFetch(fetchStub);
            fetchStub = mockFetch([empty]);
            const later = await runCommand('asa keyword-autopilot list --page 2');
            restoreFetch(fetchStub);
            fetchStub = mockFetch([empty]);
            const json = await runCommand('asa keyword-autopilot list --json');

            expect(plain.stdout).to.contain('No keywords are on the keyword autopilot yet.');
            expect(filtered.stdout).to.contain('No keywords match these filters.');
            expect(later.stdout).to.contain('No more rows.');
            expect(JSON.parse(json.stdout)).to.deep.equal(empty);
        });

        it('refuses --page-size 201, an unknown status and an unknown paused code before the network', async () => {
            fetchStub = mockFetch([PAGE]);

            const size = await runCommand('asa keyword-autopilot list --page-size 201');
            const status = await runCommand('asa keyword-autopilot list --status sleeping');
            const code = await runCommand('asa keyword-autopilot list --paused-code nope');

            expect(size.error?.oclif?.exit).to.equal(2);
            expect(status.error?.oclif?.exit).to.equal(2);
            expect(code.error?.oclif?.exit).to.equal(2);
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('get', () => {
        it('reads the card and prints the epoch and the recent decisions as short lines', async () => {
            const card = {
                attempt_no: 1,
                current_epoch: { bid: '1.20', started_on: '2026-09-01' },
                keyword: KEYWORD,
                recent_decisions: [DECISION],
            };

            fetchStub = mockFetch([card]);

            const { stdout } = await runCommand(`asa keyword-autopilot get ${TEST_RESOURCE_ID}`);

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: `/keyword-autopilot/keywords/${TEST_RESOURCE_ID}/`,
                stub: fetchStub,
            });

            expect(stdout).to.contain('Current epoch:');
            expect(stdout).to.contain('Bid: 1.20');
            expect(stdout).to.contain('2026-09-09T08:00:00Z  Bid raised: Raise the bid to 1.20');
        });

        it('refuses a malformed keyword ID', async () => {
            fetchStub = mockFetch([{}]);

            const { error } = await runCommand('asa keyword-autopilot get not-a-uuid');

            expect(error?.oclif?.exit).to.equal(2);
            expect(error?.message).to.contain('Invalid keyword ID');
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('enroll', () => {
        const ENROLLED = { internal_id: TEST_RESOURCE_ID, status: 'ramp', target_cpp: '12.50' };

        it('posts the amounts as typed, the country upper-cased and a generated Idempotency-Key', async () => {
            fetchStub = mockFetch([ENROLLED]);

            const { stdout } = await runCommand(
                `asa keyword-autopilot enroll --yes --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 12.50 --cap 3.0 --country us --aggressiveness 1.5`,
            );

            assertFetch({
                base: ASA_API_BASE,
                body: {
                    aggressiveness: '1.5',
                    cap: '3.0',
                    country: 'US',
                    target_cpp: '12.50',
                    targeting_keyword_internal_id: TEST_RESOURCE_ID,
                },
                callIndex: 0,
                method: 'POST',
                path: '/keyword-autopilot/keywords/',
                stub: fetchStub,
            });

            expect(requestOf(fetchStub, 0).headers.get('Idempotency-Key')).to.match(/^[\da-f-]{36}$/);
            expect(stdout).to.contain('Keyword enrolled.');
        });

        it('returns the API answer unchanged for --json --yes', async () => {
            fetchStub = mockFetch([ENROLLED]);

            const { stdout } = await runCommand(
                `asa keyword-autopilot enroll --json --yes --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 5`,
            );

            expect(JSON.parse(stdout)).to.deep.equal(ENROLLED);
        });

        it('sends only the required fields when the optional ones are absent', async () => {
            fetchStub = mockFetch([ENROLLED]);

            await runCommand(
                `asa keyword-autopilot enroll --yes --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 5 --idempotency-key k-1`,
            );

            expect(sentBody(fetchStub, 0)).to.deep.equal({
                target_cpp: '5',
                targeting_keyword_internal_id: TEST_RESOURCE_ID,
            });

            expect(requestOf(fetchStub, 0).headers.get('Idempotency-Key')).to.equal('k-1');
        });

        it('says so on a replay and does not claim a fresh enrollment', async () => {
            fetchStub = mockFetchSteps([{ body: ENROLLED, headers: { 'Idempotency-Replayed': 'true' } }]);

            const { stdout } = await runCommand(
                `asa keyword-autopilot enroll --yes --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 5`,
            );

            expect(stdout).to.contain('Already applied earlier');
            expect(stdout).to.not.contain('Keyword enrolled.');
        });

        it('refuses a bad UUID, a zero or malformed amount and a bad country before the network', async () => {
            fetchStub = mockFetch([ENROLLED]);
            const base = `asa keyword-autopilot enroll --yes --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 5`;

            const uuid = await runCommand('asa keyword-autopilot enroll --yes --targeting-keyword nope --target-cpp 5');
            const zero = await runCommand(base.replace('--target-cpp 5', '--target-cpp 0.00'));
            const text = await runCommand(base.replace('--target-cpp 5', '--target-cpp abc'));
            const cap = await runCommand(`${base} --cap=-1`);
            const country = await runCommand(`${base} --country USA`);

            expect(uuid.error?.oclif?.exit).to.equal(2);
            expect(zero.error?.message).to.contain('positive');
            expect(text.error?.message).to.contain('plain numbers');
            expect(cap.error?.message).to.contain('plain numbers');
            expect(country.error?.message).to.contain('two-letter');
            expect(fetchStub.called).to.equal(false);
        });

        it('refuses to write without --yes under --json', async () => {
            fetchStub = mockFetch([ENROLLED]);

            const { stderr } = await runCommand(
                `asa keyword-autopilot enroll --json --targeting-keyword ${TEST_RESOURCE_ID} --target-cpp 5`,
            );

            expect(unwrap(stderr)).to.contain('--yes');
            expect(stderr).to.contain('POST /keyword-autopilot/keywords/');
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('unenroll', () => {
        it('posts without a body, accepts the 204 and prints one line', async () => {
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const { stdout } = await runCommand(`asa keyword-autopilot unenroll --yes ${TEST_RESOURCE_ID} --idempotency-key k-2`);

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                headers: { 'Idempotency-Key': 'k-2' },
                method: 'POST',
                path: `/keyword-autopilot/keywords/${TEST_RESOURCE_ID}/unenroll/`,
                stub: fetchStub,
            });

            expect(requestOf(fetchStub, 0).body).to.equal(undefined);
            expect(stdout.trim()).to.equal('Keyword unenrolled.');
        });

        it('returns an acknowledgement for --json and notes a replayed 204', async () => {
            fetchStub = mockFetchSteps([{ ...NO_CONTENT, headers: { 'Idempotency-Replayed': 'true' } }]);

            const human = await runCommand(`asa keyword-autopilot unenroll --yes ${TEST_RESOURCE_ID}`);

            expect(human.stdout).to.contain('Already applied earlier');
            expect(human.stdout).to.contain('Keyword unenrolled.');

            restoreFetch(fetchStub);
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const json = await runCommand(`asa keyword-autopilot unenroll --yes --json ${TEST_RESOURCE_ID}`);

            expect(JSON.parse(json.stdout)).to.deep.equal({ keyword_id: TEST_RESOURCE_ID, unenrolled: true });
        });

        it('refuses a malformed ID and a write without --yes under --json', async () => {
            fetchStub = mockFetchSteps([NO_CONTENT]);

            const bad = await runCommand('asa keyword-autopilot unenroll --yes not-a-uuid');
            const unconfirmed = await runCommand(`asa keyword-autopilot unenroll --json ${TEST_RESOURCE_ID}`);

            expect(bad.error?.oclif?.exit).to.equal(2);
            expect(unwrap(unconfirmed.stderr)).to.contain('--yes');
            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('decisions', () => {
        const FEED = { has_more: true, items: [DECISION], limit: 100, offset: 0 };

        it('sends the window, filters, limit and offset, and prints the blocks and the next offset', async () => {
            fetchStub = mockFetch([FEED]);

            const { stdout } = await runCommand(
                `asa keyword-autopilot decisions --date-from 2026-09-01 --date-to 2026-09-07 --severity alert --severity action --keyword ${TEST_RESOURCE_ID} --limit 100 --offset 200`,
            );

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: '/keyword-autopilot/decisions/',
                query: {
                    date_from: '2026-09-01T00:00:00Z',
                    date_to: '2026-09-08T00:00:00Z',
                    keyword_id: TEST_RESOURCE_ID,
                    limit: '100',
                    offset: '200',
                },
                stub: fetchStub,
            });

            expect(queryOf(fetchStub, 0).getAll('severity')).to.deep.equal(['alert', 'action']);
            expect(stdout).to.contain('Title: Bid raised');
            expect(stdout).to.contain('Saw: Few taps');
            expect(stdout).to.contain('Bid: 1.00 -> 1.20');
            expect(stdout).to.contain('Status: - -> working');
            expect(stdout).to.contain('--offset 100');
        });

        it('pins the default end in the next-page hint and keeps a given --date-to out of it', async () => {
            fetchStub = mockFetch([FEED]);

            const open = await runCommand('asa keyword-autopilot decisions');

            expect(open.stdout).to.contain(`use --date-to ${queryOf(fetchStub, 0).get('date_to')} --offset 100 for the next page`);

            const pinned = await runCommand('asa keyword-autopilot decisions --date-to 2026-09-07');

            expect(pinned.stdout).to.contain('More decisions follow: use --offset 100 for the next page.');
        });

        it('does not suggest an offset past 10000', async () => {
            fetchStub = mockFetch([{ ...FEED, offset: 9950 }]);

            const { stdout } = await runCommand('asa keyword-autopilot decisions --date-to 2026-09-07 --offset 9950');

            expect(stdout).to.contain('--offset cannot go past 10000: narrow the window with --date-from / --date-to.');
            expect(stdout).to.not.contain('use --offset');
        });

        it('defaults to the last 7 days and returns the answer unchanged for --json', async () => {
            fetchStub = mockFetch([{ ...FEED, has_more: false }]);

            const { stdout } = await runCommand('asa keyword-autopilot decisions --json');
            const query = queryOf(fetchStub, 0);

            expect(Date.parse(query.get('date_to') ?? '') - Date.parse(query.get('date_from') ?? '')).to.equal(7 * 86_400_000);
            expect(query.get('limit')).to.equal('100');
            expect(query.get('offset')).to.equal('0');
            expect(JSON.parse(stdout)).to.deep.equal({ ...FEED, has_more: false });
        });

        it('tells when the feed is empty and says no more rows past the first page', async () => {
            const empty = { ...FEED, has_more: false, items: [] };

            fetchStub = mockFetch([empty]);
            const first = await runCommand('asa keyword-autopilot decisions');
            restoreFetch(fetchStub);
            fetchStub = mockFetch([{ ...empty, offset: 100 }]);
            const later = await runCommand('asa keyword-autopilot decisions --offset 100');

            expect(first.stdout).to.contain('No actions or alerts in this window. Routine checks are not listed.');
            expect(later.stdout).to.contain('No more rows.');
            expect(later.stdout).to.not.contain('No actions or alerts');
        });

        it('refuses bad input before the network', async () => {
            fetchStub = mockFetch([FEED]);

            const cases = [
                'asa keyword-autopilot decisions --date-from yesterday',
                'asa keyword-autopilot decisions --date-to 2026-09-01T10:00:00',
                'asa keyword-autopilot decisions --date-from 2026-09-07 --date-to 2026-09-01',
                'asa keyword-autopilot decisions --keyword nope',
                'asa keyword-autopilot decisions --severity info',
                'asa keyword-autopilot decisions --limit 501',
                'asa keyword-autopilot decisions --offset 10001',
            ];

            for (const command of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(2);
            }

            expect(fetchStub.called).to.equal(false);
        });
    });

    describe('feed window', () => {
        it('takes the start of the day for a date in --date-from and the next day start for --date-to', () => {
            expect(resolveFeedWindow({ 'date-from': '2026-09-01', 'date-to': '2026-09-01' }, NOW)).to.deep.equal({
                date_from: '2026-09-01T00:00:00Z',
                date_to: '2026-09-02T00:00:00Z',
            });
        });

        it('sends a full datetime as given, with its offset', () => {
            expect(
                resolveFeedWindow({ 'date-from': '2026-09-01T10:00:00+02:00', 'date-to': '2026-09-02T10:00:00Z' }, NOW),
            ).to.deep.equal({ date_from: '2026-09-01T10:00:00+02:00', date_to: '2026-09-02T10:00:00Z' });
        });

        it('keeps the same start when the resolved end is passed back later', () => {
            const first = resolveFeedWindow({}, NOW);
            const second = resolveFeedWindow({ 'date-to': first.date_to }, new Date(NOW.getTime() + 3_600_000));

            expect(second).to.deep.equal(first);
        });

        it('defaults to now and 7 days before the end', () => {
            expect(resolveFeedWindow({}, NOW)).to.deep.equal({
                date_from: '2026-09-03T12:30:45Z',
                date_to: '2026-09-10T12:30:45Z',
            });

            expect(resolveFeedWindow({ 'date-to': '2026-09-10' }, NOW).date_from).to.equal('2026-09-04T00:00:00Z');
        });

        it('rejects an empty or reversed window and unparseable bounds', () => {
            expect(() => resolveFeedWindow({ 'date-from': '2026-09-02T00:00:00Z', 'date-to': '2026-09-02T00:00:00Z' }, NOW)).to.throw('earlier');
            expect(() => resolveFeedWindow({ 'date-from': '2026-09-11' }, NOW)).to.throw('earlier');

            expect(() => resolveFeedWindow({ 'date-from': '2026-09-11' }, NOW)).to.throw('which defaults to now');

            expect(() => resolveFeedWindow({ 'date-from': '2026-09-11', 'date-to': '2026-09-01' }, NOW)).to.throw(
                /^--date-from must be earlier than --date-to\.$/,
            );

            for (const input of ['2026-13-01', '2026-02-31', '2026-09-01T10:00', '2026-09-01 10:00:00Z', 'now']) {
                expect(() => resolveFeedWindow({ 'date-to': input }, NOW), input).to.throw('Invalid window bound');
            }
        });
    });

    describe('report', () => {
        const REPORT = {
            company: { date_from: '2026-09-04', date_to: '2026-09-10', keywords: 1 },
            keywords: [
                {
                    apple: { text: 'running shoes' },
                    daily: [{ day: '2026-09-04', spend: '9.99' }],
                    outcome: { window_spend: '42.00', window_taps: 7 },
                    state: { country: 'US', paused_code: null, status: 'working', tier: 't2' },
                },
            ],
        };

        it('sends the inclusive window and prints one block per keyword without daily rows', async () => {
            fetchStub = mockFetch([REPORT]);

            const { stdout } = await runCommand('asa keyword-autopilot report --date-from 2026-09-04 --date-to 2026-09-10');

            assertFetch({
                base: ASA_API_BASE,
                callIndex: 0,
                method: 'GET',
                path: '/keyword-autopilot/report/',
                query: { date_from: '2026-09-04', date_to: '2026-09-10' },
                stub: fetchStub,
            });

            expect(stdout).to.contain('Keywords: 1');
            expect(stdout).to.contain('Text: running shoes');
            expect(stdout).to.contain('Window Spend: 42.00');
            expect(stdout).to.not.contain('9.99');
        });

        it('defaults to a 7-day window ending today and returns the full answer for --json', async () => {
            fetchStub = mockFetch([REPORT]);

            const { stdout } = await runCommand('asa keyword-autopilot report --json');
            const query = queryOf(fetchStub, 0);

            expect(query.get('date_to')).to.equal(new Date().toISOString().slice(0, 10));
            expect((Date.parse(query.get('date_to') ?? '') - Date.parse(query.get('date_from') ?? '')) / 86_400_000).to.equal(6);
            expect(JSON.parse(stdout)).to.deep.equal(REPORT);
        });

        it('accepts a 60-day window and refuses 61 days, a reversed window and a bad date', async () => {
            fetchStub = mockFetch([REPORT]);

            const ok = await runCommand('asa keyword-autopilot report --date-from 2026-07-01 --date-to 2026-08-29');
            expect(ok.error).to.equal(undefined);
            expect(fetchStub.callCount).to.equal(1);

            const long = await runCommand('asa keyword-autopilot report --date-from 2026-07-01 --date-to 2026-08-30');
            const reversed = await runCommand('asa keyword-autopilot report --date-from 2026-09-10 --date-to 2026-09-04');
            const bad = await runCommand('asa keyword-autopilot report --date-from 2026-09-10T00:00:00Z');
            const unreal = await runCommand('asa keyword-autopilot report --date-from 2026-13-40');

            expect(long.error?.oclif?.exit).to.equal(2);
            expect(long.error?.message).to.contain('at most 60');
            expect(reversed.error?.oclif?.exit).to.equal(2);
            expect(bad.error?.message).to.contain('YYYY-MM-DD');
            expect(unreal.error?.oclif?.exit).to.equal(2);
            expect(unreal.error?.message).to.contain('not a real calendar date');
            expect(fetchStub.callCount).to.equal(1);
        });
    });
});
