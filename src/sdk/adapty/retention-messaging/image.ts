import { hasTransparentPixel } from './png-pixels.js';
import { readPng } from './png.js';

import type { ImageFile } from './model.js';
import type { Issue } from '../../core/errors.js';

/**
 * The image rules of Apple Retention Messaging, checked before the upload with the same limits as the
 * server: a PNG, at most 10 MB, of the given size in pixels, with no transparent pixel. Each file gets
 * at most one issue, the first rule that it breaks, and the issue names the file.
 */

export const RETENTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** `header` is the message image, `icon` the image of a bullet point. */
export type RetentionImageKind = 'header' | 'icon';

type SizeRule = { fits: (width: number, height: number) => boolean; text: string };

const SIZE_RULES: Readonly<Record<RetentionImageKind, SizeRule>> = {
    header: { fits: (width, height) => width === 3840 && height >= 160 && height <= 2160, text: 'must be 3840 px wide and 160–2160 px tall' },
    icon: { fits: (width, height) => width === 1024 && height === 1024, text: 'must be 1024 × 1024 px' },
};

const refusal = (file: ImageFile, rule: string): Issue[] => [{ message: `${file.name}: ${rule}` }];

/**
 * The issues of one file. A file read only up to one byte past the limit is enough: a longer one is
 * refused on its size, before anything else is read.
 */
export const validateRetentionImage = (kind: RetentionImageKind, file: ImageFile): Issue[] => {
    if (file.bytes.length > RETENTION_IMAGE_MAX_BYTES) {
        return refusal(file, 'must be at most 10 MB');
    }

    const png = readPng(file.bytes);

    if (png === undefined) {
        return refusal(file, 'must be a PNG');
    }

    const size = SIZE_RULES[kind];

    if (!size.fits(png.width, png.height)) {
        return refusal(file, size.text);
    }

    const transparent = hasTransparentPixel(png);

    if (transparent === undefined) {
        return refusal(file, 'must be a PNG');
    }

    return transparent ? refusal(file, 'must have no transparency') : [];
};
