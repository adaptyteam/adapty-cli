import { assertValid } from '../../core/validation.js';
import { pageQuery } from '../pagination.js';

import { toCreateRequest, validateCreateApp } from './create.js';
import { toUpdateRequest, validateUpdateApp } from './update.js';

import type { CreateAppInput } from './create.js';
import type { AppDetail, AppSummary } from './model.js';
import type { UpdateAppInput } from './update.js';
import type { Http } from '../../core/http/index.js';
import type { PageParams, Paginated } from '../pagination.js';

/**
 * Every path of the apps resource in one place, so the endpoints can be read as a list. What each
 * operation needs of its own — input shape, rules, request body — lives in its own file.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise,
 * like a network failure, and one await covers both.
 */
export const apps = (http: Http) => ({
    get: (appId: string) => http.get<AppDetail>(`/apps/${appId}`),
    list: (params?: PageParams) => http.get<Paginated<AppSummary>>('/apps', { query: pageQuery(params) }),

    create: async (input: CreateAppInput): Promise<AppSummary> => {
        assertValid(validateCreateApp(input));

        return http.post<AppSummary>('/apps', toCreateRequest(input));
    },

    update: async (appId: string, input: UpdateAppInput): Promise<AppDetail> => {
        assertValid(validateUpdateApp(input));

        return http.put<AppDetail>(`/apps/${appId}`, toUpdateRequest(input));
    },
});

export type AppsApi = ReturnType<typeof apps>;
