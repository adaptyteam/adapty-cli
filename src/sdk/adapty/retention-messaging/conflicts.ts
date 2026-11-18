import { savedBulletIds } from './change.js';

import type { MessageChange } from './change.js';
import type { Issue } from '../../core/errors.js';

/**
 * The rules of a change that need no read of the message, so they run before the question and before
 * any request. A conflict is refused instead of being resolved in silence: one object both changed
 * and removed, a new image and its removal, or a text for a localization that the same change removes.
 */

const repeats = (values: readonly string[]): string[] =>
    [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const repeated = (key: string, values: readonly string[], noun: string): Issue[] =>
    repeats(values).map(value => ({ message: `${key} names ${noun} ${value} more than once` }));

const both = (changed: readonly string[], removed: readonly string[], noun: string, keys: [string, string]): Issue[] =>
    [...new Set(changed.filter(value => removed.includes(value)))]
        .map(value => ({ message: `${noun} ${value} is both in ${keys[0]} and in ${keys[1]}` }));

const isEmpty = (change: MessageChange, image: boolean): boolean =>
    !image && Object.values(change).every(value => value === undefined || (Array.isArray(value) && value.length === 0));

const newBulletIssues = (change: MessageChange): Issue[] => {
    const removedLocales = change.remove_localizations ?? [];

    return (change.bullet_points ?? []).flatMap((bullet, index): Issue[] => {
        const where = `bullet_points[${index}]`;

        if (bullet.bullet_id !== undefined) {
            return bullet.texts === undefined
                ? []
                : [{ message: `${where}.texts is only for a new bullet point: for a saved one, use localizations[].bullet_texts` }];
        }

        const issues: Issue[] = [];

        if (bullet.image_path === undefined || bullet.text === undefined) {
            issues.push({ message: `${where} is a new bullet point (no bullet_id): it needs image_path and text` });
        }

        for (const locale of Object.keys(bullet.texts ?? {}).filter(key => removedLocales.includes(key))) {
            issues.push({ message: `${where}.texts has a text for ${locale}, which remove_localizations removes` });
        }

        return issues;
    });
};

const removedBulletTexts = (change: MessageChange): Issue[] => {
    const removed = change.remove_bullet_points ?? [];

    return (change.localizations ?? []).flatMap(localization => Object.keys(localization.bullet_texts ?? {})
        .filter(bulletId => removed.includes(bulletId))
        .map(bulletId => ({
            message: `bullet point ${bulletId} has a text in localizations (${localization.locale}) and is in remove_bullet_points`,
        })));
};

/** `image` says whether the update also uploads a new message image. */
export const validateMessageChange = (change: MessageChange, image: boolean): Issue[] => {
    if (isEmpty(change, image)) {
        return [{ message: 'nothing to update: give a field flag, --image, --remove-image or --file' }];
    }

    const locales = (change.localizations ?? []).map(localization => localization.locale);
    const bulletIds = savedBulletIds(change);
    const storeIds = (change.products ?? []).map(product => product.store_id);
    const removedLocales = change.remove_localizations ?? [];
    const removedBullets = change.remove_bullet_points ?? [];
    const removedProducts = change.remove_products ?? [];

    return [
        ...repeated('localizations', locales, 'localization'),
        ...repeated('bullet_points', bulletIds, 'bullet point'),
        ...repeated('products', storeIds, 'product'),
        ...both(locales, removedLocales, 'localization', ['localizations', 'remove_localizations']),
        ...both(bulletIds, removedBullets, 'bullet point', ['bullet_points', 'remove_bullet_points']),
        ...both(storeIds, removedProducts, 'product', ['products', 'remove_products']),
        ...(image && change.remove_image === true ? [{ message: 'a new image (--image) and its removal (remove_image) are both given' }] : []),
        ...newBulletIssues(change),
        ...removedBulletTexts(change),
    ];
};
