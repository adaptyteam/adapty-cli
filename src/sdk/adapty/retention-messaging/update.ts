import { assertValid } from '../../core/validation.js';

import { savedBulletIds } from './change.js';
import { validateRetentionImage } from './image.js';
import { readIssues } from './read.js';

import type { BulletChange, MessageChange } from './change.js';
import type { ImageFile, MessageWritePlan, RetentionBulletPoint, RetentionMessage } from './model.js';
import type { Issue } from '../../core/errors.js';

/**
 * An update merged onto the message as read: the server replaces the whole message with the body,
 * so everything the change does not name is sent back as it was. A bullet point with its `bullet_id`
 * and no new icon keeps its icon; no `image` part keeps the image.
 */

export type UpdateMessageImages = {
    /** The icon files of the change, by the `image_path` written in it. */
    icons: ReadonlyMap<string, ImageFile>;
    image?: ImageFile | undefined;
};

/** The image rules of every file of an update, before the question and before any request. */
export const validateUpdateImages = (images: UpdateMessageImages): Issue[] => [
    ...(images.image === undefined ? [] : validateRetentionImage('header', images.image)),
    ...[...images.icons.values()].flatMap(icon => validateRetentionImage('icon', icon)),
];

const absent = (key: string, values: readonly string[], present: readonly string[], noun: string): Issue[] =>
    values.filter(value => !present.includes(value)).map(value => ({ message: `${key}: the message has no ${noun} ${value}` }));

/** Each object that the change names by its key must be in the message: nothing is skipped in silence. */
const targetIssues = (message: RetentionMessage, change: MessageChange): Issue[] => {
    const locales = message.localizations.map(localization => localization.locale);
    const bulletIds = message.bullet_points.map(bullet => bullet.bullet_id);
    const named = savedBulletIds(change);

    return [
        ...absent('remove_localizations', change.remove_localizations ?? [], locales, 'localization'),
        ...absent('remove_bullet_points', change.remove_bullet_points ?? [], bulletIds, 'bullet point'),
        ...absent('remove_products', change.remove_products ?? [], message.products.map(product => product.store_id), 'product'),
        ...absent('bullet_points', named, bulletIds, 'bullet point'),
        ...(change.localizations ?? []).flatMap(localization => absent(
            `localizations (${localization.locale}).bullet_texts`,
            Object.keys(localization.bullet_texts ?? {}),
            bulletIds,
            'bullet point',
        )),
    ];
};

type Bullets = { icons: MessageWritePlan['icons']; kept: RetentionBulletPoint[]; rows: Record<string, unknown>[] };

const mergeBullets = (message: RetentionMessage, change: MessageChange, images: UpdateMessageImages): Bullets => {
    const removed = new Set(change.remove_bullet_points ?? []);
    const edits = new Map((change.bullet_points ?? []).map(bullet => [bullet.bullet_id, bullet]));
    const kept = message.bullet_points.filter(bullet => !removed.has(bullet.bullet_id));
    const fresh = (change.bullet_points ?? []).filter(bullet => bullet.bullet_id === undefined);
    const icons: MessageWritePlan['icons'] = [];

    const addIcon = (bullet: number, path: string | undefined): void => {
        const file = path === undefined ? undefined : images.icons.get(path);

        if (file !== undefined) {
            icons.push({ bullet, file });
        }
    };

    const rows: Record<string, unknown>[] = kept.map((bullet, index) => {
        const edit = edits.get(bullet.bullet_id);

        addIcon(index, edit?.image_path);

        return {
            alt_text: edit?.alt_text === undefined ? bullet.alt_text : edit.alt_text,
            bullet_id: bullet.bullet_id,
            text: edit?.text ?? bullet.text,
        };
    });

    for (const bullet of fresh) {
        addIcon(rows.length, bullet.image_path);
        rows.push({ ...(bullet.alt_text === undefined ? {} : { alt_text: bullet.alt_text }), text: bullet.text ?? '' });
    }

    return { icons, kept, rows };
};

type Localized = { issues: Issue[]; rows: Record<string, unknown>[] };

/** One localization of the full body: where its title, body and saved bullet texts come from. */
type LocaleSource = {
    body: string | undefined;
    locale: string;
    savedText: (bullet: RetentionBulletPoint) => string | undefined;
    title: string | undefined;
};

