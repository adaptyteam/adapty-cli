import type { Issue } from '../../core/errors.js';

/**
 * Whether the message as read carries every field that the full body of an update sends back. A
 * field that the read leaves out is not taken as empty: the update would then erase what is stored
 * (the alt text of the image, a bullet text, an association). Each missing field is named.
 */

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): boolean => typeof value === 'string';

/** `text` a string, `nullable` a string or null (the key must be there), `list` an array. */
type Kind = 'list' | 'nullable' | 'text';

const fits = (value: unknown, kind: Kind): boolean => {
    switch (kind) {
        case 'list': {
            return Array.isArray(value);
        }

        case 'nullable': {
            return value === null || isText(value);
        }

        case 'text': {
            return isText(value);
        }
    }
};

const missing = (record: unknown, where: string, fields: Readonly<Record<string, Kind>>): string[] => {
    if (!isObject(record)) {
        return [where];
    }

    return Object.entries(fields).filter(([key, kind]) => !fits(record[key], kind)).map(([key]) => `${where}.${key}`);
};

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const productGaps = (product: unknown, where: string): string[] => {
    const gaps = missing(product, where, { store_id: 'text' });

    if (!isObject(product) || !Object.hasOwn(product, 'association')) {
        return [...gaps, `${where}.association`];
    }

    return product.association === null ? gaps : [...gaps, ...missing(product.association, `${where}.association`, { store_id: 'text', type: 'text' })];
};

const localizationGaps = (localization: unknown, where: string, bullets: number): string[] => {
    const gaps = missing(localization, where, { body: 'text', bullet_points: 'list', locale: 'text', title: 'text' });
    const texts = isObject(localization) ? listOf(localization.bullet_points) : [];

    return [
        ...gaps,
        ...Array.from({ length: bullets }, (_, index) => missing(texts[index], `${where}.bullet_points[${index}]`, { text: 'text' })).flat(),
    ];
};

/** The issues of a read that cannot be sent back whole; empty when every field is there. */
export const readIssues = (message: unknown): Issue[] => {
    const top = missing(message, 'message', { body: 'text', bullet_points: 'list', localizations: 'list', name: 'text', products: 'list', title: 'text' });
    const record: Fields = isObject(message) ? message : {};
    const image = record.image;
    const bullets = listOf(record.bullet_points);

    const gaps = [
        ...top,
        ...(Object.hasOwn(record, 'image') ? [] : ['message.image']),
        ...(isObject(image) ? missing(image, 'message.image', { alt_text: 'nullable' }) : []),
        ...bullets.flatMap((bullet, index) => missing(bullet, `message.bullet_points[${index}]`, { alt_text: 'nullable', bullet_id: 'text', text: 'text' })),
        ...listOf(record.localizations).flatMap((item, index) => localizationGaps(item, `message.localizations[${index}]`, bullets.length)),
        ...listOf(record.products).flatMap((product, index) => productGaps(product, `message.products[${index}]`)),
    ];

    return gaps.map(field => ({ message: `the message as read has no ${field.replace(/^message\./, '')}, so the full body cannot be built: nothing was sent` }));
};
