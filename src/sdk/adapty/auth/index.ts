/**
 * The door of the auth resource: re-exports only, no code of its own. The two device flow steps
 * are reached through the port `auth()` returns, not imported directly.
 */
export { auth } from './resource.js';

export type { AuthUser, IssuedToken } from './model.js';
export type { AuthApi } from './resource.js';