/** The localizations that stay, with their edits, then the new ones of the change. */
const localeSources = (message: RetentionMessage, change: MessageChange): LocaleSource[] => {
    const removed = new Set(change.remove_localizations ?? []);
    const edits = new Map((change.localizations ?? []).map(localization => [localization.locale, localization]));
    const position = new Map(message.bullet_points.map((bullet, index) => [bullet.bullet_id, index]));

    const added = (change.localizations ?? [])
        .filter(edit => !message.localizations.some(item => item.locale === edit.locale));

    const saved = message.localizations.filter(item => !removed.has(item.locale)).map((localization): LocaleSource => {
        const edit = edits.get(localization.locale);

        return {
            body: edit?.body ?? localization.body,
            locale: localization.locale,
            savedText: bullet => edit?.bullet_texts?.[bullet.bullet_id]
                ?? localization.bullet_points[position.get(bullet.bullet_id) ?? -1]?.text,
            title: edit?.title ?? localization.title,
        };
    });

    return [
        ...saved,
        ...added.map((edit): LocaleSource => ({
            body: edit.body,
            locale: edit.locale,
            savedText: bullet => edit.bullet_texts?.[bullet.bullet_id],
            title: edit.title,
        })),
    ];
};

const localizationRow = (
    source: LocaleSource,
    kept: readonly RetentionBulletPoint[],
    fresh: readonly BulletChange[],
) => {
    const { body, locale, title } = source;
    const saved = kept.map(bullet => source.savedText(bullet));

    const issues: Issue[] = kept.flatMap((bullet, index) => (saved[index] === undefined
        ? [{ message: `localization ${locale} has no text for bullet point ${bullet.bullet_id} (bullet_texts)` }]
        : []));

    for (const bullet of fresh.filter(item => item.texts?.[locale] === undefined)) {
        issues.push({ message: `the new bullet point "${bullet.text ?? ''}" has no text for ${locale} (texts)` });
    }

    if (title === undefined || body === undefined) {
        issues.push({ message: `the new localization ${locale} needs title and body` });
    }

    const texts = [...saved, ...fresh.map(bullet => bullet.texts?.[locale])];

    return { body, bullet_points: texts.map(text => ({ text: text ?? '' })), issues, locale, title };
};

const mergeLocalizations = (
    message: RetentionMessage,
    change: MessageChange,
    kept: readonly RetentionBulletPoint[],
): Localized => {
    const fresh = (change.bullet_points ?? []).filter(bullet => bullet.bullet_id === undefined);
    const merged = localeSources(message, change).map(source => localizationRow(source, kept, fresh));
    const locales = new Set(merged.map(item => item.locale));

    const unknown = fresh.flatMap((bullet, index) => Object.keys(bullet.texts ?? {})
        .filter(key => !locales.has(key))
        .map(locale => ({
            message: `new bullet point ${index + 1} has a text for ${locale}, a localization the message does not have`,
        })));

    return {
        issues: [...merged.flatMap(item => item.issues), ...unknown],
        rows: merged.map(({ issues: _issues, ...row }) => row),
    };
};

const mergeProducts = (message: RetentionMessage, change: MessageChange): Record<string, unknown>[] => {
    const removed = new Set(change.remove_products ?? []);
    const edits = new Map((change.products ?? []).map(product => [product.store_id, product]));

    const saved = message.products.filter(product => !removed.has(product.store_id)).map((product) => {
        const edit = edits.get(product.store_id);
        const { association } = product;
        const stored = association === null ? null : { store_id: association.store_id, type: association.type };

        return { store_id: product.store_id, association: edit?.association === undefined ? stored : edit.association };
    });

    const added = (change.products ?? [])
        .filter(edit => !message.products.some(product => product.store_id === edit.store_id));

    return [...saved, ...added.map(edit => ({ store_id: edit.store_id, association: edit.association ?? null }))]
        .map(({ association, store_id: storeId }) => (association === null
            ? { store_id: storeId }
            : { association, store_id: storeId }));
};

/**
 * The full body of the update, or a ValidationError: a field the read lacks, an object the change
 * names that the message does not have, or a localization with no text for a bullet point.
 */
export const planUpdate = (
    message: RetentionMessage,
    change: MessageChange,
    images: UpdateMessageImages,
): MessageWritePlan => {
    assertValid(readIssues(message));

    assertValid(targetIssues(message, change));

    const bullets = mergeBullets(message, change, images);
    const localizations = mergeLocalizations(message, change, bullets.kept);

    assertValid(localizations.issues);

    return {
        data: {
            alt_text: change.alt_text === undefined ? message.image?.alt_text ?? null : change.alt_text,
            body: change.body ?? message.body,
            bullet_points: bullets.rows,
            localizations: localizations.rows,
            name: change.name ?? message.name,
            products: mergeProducts(message, change),
            remove_image: change.remove_image ?? false,
            title: change.title ?? message.title,
        },
        icons: bullets.icons,
        image: images.image,
    };
};
