/** The door of the fonts resource: re-exports only. */
export { faceRef, familiesOfFile, validateUpdateFontFace } from './face.js';
export { ambiguousFamilies, fontConflict, uploadChoices } from './upload.js';
export { FontAnswerError, fonts } from './resource.js';

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
export type { AmbiguousFontFamily, FontConflict, FontConflictRefusal, FontFile, UploadChoice, UploadDecision } from './upload.js';
export type { FontsApi } from './resource.js';
