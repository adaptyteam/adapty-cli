import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { ASA_API_BASE, assertFetch, mockFetch, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const PAGE = { pagination: { count: 1, page: 1, pages: 1 } };
const GROUPS_EUR = { data: [{ currency: 'EUR', internal_id: TEST_APP_ID }], meta: PAGE };
const CAMPAIGN_OK = { campaign: { campaign_id: 777, internal_id: TEST_RESOURCE_ID, name: 'Winter push' }, errors: [] };
const CREATE = `asa campaigns create --yes --org ${TEST_APP_ID} --name W --adam-id 1 --country US --daily-budget 50`;
const EUR_50 = { daily_budget_amount: { amount: '50', currency: 'EUR' } };

describe('asa report fixes', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'dev_live_test';
        delete process.env.ADAPTY_ASA_API_URL;
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('takes the money currency from the campaign group when --currency is omitted', async () => {
        fetchStub = mockFetch([GROUPS_EUR, CAMPAIGN_OK]);

        await runCommand(CREATE);

        assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/campaign-groups/', stub: fetchStub });
        assertFetch({ base: ASA_API_BASE, body: EUR_50, callIndex: 1, method: 'POST', path: '/campaigns/', stub: fetchStub });
    });

    it('sends --currency as given without reading the group', async () => {
        fetchStub = mockFetch([CAMPAIGN_OK]);

        await runCommand(`${CREATE} --currency GBP`);

        expect(fetchStub.callCount).to.equal(1);

        assertFetch({
            base: ASA_API_BASE,
            body: { daily_budget_amount: { amount: '50', currency: 'GBP' } },
            callIndex: 0,
            method: 'POST',
            path: '/campaigns/',
            stub: fetchStub,
        });
    });

    it('resolves an ad group update through the ad group and refuses an unknown group', async () => {
        fetchStub = mockFetch([{ campaign_group_id: TEST_APP_ID }, GROUPS_EUR, { ad_group: {}, errors: [] }]);
        await runCommand(`asa ad-groups update ${TEST_RESOURCE_ID} --yes --default-bid 1.5`);
        assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: `/ad-groups/${TEST_RESOURCE_ID}/`, stub: fetchStub });

        assertFetch({
            base: ASA_API_BASE,
            body: { default_bid_amount: { amount: '1.5', currency: 'EUR' } },
            callIndex: 2,
            method: 'PUT',
            path: `/ad-groups/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });

        restoreFetch(fetchStub);
        fetchStub = mockFetch([{ data: [], meta: PAGE }]);
        const { error } = await runCommand(CREATE);

        expect(error?.message).to.contain('not in asa orgs list');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('sends --live-only and --overlap-only as query params', async () => {
        fetchStub = mockFetch([{ data: [], meta: PAGE }]);
        await runCommand('asa keywords list --live-only');
        assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/keywords/', query: { live_only: 'true' }, stub: fetchStub });

        restoreFetch(fetchStub);
        fetchStub = mockFetch([{ data: [], meta: PAGE }]);
        await runCommand('asa search-terms list --overlap-only');
        assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/search-terms/', query: { overlap_only: 'true' }, stub: fetchStub });
    });

    it('warns when the duplicates list is truncated', async () => {
        fetchStub = mockFetch([{ app_id: TEST_APP_ID, duplicates: [], mode: 'x', total_affected_keywords: 9, total_duplicate_groups: 600, truncated: true }]);

        const { stderr } = await runCommand(`asa keywords duplicates --app ${TEST_APP_ID}`);

        expect(stderr).to.contain('Only the first 0 of 600');
    });

    it('prints metrics warnings and units', async () => {
        const meta = { pagination: PAGE.pagination, units: { gross_roas: 'percent', spend: null }, warnings: [{ code: 'search_match_excluded', message: 'Search Match is out' }] };
        fetchStub = mockFetch([{ data: [], meta }]);

        const { stderr, stdout } = await runCommand(
            `asa metrics --entity keyword --date-from 2026-07-01 --date-to 2026-07-31 --metric gross_roas`,
        );

        expect(stderr).to.contain('Search Match is out');
        expect(stdout).to.contain('Units: gross_roas=percent');
    });
});
