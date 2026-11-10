import { open, readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { Args } from '@oclif/core';

import { MEDIA_HEAD_BYTES, validateVideoUpload } from '../../../../sdk/adapty/flow-media.js';
import { isSdkError } from '../../../../sdk/core/errors.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { renderRecord } from '../../../views/record.js';

import type { FlowVideo } from '../../../../sdk/adapty/flow-media.js';

/** An older backend has no video route: it answers 404 to the path itself. */
export const NO_VIDEO_ROUTE_MESSAGE = 'This Adapty backend has no video upload yet: the video route answered 404.';

type Head = { head: Uint8Array; size: number };

/** The size and the first bytes, so a refused file is never read in full. */
const readHead = async (path: string): Promise<Head> => {
    const handle = await open(path, 'r');

    try {
        const { size } = await handle.stat();
        const buffer = new Uint8Array(MEDIA_HEAD_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, MEDIA_HEAD_BYTES, 0);

        return { head: buffer.subarray(0, bytesRead), size };
    } finally {
        await handle.close();
    }
};

const cannotRead = (path: string, cause: unknown): CliError =>
    new CliError(`Cannot read file: ${path}`, exitCode.usage, undefined, { cause });

const isMissingRoute = (error: unknown): boolean => isSdkError(error) && error.kind === 'api' && error.status === 404;

/** `preview_base64` is a long data blob with no value in a human view; --json still returns it. */
const renderVideo = (video: FlowVideo): string => {
    const { height, preview_url: previewUrl, video_url: videoUrl, width } = video;

    return ['Video uploaded!', renderRecord({ video_url: videoUrl, preview_url: previewUrl, width, height })].join('\n');
};

export default class FlowsMediaUploadVideo extends AdaptyCommand {
    static override args = {
        file: Args.string({ description: 'Path to the video file to upload (mp4 or webm)', required: true }),
    };

    static override description = [
        'Upload a video as a flow builder asset: an mp4 or webm file.',
        'Prints the video URL and the preview image URL to reference from a flow config video element, with the width and height.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> flows media upload-video --app UUID ./intro.mp4',
        '<%= config.bin %> flows media upload-video --app UUID ./intro.webm --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<FlowVideo> {
        const { args, flags } = await this.parse(FlowsMediaUploadVideo);
        const name = basename(args.file);

        const { head, size } = await readHead(args.file).catch((error: unknown) => {
            throw cannotRead(args.file, error);
        });

        // Before the token is asked for: a refused file needs no session and sends nothing.
        assertValid(validateVideoUpload({ head, name, size }));

        const content = await readFile(args.file).catch((error: unknown) => {
            throw cannotRead(args.file, error);
        });

        const upload = this.adapty.flows.media.uploadVideo(flags.app, { content, name });

        const video = await upload.catch((error: unknown) => {
            if (isMissingRoute(error)) {
                throw new CliError(NO_VIDEO_ROUTE_MESSAGE, exitCode.api, 'video_upload_unavailable', {
                    cause: error,
                    json: { status: 404, status_code: 404 },
                });
            }

            throw error;
        });

        this.render(video, renderVideo);

        return video;
    }
}
