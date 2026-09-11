/**
 * What the auth operations share: the shapes a successful login yields, and the name this client
 * gives itself. An input shape belongs to its operation, not here.
 */

export type AuthUser = {
    email: string;
    name: string;
};

export type IssuedToken = {
    accessToken: string;
    expiresInSec: number;
    user: AuthUser;
};

/** The device flow identifies the client rather than authenticating it: there is no secret. */
export const CLIENT_ID = 'adapty-cli';
