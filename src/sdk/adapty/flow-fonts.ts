import { assertValid } from '../core/validation.js';

import { pyCasefold, pyStrip, pyUuidHex } from './server-text.js';

import type { FontFace, FontFamily } from './fonts/index.js';
import type { Issue } from '../core/errors.js';

/**
 * The copy of the app fonts a flow config carries in `_meta.fonts`, refreshed as the flow builder does
 * before a publish. The server publishes from the stored config, so a font change reaches a published
 * flow only when that copy changes and is saved.
 *
 * A config names a custom family under a `family` key (or a key ending in it) as `{ type: 'user', id }`,
 * where `id` is the family id or, from the Developer API, its name. A name means the family whose name
 * equals it trimmed and case-folded, when exactly one does; the server reads it the same way.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeFamilyKey = (key: string): boolean => key.toLowerCase().endsWith('family');

const userFontId = (value: unknown): string | undefined =>
    (isRecord(value) && value.type === 'user' && typeof value.id === 'string' ? value.id : undefined);

const collect = (value: unknown, key: string, found: Set<string>): void => {
    if (Array.isArray(value)) {
        for (const item of value) {
            collect(item, key, found);
        }

        return;
    }

    if (!isRecord(value)) {
        return;
    }

    const id = looksLikeFamilyKey(key) ? userFontId(value) : undefined;

    if (id !== undefined) {
        found.add(id);
    }

    for (const [childKey, child] of Object.entries(value)) {
        collect(child, childKey, found);
    }
};

/** The custom family references of a config, in the order they first appear; `_meta` is a copy, not a use. */
export const fontReferences = (config: Json): string[] => {
    const found = new Set<string>();
    const { _meta: _, ...content } = config;

    collect(content, '', found);

    return [...found];
};

/** The name key of the server: the name trimmed and case-folded. */
const nameKey = (name: string): string => pyCasefold(pyStrip(name));

type Resolution = { family?: FontFamily | undefined; issue?: Issue | undefined };

/**
 * The family a reference means, as the server reads it: a reference that is a UUID is a family id,
 * compared by its value, and only that; any other is a name, and means the family when exactly one family
 * of the app has that name key. Nothing matched: no family (the publish reports it). The CLI does not
 * guess where the server could read it otherwise: a name that several families share, or an id compared
 * with a family id that is not a UUID, is an issue, and nothing is written.
 */
const resolve = (reference: string, families: readonly FontFamily[]): Resolution => {
    const id = pyUuidHex(reference);

    if (id !== undefined) {
        const unreadable = families.find(family => pyUuidHex(family.id) === undefined);

        if (unreadable !== undefined) {
            const message = `The font family id "${unreadable.id}" of the app is not a UUID, so the reference `
                + `"${reference}" `
                + 'cannot be matched with certainty. Nothing was saved or published.';

            return { issue: { message } };
        }

        return { family: families.find(family => pyUuidHex(family.id) === id) };
    }

    const byName = families.filter(family => nameKey(family.name) === nameKey(reference));

    if (byName.length > 1) {
        return {
            issue: {
                message: `The flow names the font family "${reference}", which ${byName.length} font families of the app match `
                    + `(${byName.map(family => family.id).join(', ')}). Rename one of them, or name the family by its id in the flow. `
                    + 'Nothing was saved or published.',
            },
        };
    }

    return { family: byName[0] };
};

/** Nulls are left out, as the server writes the copy. */
const compact = (entry: Json): Json =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null && value !== undefined));

const storedById = (entries: unknown): Map<string, Json> =>
    new Map((Array.isArray(entries) ? entries : []).filter(isRecord).map(entry => [String(entry.id), entry]));

/** The id prefix of a stored entry for a face the app ships in its own bundle, which the device finds by name. */
const BUNDLED_ID_PREFIX = 'user-font-';

const hasUrl = (entry: Json): boolean => typeof entry.url === 'string' && entry.url !== '';

/**
 * A stored entry the device finds by name (a legacy builder face): a bundled id and no file URL on the
 * entry or on any of its faces. The server keeps it when no family of the app matches its reference.
 */
const isBundled = (entry: Json): boolean => String(entry.id).startsWith(BUNDLED_ID_PREFIX)
    && !hasUrl(entry)
    && !(Array.isArray(entry.faces) ? entry.faces : []).some(face => isRecord(face) && hasUrl(face));

const bundledEntry = (entry: Json | undefined): Json | undefined =>
    (entry !== undefined && isBundled(entry) ? entry : undefined);

/** The face reads its own file, else the family file, else nothing: an empty URL, as the server writes it. */
const faceEntry = (face: FontFace, familyUrl: string): Json => compact({
    androidName: face.font_alias_android,
    id: face.id,
    iosName: face.font_alias_ios,
    isDefault: face.is_default,
    italic: face.italic,
    url: face.file_url ?? familyUrl,
    weight: face.weight,
});

/** The entry the server's own refresh writes for a family: the family URL is the file of its default face. */
const familyEntry = (family: FontFamily): Json => {
    const defaultFace = family.faces.find(face => face.id === family.default_face_id);
    const url = defaultFace?.file_url ?? '';

    return compact({
        androidName: defaultFace?.font_alias_android,
        faces: family.faces.map(face => faceEntry(face, url)),
        id: family.id,
        iosName: defaultFace?.font_alias_ios,
        name: family.name,
        url,
    });
};

/** Key order does not make two copies differ. */
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(item => canonical(item));
    }

    if (!isRecord(value)) {
        return value;
    }

    return Object.fromEntries(Object.keys(compact(value)).sort().map(key => [key, canonical(value[key])]));
};

const sameJson = (left: unknown, right: unknown): boolean =>
    JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export type FlowFontRefresh = {
    /** False when the stored copy already is the current one: nothing to save. */
    changed: boolean;
    config: Json;
};

/**
 * `_meta.fonts` becomes one entry per family the config references, in reference order, from the app
 * fonts as they are now, as the server's own refresh writes it. A reference no family matches keeps its
 * stored entry only when that is a bundled face; else it is left out for the publish to report. The
 * references themselves are not rewritten.
 */
export const refreshFlowFonts = (config: Json, families: readonly FontFamily[]): FlowFontRefresh => {
    const meta = isRecord(config._meta) ? config._meta : {};
    const stored = storedById(meta.fonts);
    const entries = new Map<string, Json>();

    const references = fontReferences(config);
    const resolutions = references.map(reference => resolve(reference, families));

    assertValid(resolutions.flatMap(resolution => (resolution.issue === undefined ? [] : [resolution.issue])));

    for (const [index, reference] of references.entries()) {
        const family = resolutions[index]?.family;
        const entry = family === undefined ? bundledEntry(stored.get(reference)) : familyEntry(family);

        if (entry !== undefined && !entries.has(String(entry.id))) {
            entries.set(String(entry.id), entry);
        }
    }

    const fonts = [...entries.values()];

    if (sameJson(fonts, meta.fonts ?? [])) {
        return { changed: false, config };
    }

    return { changed: true, config: { ...config, _meta: { ...meta, fonts } } };
};
