import { validateRetentionImage } from './image.js';

import type { ImageFile, MessageWritePlan } from './model.js';
import type { Issue } from '../../core/errors.js';

/**
 * The create file: the body of the create request as the server takes it, except that a bullet point
 * names its icon by `image_path` (relative to the folder of the file) and never by `image_index`. The
 * index is the position of the icon in the form, and only the form builder knows it.
 */
export type CreateMessageFile = Record<string, unknown>;

export type CreateMessageImages = {
    /** The icon of each bullet point, in the order of `bullet_points`. */
    icons: readonly ImageFile[];
    image?: ImageFile | undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const bulletsOf = (file: CreateMessageFile): unknown[] => (Array.isArray(file.bullet_points) ? file.bullet_points : []);

const bulletIssues = (bullet: unknown, index: number): Issue[] => {
    const where = `bullet_points[${index}]`;

    if (!isObject(bullet)) {
        return [{ message: `${where} must be a JSON object` }];
    }

    const issues: Issue[] = [];

    if ('image_index' in bullet) {
        issues.push({ message: `${where}.image_index is not allowed in the file: give image_path, the path of the icon file` });
    }

    if (typeof bullet.image_path !== 'string' || bullet.image_path.trim() === '') {
        issues.push({ message: `${where}.image_path is required: the path of the icon file, relative to the folder of the file` });
    }

    return issues;
};

/** The shape rules of the file, before any file it names is read. */
export const validateCreateFile = (file: unknown): Issue[] => {
    if (!isObject(file)) {
        return [{ message: 'the file must hold a JSON object: the body of the message' }];
    }

    if ('bullet_points' in file && !Array.isArray(file.bullet_points)) {
        return [{ message: 'bullet_points must be an array' }];
    }

    return bulletsOf(file).flatMap((bullet, index) => bulletIssues(bullet, index));
};

/** The `image_path` of each bullet point, in order. Call it on a file that `validateCreateFile` accepts. */
export const createIconPaths = (file: CreateMessageFile): string[] =>
    bulletsOf(file).map(bullet => (isObject(bullet) && typeof bullet.image_path === 'string' ? bullet.image_path : ''));

/** The image rules of every file of a create, before the question and before any request. */
export const validateCreateImages = (images: CreateMessageImages): Issue[] => [
    ...(images.image === undefined ? [] : validateRetentionImage('header', images.image)),
    ...images.icons.flatMap(icon => validateRetentionImage('icon', icon)),
];

/** What the create sends: the body without `image_path`, each icon bound to its bullet point. */
export const planCreate = (file: CreateMessageFile, images: CreateMessageImages): MessageWritePlan => {
    const bullets = bulletsOf(file).map((bullet) => {
        const { image_path: _path, ...rest } = isObject(bullet) ? bullet : {};

        return rest;
    });

    return {
        data: { ...file, bullet_points: bullets },
        icons: images.icons.map((icon, bullet) => ({ bullet, file: icon })),
        image: images.image,
    };
};
