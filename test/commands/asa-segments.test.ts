import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { ASA_API_BASE, assertFetch, mockFetch, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const CAMPAIGN_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_CAMPAIGN_UUID = '22222222-2222-4222-8222-222222222222';
const AD_GROUP_UUID = '33333333-3333-4333-8333-333333333333';
const KEYWORD_UUID = '44444444-4444-4444-8444-444444444444';
const OTHER_KEYWORD_UUID = '55555555-5555-4555-8555-555555555555';

const CAMPAIGN = { campaign_id: 2144520245, internal_id: CAMPAIGN_UUID, name: 'LectMate_CN_Brand' };
const OTHER_CAMPAIGN = { campaign_id: 2144520246, internal_id: OTHER_CAMPAIGN_UUID, name: 'LectMate_US' };
const AD_GROUP = { ad_group_id: 777, internal_id: AD_GROUP_UUID, name: 'US exact' };

const KEYWORDS = {
    data: [
        { internal_id: KEYWORD_UUID, keyword_id: 2289901490, text: 'workflow automation' },
        { internal_id: OTHER_KEYWORD_UUID, keyword_id: 1889007211, text: 'checklist software' },
    ],
    meta: { pagination: { count: 2, page: 1, pages: 1 } },
};

const SEGMENT_DETAIL = {
    created_at: '2026-09-30T06:40:48Z',
    description: 'Created from Apple Search Ads campaign "LectMate_CN_Brand".\n\nID: 2144520245',
    filters: [{ field_name: 'campaign', operator: 'IN', segment_filter_id: 'f1', value_list: ['2144520245'] }],
    id: TEST_RESOURCE_ID,
    profile_count: 0,
    refresh_in_progress: false,
    title: '[ASA] Campaign: LectMate_CN_Brand',
    updated_at: '2026-09-30T06:40:48Z',
};

describe('asa segments', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'dev_live_test';
        delete process.env.ADAPTY_ASA_API_URL;
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('create reads the campaign from ASA and writes the dashboard-named segment', async () => {
        fetchStub = mockFetch([CAMPAIGN, SEGMENT_DETAIL]);

        await runCommand(`asa segments create --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID}`);

        assertFetch({ base: ASA_API_BASE, callIndex: 0, method: 'GET', path: `/campaigns/${CAMPAIGN_UUID}/`, stub: fetchStub });

        assertFetch({
            body: {
                description: 'Created from Apple Search Ads campaign "LectMate_CN_Brand".\n\nID: 2144520245',
                filters: [{ field_name: 'campaign', operator: 'IN', value_list: ['2144520245'] }],
                title: '[ASA] Campaign: LectMate_CN_Brand',
            },
            callIndex: 1,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('create merges several campaigns into one filter and names them in bulk', async () => {
        fetchStub = mockFetch([CAMPAIGN, OTHER_CAMPAIGN, SEGMENT_DETAIL]);

        await runCommand(
            `asa segments create --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID} --campaign ${OTHER_CAMPAIGN_UUID}`,
        );

        assertFetch({
            body: {
                filters: [{ field_name: 'campaign', operator: 'IN', value_list: ['2144520245', '2144520246'] }],
                title: '[ASA] 2 campaigns: LectMate_CN_Brand, LectMate_US',
            },
            callIndex: 2,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('create from keywords looks them up inside the ad group and uses the creative field', async () => {
        fetchStub = mockFetch([KEYWORDS, SEGMENT_DETAIL]);

        await runCommand(
            `asa segments create --yes --app ${TEST_APP_ID} --ad-group ${AD_GROUP_UUID} --keyword ${KEYWORD_UUID} --keyword ${OTHER_KEYWORD_UUID}`,
        );

        assertFetch({
            base: ASA_API_BASE,
            callIndex: 0,
            method: 'GET',
            path: '/keywords/',
            query: { 'ad_group_id': AD_GROUP_UUID, 'page[size]': '1000' },
            stub: fetchStub,
        });

        assertFetch({
            body: {
                filters: [{ field_name: 'creative', operator: 'IN', value_list: ['2289901490', '1889007211'] }],
                title: '[ASA] 2 keywords: workflow automation, checklist software',
            },
            callIndex: 1,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('create from an ad group uses the ad_group field', async () => {
        fetchStub = mockFetch([AD_GROUP, SEGMENT_DETAIL]);

        await runCommand(`asa segments create --yes --app ${TEST_APP_ID} --ad-group ${AD_GROUP_UUID}`);

        assertFetch({
            body: { filters: [{ field_name: 'ad_group', operator: 'IN', value_list: ['777'] }], title: '[ASA] Ad group: US exact' },
            callIndex: 1,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('--title and --description override the dashboard naming', async () => {
        fetchStub = mockFetch([CAMPAIGN, SEGMENT_DETAIL]);

        await runCommand(
            `asa segments create --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID} --title "Brand users" --description "VIP"`,
        );

        assertFetch({
            body: { description: 'VIP', title: 'Brand users' },
            callIndex: 1,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('refuses two source kinds before the network', async () => {
        fetchStub = mockFetch([CAMPAIGN]);

        const { error } = await runCommand(
            `asa segments create --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID} --ad-group ${AD_GROUP_UUID}`,
        );

        expect(error?.message).to.include('either --campaign or --ad-group');
        expect(fetchStub.called).to.equal(false);
    });

    it('refuses a keyword without its ad group before the network', async () => {
        fetchStub = mockFetch([KEYWORDS]);

        const { error } = await runCommand(`asa segments create --yes --app ${TEST_APP_ID} --keyword ${KEYWORD_UUID}`);

        expect(error?.message).to.include('exactly one --ad-group');
        expect(fetchStub.called).to.equal(false);
    });

    it('fails when a keyword is not in the ad group', async () => {
        fetchStub = mockFetch([KEYWORDS]);

        const { error } = await runCommand(
            `asa segments create --yes --app ${TEST_APP_ID} --ad-group ${AD_GROUP_UUID} --keyword ${CAMPAIGN_UUID}`,
        );

        expect(error?.message).to.include(CAMPAIGN_UUID);
        expect(fetchStub.callCount).to.equal(1);
    });

    it('update keeps the stored title and description when none is passed', async () => {
        fetchStub = mockFetch([CAMPAIGN, SEGMENT_DETAIL, SEGMENT_DETAIL]);

        await runCommand(`asa segments update ${TEST_RESOURCE_ID} --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID}`);

        assertFetch({ callIndex: 1, method: 'GET', path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`, stub: fetchStub });

        assertFetch({
            body: {
                description: SEGMENT_DETAIL.description,
                filters: [{ field_name: 'campaign', operator: 'IN', value_list: ['2144520245'] }],
                title: SEGMENT_DETAIL.title,
            },
            callIndex: 2,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('update with --title still keeps the stored description', async () => {
        fetchStub = mockFetch([CAMPAIGN, SEGMENT_DETAIL, SEGMENT_DETAIL]);

        await runCommand(
            `asa segments update ${TEST_RESOURCE_ID} --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID} --title "Renamed"`,
        );

        assertFetch({
            body: { description: SEGMENT_DETAIL.description, title: 'Renamed' },
            callIndex: 2,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('update with both --title and --description skips the read', async () => {
        fetchStub = mockFetch([CAMPAIGN, SEGMENT_DETAIL]);

        await runCommand(
            `asa segments update ${TEST_RESOURCE_ID} --yes --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID} --title "Renamed" --description "D"`,
        );

        assertFetch({
            body: { description: 'D', title: 'Renamed' },
            callIndex: 1,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('list keeps only [ASA] segments', async () => {
        const list = {
            data: [
                { description: null, id: TEST_RESOURCE_ID, title: '[ASA] Campaign: LectMate_CN_Brand' },
                { description: 'High-value users', id: OTHER_CAMPAIGN_UUID, title: 'VIP' },
            ],
            meta: { pagination: { count: 2, page: 1, pages: 1 } },
        };

        fetchStub = mockFetch([list]);

        const { stdout } = await runCommand(`asa segments list --app ${TEST_APP_ID}`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/segments/`, stub: fetchStub });
        expect(stdout).to.include('[ASA] Campaign: LectMate_CN_Brand');
        expect(stdout).to.not.include('VIP');
    });

    it('list --campaign keeps only segments whose filter carries that campaign', async () => {
        const list = {
            data: [
                { description: null, id: TEST_RESOURCE_ID, title: '[ASA] Campaign: LectMate_CN_Brand' },
                { description: null, id: OTHER_CAMPAIGN_UUID, title: '[ASA] Campaign: Other' },
            ],
            meta: { pagination: { count: 2, page: 1, pages: 1 } },
        };

        const otherDetail = {
            ...SEGMENT_DETAIL,
            filters: [{ field_name: 'campaign', operator: 'IN', segment_filter_id: 'f2', value_list: ['999'] }],
            id: OTHER_CAMPAIGN_UUID,
            title: '[ASA] Campaign: Other',
        };

        fetchStub = mockFetch([CAMPAIGN, list, SEGMENT_DETAIL, otherDetail]);

        const { stdout } = await runCommand(`asa segments list --app ${TEST_APP_ID} --campaign ${CAMPAIGN_UUID}`);

        expect(stdout).to.include('[ASA] Campaign: LectMate_CN_Brand');
        expect(stdout).to.not.include('[ASA] Campaign: Other');
    });
});
