import type { Issue } from '../../core/errors.js';
import type { ProductStore } from '../products/index.js';

export type CreateProductGroupInput = {
    name: string;
    store: ProductStore;
};

const MAX_NAME_LENGTH = 64;

export const validateCreateProductGroup = (input: CreateProductGroupInput): Issue[] => {
    const name = input.name.trim();

    if (name === '') {
        return [{ message: 'must not be empty', path: 'name' }];
    }

    return name.length > MAX_NAME_LENGTH
        ? [{ message: `must be at most ${MAX_NAME_LENGTH} characters`, path: 'name' }]
        : [];
};
