import { expect } from 'chai';

import { refreshFlowFonts } from '../../../src/sdk/adapty/flow-fonts.js';
import { ValidationError } from '../../../src/sdk/core/errors.js';

import type { FontFace, FontFamily } from '../../../src/sdk/adapty/index.js';

const INTER = 'a1b2c3d4-0000-4000-8000-000000000001';
const REGULAR = 'a1b2c3d4-0000-4000-8000-0000000000aa';
const BOLD = 'a1b2c3d4-0000-4000-8000-0000000000bb';

const REGULAR_URL = 'https://cdn.example.com/inter-regular.otf';
const BOLD_URL = 'https://cdn.example.com/inter-bold.otf';

const face = (id: string, weight: number, ios: null | string, url: null | string, isDefault = false): FontFace => ({
    family_id: INTER,
    file_format: 'otf',
    file_id: 1,
    file_url: url,
    font_alias_android: null,
    font_alias_ios: ios,
    id,
    is_default: isDefault,
    italic: false,
    metadata_status: 'detected',
    weight,
});

type Urls = { bold: null | string; regular: null | string };

const FILES: Urls = { bold: BOLD_URL, regular: REGULAR_URL };

const family = (name: string, iosBold = 'Inter-Bold', urls: Urls = FILES): FontFamily => ({
    default_face_id: REGULAR,
    faces: [face(REGULAR, 400, 'Inter-Regular', urls.regular, true), face(BOLD, 700, iosBold, urls.bold)],
    id: INTER,
    name,
});

/** What the server's own refresh writes for the family above: a face url, else the family url, else ''. */
const entry = (iosBold = 'Inter-Bold', urls = { bold: BOLD_URL, family: REGULAR_URL, regular: REGULAR_URL }) => ({
    faces: [
        { id: REGULAR, iosName: 'Inter-Regular', isDefault: true, italic: false, url: urls.regular, weight: 400 },
        { id: BOLD, iosName: iosBold, isDefault: false, italic: false, url: urls.bold, weight: 700 },
    ],
    id: INTER,
    iosName: 'Inter-Regular',
    name: 'Inter',
    url: urls.family,
});

/** What `uuid.UUID('０x112233445546778899aabbccddeeff')` makes. */
const PROBE_ID = '00112233-4455-4677-8899-aabbccddeeff';

const BUNDLED = { faces: [{ id: 'user-font-1', url: '' }], id: 'user-font-1', name: 'Bundled', url: '' };

/**
 * A row for one reference and one family of the given name: when it matches, the entry of that family is
 * written; else nothing is.
 */
const resolves = (reference: string, name: string, match: boolean, id: string): Row => ({
    config: title(reference),
    expected: match ? { changed: true, meta: { fonts: [{ ...entry(), name }] } } : { changed: false },
    families: [family(name)],
    id,
});

const title = (id: string) => ({ screens: [{ title: { textFamily: { id, type: 'user' }, weight: 700 } }] });

type Row = {
    config: Record<string, unknown>;
    /** `error`: nothing is refreshed and nothing written; the message names the reference. */
    expected: { changed: boolean; meta?: Record<string, unknown> } | { error: string };
    families: FontFamily[];
    id: string;
};

/**
 * external: the refreshed copy is what `flows publish` saves, and the server publishes the fonts of the
 * saved config to the devices; an unchanged copy must not write the config at all.
 */
