import { Args, Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../flags.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Run extends AdaptyCommand {
    static override description = 'Do one of the actions the migration offers';

    static override examples = [
        '<%= config.bin %> migrations run resolve_app_mapping --input \'{"rc_app_ids":["app_ios"]}\'',
        '<%= config.bin %> migrations run resolve_mapping --input-file ./decisions.json --yes',
        '<%= config.bin %> migrations run upload_file --file ./rc-export.csv.gz',
    ];

    static override args = {
        action_id: Args.string({
            description: 'Action id, as listed by `adapty migrations status`',
            required: true,
        }),
    };

    // One command per action kind: input goes with --input/--input-file, upload with --file, and
    // an external action only prints its link. Which one applies is the server's answer, so the
    // flags cannot be split into three commands — the checks belong in run().
    static override flags = {
        ...migrationFlags,
        'input': Flags.string({
            description: 'Action input as JSON',
            exclusive: ['input-file'],
        }),
        'input-file': Flags.string({
            description: 'Read the action input from a file, or from stdin with -',
            exclusive: ['input'],
        }),
        'file': Flags.string({
            description: 'File to upload for an upload action',
        }),
        'yes': Flags.boolean({
            char: 'y',
            description: 'Agree to an action that changes production data, without the prompt',
        }),
        'open': Flags.boolean({
            description: 'Open the link of an external action, even with --json',
            exclusive: ['no-browser'],
        }),
        'no-browser': Flags.boolean({
            description: 'Never open a browser; print the link only',
            exclusive: ['open'],
        }),
    };

    async run(): Promise<Envelope> {
        await this.parse(Run);

        // TODO: read the envelope, find the action in next_actions ∪ available_actions (exit 2 when
        // it is not there), then branch on kind: external prints and opens the href, upload streams
        // the file first, input POSTs. A confirm without --yes prints the text and exits 6.
        throw new Error('`adapty migrations run` is not implemented yet');
    }
}
