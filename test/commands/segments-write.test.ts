import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { assertFetch, mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const SEGMENT_DETAIL = {
    created_at: '2026-09-30T06:40:48Z',
    description: 'Created from Apple Search Ads campaign "Brand".',
    filters: [{ field_name: 'campaign', operator: 'IN', segment_filter_id: '7e841fc6-ddf0-4a62-852f-65556450ba00', value_list: ['2144520245'] }],
    id: TEST_RESOURCE_ID,
    profile_count: 0,
    refresh_in_progress: false,
    title: '[ASA] Campaign: Brand',
    updated_at: '2026-09-30T06:40:48Z',
};

describe('segments create/update', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('create posts the portal body to /apps/{app}/segments', async () => {
        fetchStub = mockFetch([SEGMENT_DETAIL]);

        const { stdout } = await runCommand(
            `segments create --app ${TEST_APP_ID} --title "[ASA] Campaign: Brand" --filter campaign:IN:2144520245`,
        );

        assertFetch({
            body: { filters: [{ field_name: 'campaign', operator: 'IN', value_list: ['2144520245'] }], title: '[ASA] Campaign: Brand' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });

        expect(stdout).to.include(TEST_RESOURCE_ID);
    });

    it('create sends several filters and the description', async () => {
        fetchStub = mockFetch([SEGMENT_DETAIL]);

        await runCommand(
            `segments create --app ${TEST_APP_ID} --title T --description D --filter campaign:IN:1,2 --filter ad_group:IN:3`,
        );

        assertFetch({
            body: {
                description: 'D',
                filters: [
                    { field_name: 'campaign', operator: 'IN', value_list: ['1', '2'] },
                    { field_name: 'ad_group', operator: 'IN', value_list: ['3'] },
                ],
            },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/segments/`,
            stub: fetchStub,
        });
    });

    it('update puts the full body to /apps/{app}/segments/{id}', async () => {
        fetchStub = mockFetch([SEGMENT_DETAIL]);

        await runCommand(`segments update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title T --filter creative:IN:9`);

        assertFetch({
            body: { filters: [{ field_name: 'creative', operator: 'IN', value_list: ['9'] }], title: 'T' },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('refuses a malformed --filter before the network', async () => {
        fetchStub = mockFetch([SEGMENT_DETAIL]);

        const { error } = await runCommand(`segments create --app ${TEST_APP_ID} --title T --filter campaign=1`);

        expect(error?.message).to.include('field:OPERATOR:value');
        expect(fetchStub.called).to.equal(false);
    });

    it('renders a portal validation error per field', async () => {
        fetchStub = mockFetchFailure({ error_code: 'base_error', errors: { title: ['Field required'] }, status_code: 400 }, { status: 400 });

        const { error } = await runCommand(`segments create --app ${TEST_APP_ID} --title T --filter campaign:IN:1`);

        expect(error?.message).to.include('title: Field required');
    });
});