const rows: Row[] = [
    {
        config: { ...title(INTER), _meta: { fonts: [entry()] } },
        expected: { changed: false },
        families: [family('Inter')],
        id: 'current copy: no change',
    },
    {
        config: { ...title(INTER), _meta: { fonts: [entry('Inter-Bold-Old')] } },
        expected: { changed: true, meta: { fonts: [entry()] } },
        families: [family('Inter')],
        id: 'a renamed iOS name is written',
    },
    {
        config: title(INTER),
        expected: { changed: true, meta: { fonts: [entry('Inter-Bold', { bold: REGULAR_URL, family: REGULAR_URL, regular: REGULAR_URL })] } },
        families: [family('Inter', 'Inter-Bold', { bold: null, regular: REGULAR_URL })],
        id: 'a face with no file url takes the family url (the file of the default face)',
    },
    {
        config: title(INTER),
        expected: { changed: true, meta: { fonts: [entry('Inter-Bold', { bold: BOLD_URL, family: '', regular: '' })] } },
        families: [family('Inter', 'Inter-Bold', { bold: BOLD_URL, regular: null })],
        id: 'a default face with no file url gives an empty family url',
    },
    {
        config: { ...title(INTER), _meta: { fonts: [{ ...entry(), extra: 1 }] } },
        expected: { changed: true, meta: { fonts: [entry()] } },
        families: [family('Inter')],
        id: 'the entry is written as the server writes it: a key it does not write is dropped',
    },
    {
        config: title(' inter '),
        expected: { changed: true, meta: { fonts: [entry()] } },
        families: [family('Inter')],
        id: 'a name reference, trimmed and in any case, means its family',
    },
    {
        config: title('Inter'),
        expected: { error: 'The flow names the font family "Inter", which 2 font families of the app match' },
        families: [family('Inter'), { ...family('INTER'), id: BOLD }],
        id: 'a name two families share: no guess, the refresh stops',
    },
    {
        config: title('STRASSE'),
        expected: { changed: true, meta: { fonts: [{ ...entry(), name: 'Straße' }] } },
        families: [family('Straße')],
        id: 'a name matches case-folded, as the server compares (Straße is STRASSE)',
    },
    {
        config: title(INTER.toUpperCase()),
        expected: { changed: true, meta: { fonts: [entry()] } },
        families: [family('Inter')],
        id: 'a family id matches in any case',
    },
    {
        config: title(BOLD),
        expected: { changed: false },
        families: [{ ...family('Inter'), name: BOLD }],
        id: 'a UUID-shaped reference is an id only, never the name of a family',
    },
    // How the server resolves a reference: a reference that is a UUID (Python's uuid.UUID() rules) is a family
    // id and only that, any other is a name compared trimmed and case-folded; a match writes the family, no
    // match writes nothing, a match the CLI cannot make with certainty stops the refresh
    resolves('ıris', 'Iris', false, 'a dotless ı is not an I: names compare case-folded, not upper- then lower-cased'),
    resolves('ΣΊΣΥΦΟΣ', 'σίσυφος', true, 'a final sigma folds as any sigma'),
    resolves('\uFEFFInter', 'Inter', false, 'a byte order mark is not whitespace to the server'),
    resolves('\u3000Inter\u2003', 'Inter', true, 'Unicode whitespace at the ends is stripped'),
    resolves('Straße', 'STRASSE', true, 'ß folds to ss'),
    resolves(`{${INTER}}`, 'Inter', true, 'a UUID in braces is the family id'),
    resolves(`urn:uuid:${INTER}`, 'Inter', true, 'a urn:uuid: UUID is the family id'),
    resolves(INTER.replaceAll('-', ''), 'Inter', true, 'a UUID without hyphens is the family id'),
    resolves('a1b2c3d4{}-0000-4000-8000-000000000001', 'Inter', false, 'braces inside are no UUID: read as a name, which no family has'),
    {
        config: title('a1b2c3d4{}-0000-4000-8000-000000000001'),
        expected: { changed: true, meta: { fonts: [{ ...entry(), id: BOLD, name: 'a1b2c3d4{}-0000-4000-8000-000000000001' }] } },
        families: [{ ...family('a1b2c3d4{}-0000-4000-8000-000000000001'), id: BOLD }],
        id: 'a reference that is no UUID is a name, also when its digits are a family id',
    },
    {
        config: title('STRASSE'),
        expected: { error: 'The flow names the font family "STRASSE", which 2 font families of the app match' },
        families: [family('Straße'), { ...family('strasse'), id: BOLD }],
        id: 'a name two families share after case folding: the refresh stops',
    },
    {
        config: title('０x112233445546778899aabbccddeeff'),
        expected: { changed: true, meta: { fonts: [{ ...entry(), id: PROBE_ID, name: 'Inter' }] } },
        families: [{ ...family('Inter'), id: PROBE_ID }, { ...family('０x112233445546778899aabbccddeeff'), id: BOLD }],
        id: 'a fullwidth zero before x is a 0x prefix: the reference is the id of the first family, not the name of the second',
    },
    {
        config: title(INTER),
        expected: { error: 'The font family id "not-a-uuid" of the app is not a UUID, so the reference' },
        families: [{ ...family('Other'), id: 'not-a-uuid' }, family('Inter')],
        id: 'an id compared with a family id that is not a UUID: no guess, the refresh stops',
    },
    {
        config: title('x'.repeat(200_000)),
        expected: { changed: false },
        families: [family('Inter')],
        id: 'a reference of 200,000 characters that matches no family: no entry, and no stack overflow',
    },
    {
        config: { ...title('user-font-1'), _meta: { fonts: [BUNDLED] } },
        expected: { changed: false },
        families: [family('Inter')],
        id: 'a reference no family matches keeps its stored bundled entry',
    },
    {
        config: { ...title('gone'), _meta: { fonts: [{ id: 'gone', name: 'Gone', url: 'https://cdn.example.com/gone.otf' }] } },
        expected: { changed: true, meta: { fonts: [] } },
        families: [family('Inter')],
        id: 'a reference no family matches drops a stored entry that is not bundled',
    },
    {
        config: { ...title(INTER), _meta: { fonts: [entry(), { id: 'unused', name: 'Old', url: '' }], icons: ['x'] } },
        expected: { changed: true, meta: { fonts: [entry()], icons: ['x'] } },
        families: [family('Inter')],
        id: 'an entry no element uses leaves the copy; other _meta keys stay',
    },
];

describe('refreshFlowFonts', () => {
    for (const row of rows) {
        it(row.id, () => {
            const { expected } = row;

            if ('error' in expected) {
                const refresh = () => refreshFlowFonts(row.config, row.families);

                expect(refresh, row.id).to.throw(ValidationError, expected.error);

                return;
            }

            const refresh = refreshFlowFonts(row.config, row.families);

            expect(refresh.changed, `${row.id}: changed`).to.equal(expected.changed);

            if (expected.meta !== undefined) {
                expect(refresh.config._meta, `${row.id}: _meta`).to.deep.equal(expected.meta);
                expect(refresh.config.screens, `${row.id}: the references stay as written`).to.deep.equal(row.config.screens);
            }
        });
    }
});
