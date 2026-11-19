/** The door of the fonts resource: re-exports only. */
export { validateUpdateFontFace } from './face.js';
export { fontConflict, uploadChoices } from './upload.js';
export { fonts } from './resource.js';

export type { FontFaceRef, LocatedFontFace, ReplaceFontFileInput, UpdateFontFaceInput } from './face.js';
export type {
    FontFace,
    FontFamily,
    FontFamilyList,
    FontFamilyUsage,
    FontFamilyWriteResult,
    FontUploadResult,
    FontUploadResultKind,
    FontWarning,
} from './model.js';
export type { FontConflict, FontConflictRefusal, FontFile, UploadChoice } from './upload.js';
export type { FontsApi } from './resource.js';
