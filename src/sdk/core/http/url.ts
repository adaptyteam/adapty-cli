export type QueryValue = boolean | number | readonly string[] | string | undefined;
export type QueryParams = Record<string, QueryValue>;

export const buildUrl = (
    baseUrl: string,
    path: string,
    query: QueryParams | undefined,
    trailingSlash: boolean,
): string => {
    // A relative path against a base ending in a slash keeps a prefix like /api/v1/developer
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    let relative = path.replace(/^\/+/, '');

    if (trailingSlash && relative !== '' && !relative.endsWith('/')) {
        relative += '/';
    }

    const url = new URL(relative, base);

    for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined) {
            continue;
        }

        const items = typeof value === 'object' ? value : [value];

        for (const item of items) {
            url.searchParams.append(key, String(item));
        }
    }

    return url.toString();
};
