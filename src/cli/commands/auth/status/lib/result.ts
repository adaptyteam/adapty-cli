/**
 * What `auth status` returns, and what its view renders. It sits in lib/ so that neither imports
 * the other, and because a sibling of index.ts would be picked up as the command `auth:status:*`.
 */
export type Result
    = | { authenticated: false; config_path: string; source: 'none' }
        | {
            authenticated: true;
            config_path: string;
            email: string | undefined;
            source: 'env' | 'file';
            token_prefix: string;
        };
