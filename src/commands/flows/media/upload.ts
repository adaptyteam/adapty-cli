import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { Args, Command } from '@oclif/core';

import { CliError, exitCode } from '../../../cli/errors.js';
import { appIdFlag } from '../../../cli/input/app.js';
import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { printResponse } from '../../../lib/output.js';
import { imageMimeType, validateImageUpload } from '../../../sdk/adapty/flow-media.js';

import type { MediaDTO } from '../../../lib/api-schemas.js';

export default class FlowsMediaUpload extends Command {
    static override args = {
        file: Args.string({ description: 'Path to the image file to upload', required: true }),
    };

    static override description = [
        'Upload an image as a flow builder asset (PNG, JPEG, WEBP or SVG); prints the CDN URL to reference from a flow config.',
        'A video has its own command: flows media upload-video.',
    ].join('\n');

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> flows media upload --app UUID ./onboarding-hero.png'];
    static override flags = {
        ...appIdFlag,
    };

    async run(): Promise<MediaDTO> {
        const { args, flags } = await this.parse(FlowsMediaUpload);

        let content: Buffer;

        try {
            content = await readFile(args.file);
        } catch {
            this.error(`Cannot read file: ${args.file}`, { exit: 2 });
        }

        const name = basename(args.file);
        // The rules live in the sdk: no GIF (by name or content), no video, no HEIC.
        const issues = validateImageUpload({ head: content, name });

        if (issues.length > 0) {
            // A CliError, not this.error(): under --json oclif serializes it with its text and exit code.
            throw new CliError(issues.map(issue => issue.message).join('\n'), exitCode.usage);
        }

        const type = imageMimeType(name);

        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(content)], { type }), name);

        const client = await createAuthenticatedClient(this.config);
        const result = await client.postForm<MediaDTO>(`/apps/${flags.app}/flows/media/images`, form);

        this.log('Image uploaded!');
        // `preview_base64` is a long data blob with no value in human output; --json still returns it in full.
        printResponse({ id: result.id, name: result.name, url: result.url }, this.log.bind(this));

        return result;
    }
}
