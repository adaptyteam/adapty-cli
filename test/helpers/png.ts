import { deflateSync } from 'node:zlib';

/**
 * A small PNG encoder for tests: any color type and bit depth, a palette and `tRNS`, and Adam7. Each
 * scanline uses the next filter type in turn (None, Sub, Up, Average, Paeth), so a reader is tested
 * on all five.
 */

export type PngSpec = {
    bitDepth: number;
    colorType: number;
    height: number;
    interlaced?: boolean;
    palette?: readonly (readonly number[])[];
    /** The samples of one pixel, in channel order. */
    pixel: (x: number, y: number) => readonly number[];
    trns?: readonly number[];
    width: number;
};

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const ADAM7 = [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;

    for (let k = 0; k < 8; k++) {
        c = (c & 1) === 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }

    return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xff_ff_ff_ff;

    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }

    return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
    const head = Buffer.alloc(8);

    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');

    const tail = Buffer.alloc(4);

    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);

    return Buffer.concat([head, data, tail]);
};

const packRow = (samples: readonly number[], depth: number, rowBytes: number): Uint8Array => {
    const row = new Uint8Array(rowBytes);

    for (const [index, value] of samples.entries()) {
        if (depth === 16) {
            row[index * 2] = value >> 8;
            row[index * 2 + 1] = value & 0xff;
        } else if (depth === 8) {
            row[index] = value;
        } else {
            const perByte = 8 / depth;
            const at = Math.floor(index / perByte);

            row[at] = (row[at] ?? 0) | (value << (8 - depth * ((index % perByte) + 1)));
        }
    }

    return row;
};

const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];

    if (pa <= pb && pa <= pc) {
        return a;
    }

    return pb <= pc ? b : c;
};

const filterRow = (type: number, row: Uint8Array, previous: Uint8Array, bpp: number): Uint8Array => {
    const out = new Uint8Array(row.length + 1);

    out[0] = type;

    for (let i = 0; i < row.length; i++) {
        const a = i >= bpp ? row[i - bpp] ?? 0 : 0;
        const b = previous[i] ?? 0;
        const c = i >= bpp ? previous[i - bpp] ?? 0 : 0;
        const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][type] ?? 0;

        out[i + 1] = ((row[i] ?? 0) - prediction) & 0xff;
    }

    return out;
};

export const encodePng = (spec: PngSpec): Uint8Array => {
    const channels = CHANNELS[spec.colorType] ?? 1;
    const bitsPerPixel = channels * spec.bitDepth;
    const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
    const passes = spec.interlaced === true ? ADAM7 : [[0, 0, 1, 1] as const];
    const lines: Uint8Array[] = [];
    let line = 0;

    for (const [x0, y0, dx, dy] of passes) {
        const width = Math.max(0, Math.ceil((spec.width - x0) / dx));
        const height = Math.max(0, Math.ceil((spec.height - y0) / dy));
        const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
        let previous: Uint8Array = new Uint8Array(rowBytes);

        for (let j = 0; width > 0 && j < height; j++) {
            const samples = Array.from({ length: width }, (_, i) => spec.pixel(x0 + i * dx, y0 + j * dy)).flat();
            const row = packRow(samples, spec.bitDepth, rowBytes);

            lines.push(filterRow(line % 5, row, previous, bpp));
            previous = row;
            line++;
        }
    }

    const header = Buffer.alloc(13);

    header.writeUInt32BE(spec.width, 0);
    header.writeUInt32BE(spec.height, 4);
    header.set([spec.bitDepth, spec.colorType, 0, 0, spec.interlaced === true ? 1 : 0], 8);

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        ...(spec.palette === undefined ? [] : [chunk('PLTE', Uint8Array.from(spec.palette.flat()))]),
        ...(spec.trns === undefined ? [] : [chunk('tRNS', Uint8Array.from(spec.trns))]),
        chunk('IDAT', deflateSync(Buffer.concat(lines))),
        chunk('IEND', new Uint8Array()),
    ]);
};

/** An opaque RGB picture of the given size. */
export const opaquePng = (width: number, height: number): Uint8Array =>
    encodePng({ bitDepth: 8, colorType: 2, height, pixel: (x, y) => [x & 0xff, y & 0xff, 128], width });

/** The offset of the first `IDAT` chunk: its length field. */
const idatAt = (png: Uint8Array): number => Buffer.from(png).indexOf('IDAT') - 4;

/** The same PNG with the data of its one `IDAT` chunk replaced, and a correct CRC: a damaged pixel stream. */
export const withIdat = (png: Uint8Array, transform: (data: Buffer) => Uint8Array): Uint8Array => {
    const bytes = Buffer.from(png);
    const at = idatAt(png);
    const end = at + 12 + bytes.readUInt32BE(at);

    return Buffer.concat([bytes.subarray(0, at), chunk('IDAT', transform(bytes.subarray(at + 8, end - 4))), bytes.subarray(end)]);
};

/** The same PNG with a wrong CRC on its `IDAT` chunk. */
export const withBadCrc = (png: Uint8Array): Uint8Array => {
    const bytes = Buffer.from(png);
    const crcAt = idatAt(png) + 8 + bytes.readUInt32BE(idatAt(png));

    bytes[crcAt] = (bytes[crcAt] ?? 0) ^ 0xff;

    return bytes;
};
