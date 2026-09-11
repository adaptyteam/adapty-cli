/**
 * The door of the apps resource: re-exports only, no code of its own. Everything outside the
 * directory imports from here, which is what lets the files behind it be rearranged. Only what a
 * consumer uses passes through — the request builders stay private to their operation.
 */
export { platforms } from './model.js';
export { validateCreateApp } from './create.js';
export { apps } from './resource.js';
export { validateUpdateApp } from './update.js';

export type { AppDetail, AppSummary } from './model.js';
export type { CreateAppInput } from './create.js';
export type { AppsApi } from './resource.js';
export type { UpdateAppInput } from './update.js';
