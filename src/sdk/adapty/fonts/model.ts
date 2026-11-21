/**
 * The custom fonts of an app as the server sends them: a family holds faces, a face is one weight and
 * style of a font file. A variable file can back several faces. Names pass through in snake_case.
 */

export type FontMetadataStatus = 'confirmed' | 'detected' | 'legacy_unconfirmed' | 'needs_review';

export type FontFace = {
    family_id: string;
    file_format: null | string;
    file_id: null | number;
    /** The URL of the stored file the face reads; null when it has none or storage cannot resolve it. */
    file_url: null | string;
    font_alias_android: null | string;
    font_alias_ios: null | string;
    id: string;
    is_default: boolean;
    italic: boolean | null;
    metadata_status: FontMetadataStatus;
    weight: null | number;
};

export type FontFamily = {
    default_face_id: string;
    faces: FontFace[];
    id: string;
    name: string;
};

export type FontFamilyList = { data: FontFamily[] };

/** A name the face lacks: the write is saved, the warning says what the app will miss. */
export type FontWarning = {
    code: string;
    face_id: string;
    message: string;
};

/** The family of a face after a write that can leave a face without a name. */
export type FontFamilyWriteResult = FontFamily & { warnings: FontWarning[] };

export type FontUploadResultKind = 'added' | 'created' | 'kept' | 'partly_added' | 'replaced';

/** What one file did: the faces it created, the faces it replaced, and the faces it left as they are. */
export type FontUploadResult = {
    created_faces: FontFace[];
    /** Null when no family matched and none was created. */
    family: FontFamily | null;
    /** Null when nothing was stored (`kept`). */
    file_id: null | number;
    file_name: string;
    kept_faces: FontFace[];
    replaced_faces: FontFace[];
    result: FontUploadResultKind;
    warnings: FontWarning[];
};

export type FontFamilyUsage = {
    faces: { face_id: string; paywalls: { found_count: number; paywall_id: string }[] | null }[];
    family_id: string;
    flows: { flow_id: string; found_count: number }[];
    paywalls: { found_count: number; paywall_id: string }[];
};
