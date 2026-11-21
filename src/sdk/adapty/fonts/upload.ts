import { ApiError } from '../../core/errors.js';

/**
 * One font file per request: the upload of a family and the add of faces to a chosen family take the
 * same form. The server reads the family name, the weights and the names from the file itself.
 */

/** What the repeated upload does with a face that is already there: put the file on it, or skip the file. */
export const uploadChoices = ['replace', 'keep'] as const;

export type UploadChoice = (typeof uploadChoices)[number];

export type FontFile = {
    content: Uint8Array;
    /** The file name the server stores and reports back. */
    name: string;
};

/** The stored face an upload collided with: its pair, or its iOS name. */
export type FontConflict = {
    face_id: string;
    family_id: string;
    family_name: string;
    font_alias_ios: null | string;
    italic: boolean | null;
    weight: null | number;
};

/** The collisions of a refused upload and the choices a repeat takes. */
export type FontConflictRefusal = {
    choices: UploadChoice[];
    /** The first collision, `conflicts[0]`. */
    conflict: FontConflict;
    /** Every stored face the file collides with, in the order of the faces of the file. */
    conflicts: FontConflict[];
};

/** The multipart form of one file: the server reads the format from the bytes, not from the type. */
/** A form field: one value, a list (the field repeated) or nothing. */
export type FormFields = Record<string, readonly string[] | string | undefined>;

export const fontForm = (file: FontFile, fields: FormFields = {}): FormData => {
    const form = new FormData();

    form.append('file', new Blob([new Uint8Array(file.content)], { type: 'application/octet-stream' }), file.name);

    for (const [key, value] of Object.entries(fields)) {
        // A list is the field repeated, one value each
        for (const item of value === undefined ? [] : [value].flat()) {
            form.append(key, item);
        }
    }

    return form;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * The colliding faces of a refused upload, when the refusal offers the choice. `font_faces_already_exist`
 * (a set of pairs, no single face), two faces of the file with one iOS name, and a refusal of the replace
 * rules have none. An answer with `conflict` alone (an older server) is one collision.
 */
export const fontConflict = (error: unknown): FontConflictRefusal | undefined => {
    if (!(error instanceof ApiError) || !isRecord(error.details)) {
        return undefined;
    }

    const { choices, conflict, conflicts } = error.details;
    const listed = Array.isArray(conflicts) ? conflicts.filter(isRecord) as FontConflict[] : [];
    const all = listed.length > 0 ? listed : [conflict].filter(isRecord) as FontConflict[];
    const [first] = all;

    if (first === undefined || !Array.isArray(choices)) {
        return undefined;
    }

    return {
        choices: choices.filter((choice): choice is UploadChoice => uploadChoices.includes(choice as UploadChoice)),
        conflict: first,
        conflicts: all,
    };
};
