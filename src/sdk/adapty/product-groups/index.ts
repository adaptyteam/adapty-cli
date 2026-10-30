/** The door of the product groups resource: re-exports only. */
export { validateCreateProductGroup } from './create.js';
export { productGroups } from './resource.js';

export type { CreateProductGroupInput } from './create.js';
export type { CreatedProductGroup, ProductGroup } from './model.js';
export type { ProductGroupsApi } from './resource.js';
