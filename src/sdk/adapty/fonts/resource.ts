import { ApiError } from '../../core/errors.js';
import { assertValid } from '../../core/validation.js';

import { locateFace, toReplaceFontFileFields, toUpdateFontFaceRequest, validateUpdateFontFace } from './face.js';
import { fontForm } from './upload.js';

import type { FontFaceRef, LocatedFontFace, ReplaceFontFileInput, UpdateFontFaceInput } from './face.js';
import type { FontFamily, FontFamilyList, FontFamilyUsage, FontFamilyWriteResult, FontUploadResult } from './model.js';
import type { FontFile, UploadChoice } from './upload.js';
import type { Http } from '../../core/http/index.js';

/**
 * A field the caller acts on must be in the answer: an older server without it would otherwise read as
 * "no warnings" or "no flows". The error names the field.
 */
const requireLists = async <T>(pending: Promise<T>, fields: readonly string[]): Promise<T> => {
    const answer = await pending;
    const missing = fields.filter(field => !Array.isArray((answer as Record<string, unknown> | null)?.[field]));

    if (missing.length > 0) {
        throw new ApiError({
            code: 'malformed_response',
            details: answer,
            message: `The server answer has no ${missing.join(', ')} list. The CLI needs a server with the font routes; nothing was read as empty.`,
            status: 200,
        });
    }

    return answer;
};

const UPLOAD_FIELDS = ['created_faces', 'replaced_faces', 'kept_faces', 'warnings'];

/**
 * The custom fonts of an app. A file write is never retried: a second upload of the same file collides
 * with the first. One file per request; a package is the caller's loop.
 */
export const fonts = (http: Http) => {
    const base = (appId: string) => `/apps/${appId}/media/fonts`;
    const face = (appId: string, ref: FontFaceRef) => `${base(appId)}/${ref.familyId}/faces/${ref.faceId}`;
    const list = (appId: string) => requireLists(http.get<FontFamilyList>(base(appId)), ['data']);

    const usage = (appId: string, familyId: string) =>
        requireLists(http.get<FontFamilyUsage>(`${base(appId)}/${familyId}/usage`), ['flows', 'paywalls', 'faces']);

    return {
        get: (appId: string, familyId: string) => http.get<FontFamily>(`${base(appId)}/${familyId}`),
        list,
        usage,

        /** The faces of a family are added from the file whatever family name the file carries. */
        add: (appId: string, familyId: string, file: FontFile, choice?: UploadChoice) =>
            requireLists(http.post<FontUploadResult>(`${base(appId)}/${familyId}/faces`, fontForm(file, { choice }), {
                idempotent: false,
            }), UPLOAD_FIELDS),

        /** The face and its family, read from the font list: a face route names both. */
        findFace: async (appId: string, faceId: string): Promise<LocatedFontFace> =>
            locateFace((await list(appId)).data, faceId),

        /** The flows that use any of these families, each once: they need a publish to get a font change. */
        flowsUsing: async (appId: string, familyIds: readonly string[]): Promise<string[]> => {
            const usages = await Promise.all([...new Set(familyIds)].map(familyId => usage(appId, familyId)));

            return [...new Set(usages.flatMap(answer => answer.flows.map(flow => flow.flow_id)))];
        },

        rename: (appId: string, familyId: string, name: string) =>
            http.patch<FontFamily>(`${base(appId)}/${familyId}`, { name }),

        /** The family is the first one whose name equals the name in the file, any case; else a new one. */
        upload: (appId: string, file: FontFile, choice?: UploadChoice) =>
            requireLists(
                http.post<FontUploadResult>(base(appId), fontForm(file, { choice }), { idempotent: false }),
                UPLOAD_FIELDS,
            ),

        faces: {
            /** The face joins the target family; its file does not change. The answer is the target family. */
            move: (appId: string, ref: FontFaceRef, targetFamilyId: string) =>
                http.post<FontFamily>(`${face(appId, ref)}/move`, { target_font_family_id: targetFamilyId }, { idempotent: false }),

            /** The face keeps its id, default mark and Android name; the iOS name follows the new file. */
            replace: (appId: string, ref: FontFaceRef, file: FontFile, input: ReplaceFontFileInput = {}) =>
                requireLists(
                    http.put<FontFamilyWriteResult>(`${face(appId, ref)}/file`, fontForm(file, toReplaceFontFileFields(input)), {
                        idempotent: false,
                    }),
                    ['warnings'],
                ),

            update: async (appId: string, ref: FontFaceRef, input: UpdateFontFaceInput) => {
                assertValid(validateUpdateFontFace(input));

                return requireLists(http.patch<FontFamilyWriteResult>(face(appId, ref), toUpdateFontFaceRequest(input)), ['warnings']);
            },
        },
    };
};

export type FontsApi = ReturnType<typeof fonts>;
