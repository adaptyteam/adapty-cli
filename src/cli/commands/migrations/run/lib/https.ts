export const isHttps = (href: string): boolean => {
    try {
        return new URL(href).protocol === 'https:';
    } catch {
        return false;
    }
};
