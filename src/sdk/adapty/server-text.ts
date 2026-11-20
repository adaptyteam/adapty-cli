import { CASEFOLD_EXCEPTIONS } from './casefold-table.js';

/**
 * How the server (Python 3.12) reads the text of a flow font reference, rule for rule, so that the CLI
 * never resolves a reference to a family the server would not: `str.strip`, `str.casefold` and
 * `uuid.UUID(value)` (`share/utils/uuid.py::is_uuid` and the family id lookup by UUID value).
 */

/** The code points of a text: Python counts and strips code points, not UTF-16 units. */
const codePoints = (text: string): number[] => Array.from(text, char => char.codePointAt(0) ?? 0);

/** `str.isspace`: the characters `str.strip()` removes. */
const WHITESPACE = new Set([
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0x85, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
    0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
]);

/** The whitespace `int()` skips: `str.isspace` without the four separators 0x1C..0x1F. */
const INT_WHITESPACE = new Set([...WHITESPACE].filter(codePoint => codePoint < 0x1C || codePoint > 0x1F));

/** Strips the given code points from both ends, as Python's `str.strip(chars)` does. */
const stripSet = (text: string, strip: (codePoint: number) => boolean): string => {
    const points = codePoints(text);
    let start = 0;
    let end = points.length;

    while (start < end && strip(points[start] ?? 0)) {
        start++;
    }

    while (end > start && strip(points[end - 1] ?? 0)) {
        end--;
    }

    return String.fromCodePoint(...points.slice(start, end));
};

/** `str.strip()`. */
export const pyStrip = (text: string): string => stripSet(text, codePoint => WHITESPACE.has(codePoint));

let folds: Map<number, string> | undefined;

const foldTable = (): Map<number, string> => {
    folds ??= new Map(CASEFOLD_EXCEPTIONS.split(' ').map((item) => {
        const [from = '', to = ''] = item.split(':');

        return [Number.parseInt(from, 36), String.fromCodePoint(...to.split('.').map(point => Number.parseInt(point, 36)))];
    }));

    return folds;
};

/** `str.casefold()`: one code point at a time, which is what casefold is (no context, unlike lower case). */
export const pyCasefold = (text: string): string =>
    codePoints(text).map(point => foldTable().get(point) ?? String.fromCodePoint(point).toLowerCase()).join('');

/** The zero of every block of ten decimal digits Python 3.12 knows (`unicodedata.decimal`): `int()` reads them. */
const DIGIT_ZEROS = [
    0x30, 0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xDE6, 0xE50, 0xED0,
    0xF20,
    0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0,
    0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0, 0xFF10, 0x104A0, 0x10D30, 0x11066, 0x110F0, 0x11136, 0x111D0, 0x112F0,
    0x11450, 0x114D0, 0x11650, 0x116C0, 0x11730, 0x118E0, 0x11950, 0x11C50, 0x11D50, 0x11DA0, 0x11F50, 0x16A60, 0x16AC0,
    0x16B50, 0x1D7CE, 0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6, 0x1E140, 0x1E2F0, 0x1E4F0, 0x1E950, 0x1FBF0,
];

/** The value of one hexadecimal digit as `int(text, 16)` reads it, else undefined. */
const hexDigit = (codePoint: number): number | undefined => {
    const zero = DIGIT_ZEROS.find(start => codePoint >= start && codePoint < start + 10);

    if (zero !== undefined) {
        return codePoint - zero;
    }

    const char = String.fromCodePoint(codePoint);

    return /^[a-f]$/i.test(char) ? Number.parseInt(char, 16) : undefined;
};

/**
 * `int(text, 16)`: whitespace around, an optional sign, an optional `0x`, then digits with single
 * underscores between them (one may also follow the `0x`). Undefined where Python raises.
 */
const pyHexInt = (text: string): bigint | undefined => {
    let body = stripSet(text, codePoint => INT_WHITESPACE.has(codePoint));
    const negative = body.startsWith('-');

    body = body.replace(/^[+-]/, '');

    const prefixed = /^0x/i.test(body);
    const digits = codePoints(prefixed ? body.slice(2) : body);
    let value = 0n;
    let previous: 'digit' | 'start' | 'underscore' = prefixed ? 'underscore' : 'start';

    if (prefixed && digits[0] === 0x5F) {
        digits.shift();
    }

    for (const codePoint of digits) {
        if (codePoint === 0x5F) {
            if (previous !== 'digit') {
                return undefined;
            }

            previous = 'underscore';
            continue;
        }

        const digit = hexDigit(codePoint);

        if (digit === undefined) {
            return undefined;
        }

        value = value * 16n + BigInt(digit);
        previous = 'digit';
    }

    if (previous !== 'digit') {
        return undefined;
    }

    return negative ? -value : value;
};

/**
 * The 32 hexadecimal digits of the UUID `uuid.UUID(text)` makes, else undefined (Python raises): every
 * `urn:` and `uuid:` removed, braces stripped at the ends, every hyphen removed, then 32 characters that
 * `int(…, 16)` reads to a value below 2^128.
 */
export const pyUuidHex = (text: string): string | undefined => {
    const hex = stripSet(text.replaceAll('urn:', '').replaceAll('uuid:', ''), codePoint => codePoint === 0x7B || codePoint === 0x7D)
        .replaceAll('-', '');

    if (codePoints(hex).length !== 32) {
        return undefined;
    }

    const value = pyHexInt(hex);

    return value === undefined || value < 0n || value >= 1n << 128n ? undefined : value.toString(16).padStart(32, '0');
};
