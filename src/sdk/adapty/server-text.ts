import { CASEFOLD } from './casefold-table.js';

/**
 * How the server reads the text of a flow font reference, rule for rule, so that the CLI never resolves a
 * reference to a family the server would not: it trims and case-folds a name as Python 3.12's
 * `str.strip()` and `str.casefold()` do, and takes as a family id exactly what `uuid.UUID(text)` accepts.
 * Every function walks the text once and builds no argument list from it, so a text of any length is safe.
 */

/** `str.isspace`: what `str.strip()` removes. */
const WHITESPACE = new Set([
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0x85, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
    0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
]);

/** The first code point of a text from the end, and its length in UTF-16 units. */
const lastCodePoint = (text: string, end: number): [number, number] => {
    const low = text.charCodeAt(end - 1);
    const high = end >= 2 ? text.charCodeAt(end - 2) : 0;
    const pair = low >= 0xDC00 && low <= 0xDFFF && high >= 0xD800 && high <= 0xDBFF;

    return pair ? [text.codePointAt(end - 2) ?? 0, 2] : [low, 1];
};

/** Strips the matching code points from both ends, as Python's `str.strip(chars)` does, by slice bounds. */
const stripSet = (text: string, strip: (codePoint: number) => boolean): string => {
    let start = 0;
    let end = text.length;

    while (start < end) {
        const codePoint = text.codePointAt(start) ?? 0;

        if (!strip(codePoint)) {
            break;
        }

        start += codePoint > 0xFFFF ? 2 : 1;
    }

    while (end > start) {
        const [codePoint, size] = lastCodePoint(text, end);

        if (!strip(codePoint)) {
            break;
        }

        end -= size;
    }

    return text.slice(start, end);
};

/** `str.strip()`. */
export const pyStrip = (text: string): string => stripSet(text, codePoint => WHITESPACE.has(codePoint));

let folds: Map<number, string> | undefined;

const foldTable = (): Map<number, string> => {
    folds ??= new Map(CASEFOLD.split(' ').map((item) => {
        const [from = '', to = ''] = item.split(':');

        return [Number.parseInt(from, 36), String.fromCodePoint(...to.split('.').map(point => Number.parseInt(point, 36)))];
    }));

    return folds;
};

/** `str.casefold()`: one code point at a time (case folding has no context), from Python's own table. */
export const pyCasefold = (text: string): string => {
    let folded = '';

    for (const char of text) {
        folded += foldTable().get(char.codePointAt(0) ?? 0) ?? char;
    }

    return folded;
};

/** The zero of every block of ten decimal digits Python 3.12 knows: `int()` reads each as its value. */
const DIGIT_ZEROS = [
    0x30, 0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xDE6, 0xE50, 0xED0,
    0xF20, 0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620,
    0xA8D0,
    0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0, 0xFF10, 0x104A0, 0x10D30, 0x11066, 0x110F0, 0x11136, 0x111D0, 0x112F0,
    0x11450, 0x114D0, 0x11650, 0x116C0, 0x11730, 0x118E0, 0x11950, 0x11C50, 0x11D50, 0x11DA0, 0x11F50, 0x16A60, 0x16AC0,
    0x16B50, 0x1D7CE, 0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6, 0x1E140, 0x1E2F0, 0x1E4F0, 0x1E950, 0x1FBF0,
];

/**
 * The text `int()` parses after its first step: an ASCII character stays, other whitespace becomes a
 * space, any other decimal digit becomes its ASCII digit, and anything else becomes `?`, which no number
 * takes. So `０x…` (a fullwidth zero) has the `0x` prefix, as in Python.
 */
const intAscii = (text: string): string => {
    let ascii = '';

    for (const char of text) {
        const codePoint = char.codePointAt(0) ?? 0;
        const zero = DIGIT_ZEROS.find(start => codePoint >= start && codePoint < start + 10);

        if (codePoint < 0x80) {
            ascii += char;
        } else if (WHITESPACE.has(codePoint)) {
            ascii += ' ';
        } else {
            ascii += zero === undefined ? '?' : String(codePoint - zero);
        }
    }

    return ascii;
};

/**
 * `int(text, 16)`: ASCII whitespace around, an optional sign, an optional `0x` (one underscore may follow
 * it), then hexadecimal digits with single underscores between them. Undefined where Python raises.
 */
const INT_16 = /^[\t\n\v\f\r ]*([+-]?)(?:0[xX]_?)?([\dA-Fa-f]+(?:_[\dA-Fa-f]+)*)[\t\n\v\f\r ]*$/;

const pyHexInt = (text: string): bigint | undefined => {
    const match = INT_16.exec(intAscii(text));

    if (match === null) {
        return undefined;
    }

    const value = BigInt(`0x${(match[2] ?? '').replaceAll('_', '')}`);

    return match[1] === '-' ? -value : value;
};

/** The length of a text in code points, as Python counts it. */
const codePointLength = (text: string): number => {
    let length = 0;

    for (const _ of text) {
        length++;
    }

    return length;
};

/**
 * The 32 hexadecimal digits of the UUID that `uuid.UUID(text)` makes, else undefined (Python raises): every
 * `urn:` and `uuid:` removed, braces stripped at the ends, every hyphen removed, then 32 code points that
 * `int(…, 16)` reads to a value from 0 to below 2^128.
 */
export const pyUuidHex = (text: string): string | undefined => {
    const hex = stripSet(text.replaceAll('urn:', '').replaceAll('uuid:', ''), codePoint => codePoint === 0x7B || codePoint === 0x7D)
        .replaceAll('-', '');

    if (codePointLength(hex) !== 32) {
        return undefined;
    }

    const value = pyHexInt(hex);

    return value === undefined || value < 0n || value >= 1n << 128n ? undefined : value.toString(16).padStart(32, '0');
};
