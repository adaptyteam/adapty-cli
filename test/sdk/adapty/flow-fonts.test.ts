import { expect } from 'chai';

import { refreshFlowFonts } from '../../../src/sdk/adapty/flow-fonts.js';

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

const BUNDLED = { faces: [{ id: 'user-font-1', url: '' }], id: 'user-font-1', name: 'Bundled', url: '' };

const title = (id: string) => ({ screens: [{ title: { textFamily: { id, type: 'user' }, weight: 700 } }] });

type Row = {
    config: Record<string, unknown>;
    expected: { changed: boolean; meta?: Record<string, unknown> };
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
        expected: { changed: false },
        families: [family('Inter'), { ...family('INTER'), id: 'other' }],
        id: 'a name two families share means none',
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
            const refresh = refreshFlowFonts(row.config, row.families);

            expect(refresh.changed, `${row.id}: changed`).to.equal(row.expected.changed);

            if (row.expected.meta !== undefined) {
                expect(refresh.config._meta, `${row.id}: _meta`).to.deep.equal(row.expected.meta);
                expect(refresh.config.screens, `${row.id}: the references stay as written`).to.deep.equal(row.config.screens);
            }
        });
    }
});
