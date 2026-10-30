import { assertValid } from '../../core/validation.js';
import { pageQuery } from '../pagination.js';

import { validateCreateProductGroup } from './create.js';

import type { CreateProductGroupInput } from './create.js';
import type { CreatedProductGroup, ProductGroup } from './model.js';
import type { Http } from '../../core/http/index.js';
import type { PageParams, Paginated } from '../pagination.js';
import type { ProductStore } from '../products/index.js';

const WALK_PAGE_SIZE = 100;

export const productGroups = (http: Http) => {
    const list = (appId: string, store: ProductStore, params?: PageParams) =>
        http.get<Paginated<ProductGroup>>(`/apps/${appId}/product-groups`, {
            query: { ...pageQuery(params), store },
        });

    const findByName = async (appId: string, store: ProductStore, name: string): Promise<ProductGroup | undefined> => {
        for (let page = 1, pages = 1; page <= pages; page += 1) {
            const answer = await list(appId, store, { page, pageSize: WALK_PAGE_SIZE });
            const found = answer.data.find(group => group.group_name === name);

            if (found !== undefined) {
                return found;
            }

            pages = answer.meta.pagination.pages;
        }

        return undefined;
    };

    return {
        list,

        /**
         * The server answers with the name only, so the id is read from the list. The server refuses
         * Google Play and a name that exists, so nothing is read before the POST.
         */
        create: async (appId: string, input: CreateProductGroupInput): Promise<CreatedProductGroup> => {
            assertValid(validateCreateProductGroup(input));

            const name = input.name.trim();

            await http.post<{ group_name: string }>(`/apps/${appId}/product-groups`, {
                group_name: name,
                store: input.store,
            });

            return await findByName(appId, input.store, name) ?? { group_id: null, group_name: name };
        },
    };
};

export type ProductGroupsApi = ReturnType<typeof productGroups>;
