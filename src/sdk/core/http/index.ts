/**
 * The transport as a module: one door out. An eslint zone fences off the internals (client,
 * policies, retry, url), so they can be rearranged without touching products.
 */
export { createHttp } from './client.js';
export type { Http, HttpMethod, HttpOptions, RequestOptions } from './client.js';
export { defaultErrorParser, defaultShouldRetry } from './policies.js';
export type { ErrorParser, ShouldRetry } from './policies.js';
export { defaultRetryPolicy, retry } from './retry.js';
export type { RetryAttempt, RetryDecision, RetryOptions, RetryPolicy } from './retry.js';
// No pageQuery here: how a page is asked for is the product's convention — sdk/adapty/pagination.ts
export type { QueryParams, QueryValue } from './url.js';
