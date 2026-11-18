import { inflateSync } from 'node:zlib';

import type { Png } from './png.js';

/**
 * Whether any pixel of a PNG is not fully opaque, as the server sees it: an alpha sample below the
 * maximum (for 16 bits, its high byte below 255, as the server reads it), a palette entry with alpha
 * below 255 in `tRNS` that a pixel uses, or a pixel equal to the color key in `tRNS`. Interlaced
 * (Adam7) files are read pass by pass: the position of a pixel does not matter here.
 */

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** The seven Adam7 passes: first column, first row, column step, row step. */
const ADAM7 = [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const;

type Pass = { height: number; width: number };

type PixelTest = (row: Uint8Array, pixel: number) => boolean;

const passesOf = (png: Png): Pass[] => {
    if (!png.interlaced) {
        return [{ height: png.height, width: png.width }];
    }

    return ADAM7.map(([x0, y0, dx, dy]) => ({
        height: Math.max(0, Math.ceil((png.height - y0) / dy)),
        width: Math.max(0, Math.ceil((png.width - x0) / dx)),
    })).filter(pass => pass.width > 0 && pass.height > 0);
};

/** One sample of a scanline: `index` counts samples, not pixels. Samples below 8 bits are packed from the high bit. */
const sample = (row: Uint8Array, index: number, depth: number): number => {
    if (depth === 16) {
        return ((row[index * 2] ?? 0) << 8) | (row[index * 2 + 1] ?? 0);
    }

    if (depth === 8) {
        return row[index] ?? 0;
    }

    const perByte = 8 / depth;
    const shift = 8 - depth * ((index % perByte) + 1);

    return ((row[Math.floor(index / perByte)] ?? 0) >> shift) & ((1 << depth) - 1);
};

const word = (bytes: Uint8Array, offset: number): number => ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);

/** The test of one pixel, or undefined when the color type and `tRNS` leave no way to be transparent. */
const pixelTest = (png: Png): PixelTest | undefined => {
    const { bitDepth: depth, colorType, transparency: trns } = png;
    const channels = CHANNELS[colorType] ?? 1;

    if (colorType === 4 || colorType === 6) {
        const opaque = (value: number): boolean => (depth === 16 ? value >> 8 : value) === 255;

        return (row, pixel) => !opaque(sample(row, pixel * channels + channels - 1, depth));
    }

    if (trns === undefined) {
        return undefined;
    }

    if (colorType === 3) {
        return (row, pixel) => (trns[sample(row, pixel, depth)] ?? 255) < 255;
    }

    const keys = Array.from({ length: channels }, (_, channel) => word(trns, channel * 2));

    return (row, pixel) => keys.every((key, channel) => sample(row, pixel * channels + channel, depth) === key);
};

const paeth = (left: number, up: number, upLeft: number): number => {
    const estimate = left + up - upLeft;
    const [toLeft, toUp, toUpLeft] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];

    if (toLeft <= toUp && toLeft <= toUpLeft) {
        return left;
    }

    return toUp <= toUpLeft ? up : upLeft;
};

type Predictor = (left: number, up: number, upLeft: number) => number;

/** Filter types 1 to 4: Sub, Up, Average and Paeth. Type 0 changes nothing. */
const PREDICTORS: readonly Predictor[] = [
    left => left,
    (_left, up) => up,
    (left, up) => Math.floor((left + up) / 2),
    paeth,
];

/** Undoes the filter of one scanline in place; false for a filter type that does not exist. */
const unfilter = (filter: number, row: Uint8Array, previous: Uint8Array, bpp: number): boolean => {
    if (filter === 0) {
        return true;
    }

    const predict = PREDICTORS[filter - 1];

    if (predict === undefined) {
        return false;
    }

    for (let index = 0; index < row.length; index++) {
        const left = index >= bpp ? row[index - bpp] ?? 0 : 0;
        const upLeft = index >= bpp ? previous[index - bpp] ?? 0 : 0;

        row[index] = (row[index] ?? 0) + predict(left, previous[index] ?? 0, upLeft);
    }

    return true;
};

/** True or false, or undefined when the pixel data cannot be read: then the file is not a valid PNG. */
export const hasTransparentPixel = (png: Png): boolean | undefined => {
    // Undefined for an image that cannot be transparent: its pixel data is still read in full, so a
    // damaged stream or a short scanline is found here and not by the server after the upload.
    const test = pixelTest(png);

    const bitsPerPixel = (CHANNELS[png.colorType] ?? 1) * png.bitDepth;
    const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
    const passes = passesOf(png).map(pass => ({ ...pass, rowBytes: Math.ceil((pass.width * bitsPerPixel) / 8) }));
    const expected = passes.reduce((sum, pass) => sum + pass.height * (pass.rowBytes + 1), 0);
    let raw: Uint8Array;

    try {
        raw = inflateSync(png.compressed, { maxOutputLength: Math.max(expected, 1) });
    } catch {
        return undefined;
    }

    if (raw.length < expected) {
        return undefined;
    }

    let offset = 0;

    for (const { height, rowBytes, width } of passes) {
        let previous = new Uint8Array(rowBytes);

        for (let line = 0; line < height; line++) {
            const row = raw.slice(offset + 1, offset + 1 + rowBytes);

            if (!unfilter(raw[offset] ?? 0, row, previous, bpp)) {
                return undefined;
            }

            for (let pixel = 0; test !== undefined && pixel < width; pixel++) {
                if (test(row, pixel)) {
                    return true;
                }
            }

            previous = row;
            offset += rowBytes + 1;
        }
    }

    return false;
};
