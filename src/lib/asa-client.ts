import { randomUUID } from 'node:crypto';

import { regionNotSupported } from '../cli/errors.js';

import { ApiClient } from './api-client.js';
import { resolveLegacySession } from './auth.js';
import { buildUserAgent } from './client-from-config.js';
import { AuthRequiredError, NetworkError } from './errors.js';

import type { QueryParams } from './api-client.js';
import type { AsaSegmentEntity, AsaSegmentSelection } from './asa-flags.js';
import type { AsaAdGroupDTO, AsaCampaignDTO, AsaCampaignGroupDTO, AsaKeywordDTO } from './asa-schemas.js';
import type { PaginatedResponse } from './flags.js';
import type { Config } from '@oclif/core';

export const ASA_API_URL = 'https://api-asa-admin.adapty.io/api/v1/cli';
export const ASA_API_URL_ENV_VAR = 'ADAPTY_ASA_API_URL';

export type AsaCommandContext = {
    config: Config;
};

export async function createAsaClient(command: AsaCommandContext): Promise<ApiClient> {
    const { config } = command;
    const { region, token } = await resolveLegacySession(config);

    // The service has no EU host: an EU token must never reach the US one, whatever the override says
    if (region === 'eu') {
        throw regionNotSupported('Apple Search Ads');
    }

    if (!token) {
        throw new AuthRequiredError();
    }

    return new ApiClient({
        defaultBaseUrl: ASA_API_URL,
        errorFormat: 'asa',
        token,
        urlEnvVar: ASA_API_URL_ENV_VAR,
        userAgent: buildUserAgent(config),
    });
}

export type AsaWriteOptions = {
    body?: unknown;
    idempotencyKey?: string | undefined;
    params?: QueryParams | undefined;
};

export type AsaWriteOutcome<T> = {
    replayed: boolean;
    result: T;
};

export async function asaWrite<T>(
    client: ApiClient,
    method: 'post' | 'put',
    path: string,
    opts: AsaWriteOptions = {},
): Promise<AsaWriteOutcome<T>> {
    const key = opts.idempotencyKey ?? randomUUID();
    let replayed = false;

    const requestOpts = {
        headers: { 'Idempotency-Key': key },
        onResponse(headers: Headers) {
            replayed = headers.get('Idempotency-Replayed') === 'true';
        },
    };

    const send = (): Promise<T> =>
        method === 'post'
            ? client.post<T>(path, opts.body, opts.params, requestOpts)
            : client.put<T>(path, opts.body, opts.params, requestOpts);

    try {
        const result = await send();

        return { replayed, result };
    } catch (error) {
        if (!(error instanceof NetworkError)) {
            throw error;
        }

        const result = await send();

        return { replayed, result };
    }
}

export function noteReplay(replayed: boolean, log: (msg: string) => void): void {
    if (replayed) {
        log('Already applied earlier — showing the stored result.');
    }
}

/** The ASA entities behind a segment source, with the Apple ids the portal filters on. */
export async function fetchAsaSegmentEntities(
    client: ApiClient,
    selection: AsaSegmentSelection,
): Promise<AsaSegmentEntity[]> {
    if (selection.source === 'campaign') {
        const campaigns = await Promise.all(selection.ids.map(id => client.get<AsaCampaignDTO>(`/campaigns/${id}`)));

        return campaigns.map(campaign => ({ id: String(campaign.campaign_id), name: campaign.name }));
    }

    if (selection.source === 'ad-group') {
        const adGroups = await Promise.all(selection.ids.map(id => client.get<AsaAdGroupDTO>(`/ad-groups/${id}`)));

        return adGroups.map(adGroup => ({ id: String(adGroup.ad_group_id), name: adGroup.name }));
    }

    // No single-keyword read exists; the ad group is small, so one scoped page covers the lookup
    const page = await client.get<PaginatedResponse<AsaKeywordDTO>>('/keywords', {
        'ad_group_id': selection.scopeAdGroup,
        'page[size]': '1000',
    });

    const byId = new Map(page.data.map(keyword => [keyword.internal_id, keyword]));
    const missing = selection.ids.filter(id => !byId.has(id));

    if (missing.length > 0) {
        throw new Error(`Keyword(s) not found in ad group ${selection.scopeAdGroup}: ${missing.join(', ')}`);
    }

    return selection.ids.map((id) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- membership checked above
        const keyword = byId.get(id)!;

        return { id: String(keyword.keyword_id), name: keyword.text };
    });
}

export type CurrencySource
    = | { adGroup: string }
        | { anyGroup: true }
        | { campaign: string }
        | { campaignGroup: string };

/**
 * The currency of a write's money amounts: --currency as given, else the one of the entity's campaign group
 * (keywords have no single read, so a keywords update needs every group to share one currency).
 */
export async function resolveCurrency(
    client: ApiClient,
    flag: string | undefined,
    amounts: (string | undefined)[],
    source: CurrencySource,
): Promise<string> {
    if (flag !== undefined || amounts.every(amount => amount === undefined)) {
        return flag ?? '';
    }

    let groupId: string | undefined;

    if ('campaign' in source) {
        groupId = (await client.get<AsaCampaignDTO>(`/campaigns/${source.campaign}`)).campaign_group_id;
    } else if ('adGroup' in source) {
        groupId = (await client.get<AsaAdGroupDTO>(`/ad-groups/${source.adGroup}`)).campaign_group_id;
    } else if ('campaignGroup' in source) {
        groupId = source.campaignGroup;
    }

    const { data } = await client.get<PaginatedResponse<AsaCampaignGroupDTO>>('/campaign-groups', { 'page[size]': '1000' });
    const groups = data.filter(group => groupId === undefined || group.internal_id === groupId);
    const [first] = groups;

    if (first === undefined) {
        throw new Error(`Campaign group ${groupId} is not in asa orgs list; pass --currency.`);
    }

    if (groups.some(group => group.currency !== first.currency)) {
        throw new Error('Your campaign groups use different currencies; pass --currency.');
    }

    return first.currency;
}
