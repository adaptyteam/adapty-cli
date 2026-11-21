import { assertValid } from '../../core/validation.js';
import { pageQuery } from '../pagination.js';

import { toCreateRequest, validateCreateProduct } from './create.js';
import { toPushRequest, validatePushProduct } from './push.js';
import { toUpdateRequest, validateUpdateProduct } from './update.js';

import type { CreateProductInput } from './create.js';
import type { Product } from './model.js';
import type { PushProductInput } from './push.js';
import type { UpdateProductInput } from './update.js';
import type { Http } from '../../core/http/index.js';
import type { PageParams, Paginated } from '../pagination.js';

/** The reads and writes of a product. */
export const products = (http: Http) => ({
    create: async (appId: string, input: CreateProductInput): Promise<Product> => {
        assertValid(validateCreateProduct(input));

        return http.post<Product>(`/apps/${appId}/products`, toCreateRequest(input));
    },

    get: (appId: string, productId: string) => http.get<Product>(`/apps/${appId}/products/${productId}`),

    list: (appId: string, params?: PageParams) =>
        http.get<Paginated<Product>>(`/apps/${appId}/products`, { query: pageQuery(params) }),

    /** The store call runs inside the request, and the answer is the product with its store status. */
    push: async (appId: string, productId: string, input: PushProductInput): Promise<Product> => {
        assertValid(validatePushProduct(input));

        return http.post<Product>(`/apps/${appId}/products/${productId}/push/${input.store}`, toPushRequest(input));
    },

    /** The server takes the whole product, so this reads the stored one and sends it back merged. */
    update: async (appId: string, productId: string, input: UpdateProductInput): Promise<Product> => {
        assertValid(validateUpdateProduct(input));

        const stored = await http.get<Product>(`/apps/${appId}/products/${productId}`);

        return http.put<Product>(`/apps/${appId}/products/${productId}`, toUpdateRequest(stored, input));
    },
});

export type ProductsApi = ReturnType<typeof products>;
