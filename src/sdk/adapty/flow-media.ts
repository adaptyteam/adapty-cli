import type { Issue } from '../core/errors.js';

/**
 * What the flow builder takes as an uploaded file, checked on what the client can see: the file
 * name, the size and the first bytes. The server checks the rest (the duration and the size in
 * pixels of a video) and words its own refusal; it needs a decoder the client does not have.
 *
 * Each rule returns at most one issue, the first that applies: a GIF is refused as a GIF before
 * any other format rule, also when its name says it is something else.
 */

/** A video upload is refused above this size, here and by the server. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** The image types the flow builder stores. GIF and HEIC are not among them. */
export const imageMimeTypes: Readonly<Record<string, string>> = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

/** The video types the flow builder transcodes. */
export const videoMimeTypes: Readonly<Record<string, string>> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

/** Video files that the image upload refuses with a pointer to the video upload. */
const VIDEO_EXTENSIONS = new Set(['.mov', ...Object.keys(videoMimeTypes)]);

/** Image files the image upload refuses with the list of the types it takes. */
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set(['.heic']);

/** "GIF87a" and "GIF89a": every GIF starts with one of the two. */
const GIF_SIGNATURES = ['GIF87a', 'GIF89a'];

/** How many first bytes of a file the rules read. */
export const MEDIA_HEAD_BYTES = 6;

export const mediaMessages = {
    gif: 'GIF is not supported.',
    notImage: 'Only PNG, JPEG, WEBP and SVG images are allowed.',
    notVideo: 'Only mp4 and webm videos are allowed.',
    tooLarge: 'File size must not exceed 50 MiB.',
    videoOnImage: 'This is a video file. Use flows media upload-video.',
} as const;

export type MediaFile = {
    /** The first bytes of the file; `MEDIA_HEAD_BYTES` of them are enough. */
    head: Uint8Array;
    /** The file name with its extension, as it is sent. */
    name: string;
    /** The size of the whole file in bytes. */
    size: number;
};

/** The extension in lower case, with its dot; empty when the name has none. */
export const mediaExtension = (name: string): string => {
    const base = name.slice(name.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');

    return dot <= 0 ? '' : base.slice(dot).toLowerCase();
};

/** A GIF by its name, or by its content under any other name. */
export const isGif = (name: string, head: Uint8Array): boolean => {
    if (mediaExtension(name) === '.gif') {
        return true;
    }

    const start = String.fromCharCode(...head.subarray(0, MEDIA_HEAD_BYTES));

    return GIF_SIGNATURES.includes(start);
};

const refusal = (message: string): Issue[] => [{ message }];

/** The image upload: no GIF, no video, no HEIC. Another extension is left to the server. */
export const validateImageUpload = (file: Pick<MediaFile, 'head' | 'name'>): Issue[] => {
    if (isGif(file.name, file.head)) {
        return refusal(mediaMessages.gif);
    }

    const extension = mediaExtension(file.name);

    if (VIDEO_EXTENSIONS.has(extension)) {
        return refusal(mediaMessages.videoOnImage);
    }

    if (UNSUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
        return refusal(mediaMessages.notImage);
    }

    return [];
};

/** The video upload: no GIF, only mp4 and webm, and not above `VIDEO_MAX_BYTES`. */
export const validateVideoUpload = (file: MediaFile): Issue[] => {
    if (isGif(file.name, file.head)) {
        return refusal(mediaMessages.gif);
    }

    if (videoMimeTypes[mediaExtension(file.name)] === undefined) {
        return refusal(mediaMessages.notVideo);
    }

    if (file.size > VIDEO_MAX_BYTES) {
        return refusal(mediaMessages.tooLarge);
    }

    return [];
};

/** The content type an image is sent with; the server reads the extension, not this. */
export const imageMimeType = (name: string): string => imageMimeTypes[mediaExtension(name)] ?? 'application/octet-stream';

/** The video route answer, as the server sends it. In a flow config it is `{videoUrl, previewUrl, width, height}`. */
export type FlowVideo = {
    /** The base64 preview image; long, and of no use in a human view. */
    preview_base64?: null | string | undefined;
    /** The URL of the preview image, for `previewUrl`. */
    preview_url: string;
    /** Height of the largest rendition in pixels; the source aspect ratio. */
    height: number;
    /** The URL of the HLS master playlist, for `videoUrl`. */
    video_url: string;
    /** Width of the largest rendition in pixels; the source aspect ratio. */
    width: number;
};

export type FlowVideoUpload = {
    content: Uint8Array;
    name: string;
};
