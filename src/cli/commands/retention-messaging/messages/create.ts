import { Flags } from '@oclif/core';

import {
    createIconPaths,
    planCreate,
    validateCreateFile,
    validateCreateImages,
} from '../../../../sdk/adapty/retention-messaging/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { withUnknownResult } from '../../../errors/hints.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { readJsonFile } from '../../../input/json.js';
import { fileFolder, modeFlag, readIcons, readImage } from '../../../input/retention-messaging.js';
import { ASK_THE_USER, renderWritten } from '../../../views/retention-messaging.js';

import type { CreateMessageFile, RetentionMessageAnswer } from '../../../../sdk/adapty/retention-messaging/index.js';

const effectOf = (name: string, mode: string): string => `Create retention message "${name}" in ${mode}. Its texts and images `
    + 'go to Apple for review; after Apple approves it and it is active, Apple can show it to subscribers on the cancel screen.';

export default class RetentionMessagingMessagesCreate extends AdaptyCommand {
    static override summary = 'Create a retention message from a JSON file';

    static override description = [
        'The file holds the message: name, type (default or promo), title, body, alt_text, header_position, products '
        + '([{store_id, association: {type: promo_offer|plan_switch, store_id}}]), bullet_points ([{image_path, alt_text, text}], '
        + 'default messages only) and localizations ([{locale, title, body, bullet_points: [{text}]}]). image_path is the path '
        + 'of the PNG icon, relative to the folder of the file; image_index is not allowed. --image is the message image.',
        'Every image is checked before anything is sent: a PNG of the size Apple requires, with no transparency. Then it asks '
        + 'in both modes, sandbox and production (--yes; exit 6 when nobody can answer, exit 1 on no).',
        'The create is sent once and never repeated. If its answer is lost (exit 5, or 4 on a 5xx), the result is unknown: do not '
        + 'create again; look for the message by name in `messages list` and read each candidate with `messages get`.',
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> retention-messaging messages create --app UUID --mode sandbox --file message.json --image header.png --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...modeFlag('The Apple environment of the new message'),
        file: Flags.string({ description: 'Path to the JSON file of the message, or - for stdin', required: true }),
        image: Flags.string({ description: 'Path to the PNG message image' }),
        ...yesFlag,
    };

    async run(): Promise<RetentionMessageAnswer> {
        const { flags } = await this.parse(RetentionMessagingMessagesCreate);
        const file = await readJsonFile(flags.file);

        assertValid(validateCreateFile(file));

        const body = file as CreateMessageFile;
        const image = flags.image === undefined ? undefined : await readImage(flags.image);
        const images = { icons: await readIcons(createIconPaths(body), fileFolder(flags.file)), image };

        assertValid(validateCreateImages(images));

        const plan = planCreate(body, images);
        const name = typeof body.name === 'string' ? body.name : '';

        await confirmAction({
            effect: `${effectOf(name, flags.mode)}\n${ASK_THE_USER}`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const { messages } = this.adapty.retentionMessaging;

        const answer = await messages.create(flags.app, flags.mode, plan).catch((error: unknown) => {
            // The name stays out of the command line: no shell (POSIX or cmd.exe) gets to parse it
            throw withUnknownResult(error, 'Do not repeat the create: it can make a second message and send it to Apple review '
                + `again. Find the candidates: run \`adapty retention-messaging messages list --app ${flags.app} --mode ${flags.mode} `
                + '--search <name>` on every page, with <name> the message name below (message_name in --json), read each '
                + `with \`messages get\` and show them to the user.\nMessage name: ${name}`, { message_name: name });
        });

        this.render(answer, renderWritten('Message created!'));

        return answer;
    }
}
