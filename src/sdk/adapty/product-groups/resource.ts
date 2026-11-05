import { assertValid } from '../../core/validation.js';
import { pageQuery } from '../pagination.js';

import { validateCreateProductGroup } from './create.js';

import type { CreateProductGroupInput } from './create.js';
import type { CreatedProductGroup, ProductGroup } from './model.js';
import type { Http } from '../../core/http/index.js';
import type { PageParams, Paginated } from '../pagination.js';
import type { ProductStore } from '../products/index.js';

export const productGroups = (http: Http) => {
    const list = (appId: string, store: ProductStore, params?: PageParams) =>
        http.get<Paginated<ProductGroup>>(`/apps/${appId}/product-groups`, {
            query: { ...pageQuery(params), store },
        });

    return {
        list,

        create: async (appId: string, input: CreateProductGroupInput): Promise<CreatedProductGroup> => {
            assertValid(validateCreateProductGroup(input));

            return http.post<CreatedProductGroup>(`/apps/${appId}/product-groups`, {
                group_name: input.name.trim(),
                store: input.store,
            });
        },
    };
};

export type ProductGroupsApi = ReturnType<typeof productGroups>;
