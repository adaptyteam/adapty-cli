import { randomUUID } from 'node:crypto';

import { ApiClient } from './api-client.js';
import { resolveToken } from './auth.js';
import { buildUserAgent } from './client-from-config.js';
import { AuthRequiredError, NetworkError } from './errors.js';

import type { QueryParams } from './api-client.js';
import type { AsaSegmentEntity, AsaSegmentSelection } from './asa-flags.js';
import type { AsaAdGroupDTO, AsaCampaignDTO, AsaKeywordDTO } from './asa-schemas.js';
import type { PaginatedResponse } from './flags.js';
import type { Config } from '@oclif/core';

export const ASA_API_URL = 'https://api-asa-admin.adapty.io/api/v1/cli';
export const ASA_API_URL_ENV_VAR = 'ADAPTY_ASA_API_URL';

export type AsaCommandContext = {
    config: Config;
    jsonEnabled: () => boolean;
};

export async function createAsaClient(command: AsaCommandContext): Promise<ApiClient> {
    const { config } = command;
    const token = await resolveToken(config.configDir);

    if (!token) {
        throw new AuthRequiredError();
    }

    return new ApiClient({
        defaultBaseUrl: ASA_API_URL,
        errorFormat: 'asa',
        quiet: command.jsonEnabled(),
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
