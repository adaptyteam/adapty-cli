import type { Http } from '../core/http/index.js';

export type AccessLevel = {
    id: string;
    sdk_id: string;
    title: null | string;
};

/** Not paginated: this endpoint answers with a bare `items` list, and may omit it entirely. */
export type AccessLevelList = {
    items?: AccessLevel[];
};

/** Only the read `apps create` needs; the rest arrives with the access-levels commands. */
export const accessLevels = (http: Http) => ({
    list: (appId: string) => http.get<AccessLevelList>(`/apps/${appId}/access-levels`),
});

export type AccessLevelsApi = ReturnType<typeof accessLevels>;
