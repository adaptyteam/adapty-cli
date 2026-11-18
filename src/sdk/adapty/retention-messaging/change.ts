import type { Issue } from '../../core/errors.js';

/**
 * The change of an update: only what the user names. Localizations are found by `locale`, bullet
 * points by `bullet_id`, products by `store_id`; a removal is only ever an explicit `remove_*` key.
 * The keys are the published keys of the change file, so they stay in the server's snake_case.
 */

export type LocalizationChange = {
    body?: string | undefined;
    /** The text of a saved bullet point in this locale, by its `bullet_id`. */
    bullet_texts?: Record<string, string> | undefined;
    locale: string;
    title?: string | undefined;
};

/** With `bullet_id`: a saved bullet point. Without: a new one, which needs `image_path`, `text` and `texts`. */
export type BulletChange = {
    alt_text?: null | string | undefined;
    bullet_id?: string | undefined;
    image_path?: string | undefined;
    text?: string | undefined;
    /** A new bullet point only: its text in each localization of the message, by locale. */
    texts?: Record<string, string> | undefined;
};

export type ProductChange = {
    association?: null | { store_id: string; type: string } | undefined;
    store_id: string;
};

export type MessageChange = {
    alt_text?: null | string | undefined;
    body?: string | undefined;
    bullet_points?: BulletChange[] | undefined;
    localizations?: LocalizationChange[] | undefined;
    name?: string | undefined;
    products?: ProductChange[] | undefined;
    remove_bullet_points?: string[] | undefined;
    remove_image?: boolean | undefined;
    remove_localizations?: string[] | undefined;
    remove_products?: string[] | undefined;
    title?: string | undefined;
};

type Rule = (value: unknown, where: string) => Issue[];

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const issue = (where: string, message: string): Issue[] => [{ message: `${where} ${message}` }];

const text: Rule = (value, where) => (typeof value === 'string' ? [] : issue(where, 'must be a string'));
const nullableText: Rule = (value, where) => (value === null ? [] : text(value, where));
const flag: Rule = (value, where) => (typeof value === 'boolean' ? [] : issue(where, 'must be true or false'));

const list = (item: Rule): Rule => (value, where) => (Array.isArray(value)
    ? value.flatMap((entry, index) => item(entry, `${where}[${index}]`))
    : issue(where, 'must be an array'));

const textMap: Rule = (value, where) => (isObject(value)
    ? Object.entries(value).flatMap(([key, entry]) => text(entry, `${where}.${key}`))
    : issue(where, 'must be a JSON object of texts'));

const at = (where: string, key: string): string => (where === '' ? key : `${where}.${key}`);

/** A JSON object with only these keys; a key it does not know is refused, so no input is dropped in silence. */
const object = (fields: Readonly<Record<string, Rule>>, required: readonly string[] = []): Rule => (value, where) => {
    if (!isObject(value)) {
        return issue(where === '' ? 'the change' : where, 'must be a JSON object');
    }

    const unknown = Object.keys(value).filter(key => !(key in fields));
    const missing = required.filter(key => !(key in value));

    return [
        ...unknown.flatMap(key => issue(at(where, key), 'is not a key of the change file')),
        ...missing.flatMap(key => issue(at(where, key), 'is required')),
        ...Object.entries(value).flatMap(([key, entry]) => fields[key]?.(entry, at(where, key)) ?? []),
    ];
};

const association = (value: unknown, where: string): Issue[] => (value === null
    ? []
    : object({ store_id: text, type: text }, ['store_id', 'type'])(value, where));

const CHANGE = object({
    alt_text: nullableText,
    body: text,
    bullet_points: list(object({ alt_text: nullableText, bullet_id: text, image_path: text, text, texts: textMap })),
    localizations: list(object({ body: text, bullet_texts: textMap, locale: text, title: text }, ['locale'])),
    name: text,
    products: list(object({ association, store_id: text }, ['store_id'])),
    remove_bullet_points: list(text),
    remove_image: flag,
    remove_localizations: list(text),
    remove_products: list(text),
    title: text,
});

/** The shape rules of a change file: known keys only, each of its type. */
export const validateChangeShape = (value: unknown): Issue[] => CHANGE(value, '');

/** The `image_path` of each bullet point of a change, in order, without repeats. */
export const changeIconPaths = (change: MessageChange): string[] =>
    [...new Set((change.bullet_points ?? []).flatMap(bullet => (bullet.image_path === undefined
        ? []
        : [bullet.image_path])))];

/** The `bullet_id` of each saved bullet point that a change edits. */
export const savedBulletIds = (change: MessageChange): string[] =>
    (change.bullet_points ?? []).flatMap(bullet => (bullet.bullet_id === undefined ? [] : [bullet.bullet_id]));
