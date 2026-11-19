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

/** The conflict of a refused upload and the choices a repeat takes. */
export type FontConflictRefusal = {
    choices: UploadChoice[];
    conflict: FontConflict;
};

/** The multipart form of one file: the server reads the format from the bytes, not from the type. */
export const fontForm = (file: FontFile, fields: Record<string, string | undefined> = {}): FormData => {
    const form = new FormData();

    form.append('file', new Blob([new Uint8Array(file.content)], { type: 'application/octet-stream' }), file.name);

    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
            form.append(key, value);
        }
    }

    return form;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * The colliding face of a refused upload, when the refusal offers the choice. A refusal raised while a
 * choice was already given, and `font_faces_already_exist` (a set of pairs, no single face), have none.
 */
export const fontConflict = (error: unknown): FontConflictRefusal | undefined => {
    if (!(error instanceof ApiError) || !isRecord(error.details)) {
        return undefined;
    }

    const { choices, conflict } = error.details;

    if (!isRecord(conflict) || !Array.isArray(choices)) {
        return undefined;
    }

    return {
        choices: choices.filter((choice): choice is UploadChoice => uploadChoices.includes(choice as UploadChoice)),
        conflict: conflict as FontConflict,
    };
};
