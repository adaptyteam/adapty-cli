/** The door of the product-offers resource: re-exports only, no code of its own. */
export { offerTypes } from './model.js';
export { validateCreateProductOffer } from './create.js';
export { productOffers } from './resource.js';
export { validateUpdateProductOffer } from './update.js';

export type { OfferType, ProductOffer, StoreOffer } from './model.js';
export type { CreateProductOfferInput } from './create.js';
export type { ProductOffersApi } from './resource.js';
export type { UpdateProductOfferInput } from './update.js';
