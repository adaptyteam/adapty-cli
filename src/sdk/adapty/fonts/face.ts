import { ApiError } from '../../core/errors.js';

import type { FontFace, FontFamily } from './model.js';
import type { Issue } from '../../core/errors.js';

/** The fields of a face that a person can set. Weight and italic go together; the server checks the pair. */
export type UpdateFontFaceInput = {
    androidName?: string | undefined;
    iosName?: string | undefined;
    /** Only `true`: a family always has one default face, so a face stops being it when another one starts. */
    isDefault?: true | undefined;
    italic?: boolean | undefined;
    weight?: number | undefined;
};

/** A new file for a face. A face whose pair is not known needs one to take a variable file. */
export type ReplaceFontFileInput = {
    italic?: boolean | undefined;
    weight?: number | undefined;
};

export const validateUpdateFontFace = (input: UpdateFontFaceInput): Issue[] =>
    (Object.values(input).every(value => value === undefined)
        ? [{ message: 'Nothing to change: give a weight and italic, an iOS name, an Android name or the default mark.' }]
        : []);

export const toUpdateFontFaceRequest = (input: UpdateFontFaceInput): Record<string, unknown> => {
    const body: Record<string, unknown> = {
        font_alias_android: input.androidName,
        font_alias_ios: input.iosName,
        is_default: input.isDefault,
        italic: input.italic,
        weight: input.weight,
    };

    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
};

export const toReplaceFontFileFields = (input: ReplaceFontFileInput): Record<string, string | undefined> => ({
    italic: input.italic === undefined ? undefined : String(input.italic),
    weight: input.weight === undefined ? undefined : String(input.weight),
});

/** The face, its family, and the font list it was found in (a file can back faces of several families). */
export type LocatedFontFace = { face: FontFace; families: FontFamily[]; family: FontFamily };

/** A face route names the family and the face. */
export type FontFaceRef = { faceId: string; familyId: string };

/** The ref of a located face, with the ids as the server wrote them. */
export const faceRef = ({ face, family }: Pick<LocatedFontFace, 'face' | 'family'>): FontFaceRef =>
    ({ faceId: face.id, familyId: family.id });

/**
 * The families whose faces read the file of this face: an Android name is set on the file, so it changes
 * on every one of them. A face with no stored file is its family alone.
 */
export const familiesOfFile = ({ face, families, family }: LocatedFontFace): string[] => {
    if (face.file_id === null) {
        return [family.id];
    }

    const readsFile = (candidate: FontFamily): boolean => candidate.faces.some(other => other.file_id === face.file_id);

    return families.filter(candidate => readsFile(candidate)).map(candidate => candidate.id);
};

/**
 * The family of a face, from the font list of its app: the face routes name both, a person knows the face.
 * A face that is not in the app is the server's own refusal, `font_face_not_found`, so it reads the same.
 */
export const locateFace = (families: readonly FontFamily[], faceId: string): LocatedFontFace => {
    // A UUID is the same in any case; the server sends it in lowercase
    const wanted = faceId.toLowerCase();

    for (const family of families) {
        const face = family.faces.find(candidate => candidate.id.toLowerCase() === wanted);

        if (face !== undefined) {
            return { face, families: [...families], family };
        }
    }

    throw new ApiError({
        code: 'font_face_not_found',
        message: `Font face ${faceId} not found in this app. The font list of the app shows its faces.`,
        status: 404,
    });
};
