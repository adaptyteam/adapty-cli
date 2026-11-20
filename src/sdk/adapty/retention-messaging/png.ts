/**
 * The PNG container, read with no decoder library: the signature, the chunks, the header and the
 * parts the transparency check needs (the compressed pixels and the `tRNS` chunk). The pixels
 * themselves are read in `png-pixels.ts`.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The bit depths that each color type allows, by the PNG specification. */
const BIT_DEPTHS: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
};

export type Png = {
    bitDepth: number;
    colorType: number;
    /** The `IDAT` chunks joined: one zlib stream. */
    compressed: Uint8Array;
    height: number;
    interlaced: boolean;
    /** The `tRNS` chunk, when the file has one. */
    transparency: Uint8Array | undefined;
    width: number;
};

type Chunk = { data: Uint8Array; type: string };

/** The CRC table (32 bits) of the PNG specification: each chunk ends with the CRC of its type and data. */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) === 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }

    return value;
});

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xff_ff_ff_ff;

    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }

    return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const hasSignature = (bytes: Uint8Array): boolean => SIGNATURE.every((byte, index) => bytes[index] === byte);

/** The chunks up to `IEND`, or undefined when a chunk runs past the end of the file or its CRC is wrong. */
const chunksOf = (bytes: Uint8Array): Chunk[] | undefined => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks: Chunk[] = [];

    for (let offset = SIGNATURE.length; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset);
        const start = offset + 8;
        const end = start + length;

        if (end + 4 > bytes.length || crc32(bytes.subarray(offset + 4, end)) !== view.getUint32(end)) {
            return undefined;
        }

        const type = String.fromCharCode(...bytes.subarray(offset + 4, start));

        if (type === 'IEND') {
            return chunks;
        }

        chunks.push({ data: bytes.subarray(start, end), type });
        offset = end + 4;
    }

    return undefined;
};

const joined = (parts: readonly Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;

    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
};

/** The file as a PNG, or undefined when it is not one: no signature, a broken chunk or an impossible header. */
export const readPng = (bytes: Uint8Array): Png | undefined => {
    if (!hasSignature(bytes)) {
        return undefined;
    }

    const chunks = chunksOf(bytes);
    const header = chunks?.[0];

    if (chunks === undefined || header?.type !== 'IHDR' || header.data.length !== 13) {
        return undefined;
    }

    const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
    const [bitDepth = 0, colorType = 0, , , interlace = 0] = header.data.subarray(8);
    const idat = chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data);

    if (!(BIT_DEPTHS[colorType] ?? []).includes(bitDepth) || interlace > 1 || idat.length === 0) {
        return undefined;
    }

    return {
        bitDepth,
        colorType,
        compressed: joined(idat),
        height: view.getUint32(4),
        interlaced: interlace === 1,
        transparency: chunks.find(chunk => chunk.type === 'tRNS')?.data,
        width: view.getUint32(0),
    };
};
