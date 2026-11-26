import { assertValid } from '../../core/validation.js';
import { pageQuery } from '../pagination.js';

import { createBody, validateCreateVirtualCurrency } from './create.js';
import { upsertBody, validateMappingItems } from './mappings.js';
import { ledgerQuery, profileRoute, validateProfileAddress } from './transactions.js';
import { updateBody, validateUpdateVirtualCurrency } from './update.js';

import type { CreateVirtualCurrencyInput } from './create.js';
import type {
    MappingItem,
    UpsertedMappings,
    VirtualCurrencyDetail,
    VirtualCurrencyList,
    WriteToken,
} from './model.js';
import type { Balances, LedgerPage, LedgerQuery, ProfileAddress } from './transactions.js';
import type { UpdateVirtualCurrencyInput } from './update.js';
import type { Http } from '../../core/http/index.js';
import type { PageParams } from '../pagination.js';

/**
 * The currencies of an app, their product mappings and the coin ledger. No write is retried: a repeat after a
 * lost answer can meet the result of the first one, so the caller reads before it repeats.
 *
 * The validating methods are async on purpose: a broken rule arrives as a rejected promise, like a network
 * failure.
 */
export const virtualCurrencies = (http: Http) => {
    const base = (appId: string) => `/apps/${appId}/virtual-currencies`;
    const get = (appId: string, currencyId: string) => http.get<VirtualCurrencyDetail>(`${base(appId)}/${currencyId}`);

    return {
        get,

        list: (appId: string, page?: PageParams) =>
            http.get<VirtualCurrencyList>(base(appId), { query: pageQuery(page) }),

        create: async (appId: string, input: CreateVirtualCurrencyInput): Promise<VirtualCurrencyDetail> => {
            assertValid(validateCreateVirtualCurrency(input));

            return http.post<VirtualCurrencyDetail>(base(appId), createBody(input));
        },

        /**
         * The server takes both fields, so the field left out is sent as `stored`, the read just before; the caller
         * makes that read, so that a failure of the read is never taken for a lost write.
         */
        update: async (
            appId: string,
            stored: VirtualCurrencyDetail,
            input: UpdateVirtualCurrencyInput,
        ): Promise<VirtualCurrencyDetail> => {
            assertValid(validateUpdateVirtualCurrency(input));

            const currencyId = stored.virtual_currency_id;

            return http.put<VirtualCurrencyDetail>(`${base(appId)}/${currencyId}`, updateBody(stored, input));
        },

        mappings: {
            /** Creates or changes the mapping of each item; a mapping that no item names stays. */
            upsert: async (
                appId: string,
                currencyId: string,
                items: MappingItem[],
                token: WriteToken,
            ): Promise<UpsertedMappings> => {
                assertValid(validateMappingItems(items));

                return http.post<UpsertedMappings>(`${base(appId)}/${currencyId}/mappings`, upsertBody(items, token));
            },

            delete: (appId: string, currencyId: string, productId: string, token: WriteToken) =>
                http.delete<VirtualCurrencyDetail>(`${base(appId)}/${currencyId}/mappings/${productId}`, {
                    query: { expected_updated_at: token.expectedUpdatedAt },
                }),
        },

        /** One page of the coin ledger of the app; the period is required. */
        transactions: {
            list: (appId: string, query: LedgerQuery) =>
                http.get<LedgerPage>(`${base(appId)}/transactions`, { query: ledgerQuery(query) }),
        },

        profiles: {
            /** One page of the ledger of one profile; the period is optional. */
            transactions: async (appId: string, address: ProfileAddress, query: LedgerQuery): Promise<LedgerPage> => {
                assertValid(validateProfileAddress(address));

                const route = profileRoute(appId, address, 'transactions');

                return http.get<LedgerPage>(route.path, { query: { ...route.query, ...ledgerQuery(query) } });
            },

            balances: async (appId: string, address: ProfileAddress): Promise<Balances> => {
                assertValid(validateProfileAddress(address));

                const route = profileRoute(appId, address, 'balances');

                return http.get<Balances>(route.path, { query: route.query });
            },
        },
    };
};

export type VirtualCurrenciesApi = ReturnType<typeof virtualCurrencies>;
