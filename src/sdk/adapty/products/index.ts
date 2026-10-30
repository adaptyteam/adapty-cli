/** The door of the products resource: re-exports only, no code of its own. */
export { validateCreateProduct } from './create.js';
export { productPeriods, productStores } from './model.js';
export { validatePushProduct } from './push.js';
export { products } from './resource.js';
export { validateUpdateProduct } from './update.js';

export type { CreateProductInput } from './create.js';
export type { Product, ProductPeriod, ProductStore, VendorProduct } from './model.js';
export type { PushProductInput } from './push.js';
export type { ProductsApi } from './resource.js';
export type { UpdateProductInput } from './update.js';
