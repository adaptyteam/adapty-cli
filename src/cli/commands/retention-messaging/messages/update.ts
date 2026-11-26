import { Flags } from '@oclif/core';

import {
    changeIconPaths,
    planUpdate,
    validateChangeShape,
    validateMessageChange,
    validateUpdateImages,
} from '../../../../sdk/adapty/retention-messaging/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { withUnknownResult } from '../../../errors/unknown-result.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { readJsonFile } from '../../../input/json.js';
import { changeFromInput, fileFolder, messageIdArg, readIcons, readImage } from '../../../input/retention-messaging.js';
import { ASK_THE_USER, renderWritten } from '../../../views/retention-messaging.js';

import type { MessageChange, RetentionMessageAnswer } from '../../../../sdk/adapty/retention-messaging/index.js';

const effectOf = (messageId: string): string => `Update retention message ${messageId}. Each update, also a change of the `
    + 'name only, sends the message to Apple review. An inactive message starts to show again after Apple approves it. If '
    + 'someone edits this message in the dashboard at the same time, a change made between the read and the write of this '
    + 'update can be lost.';

export default class RetentionMessagingMessagesUpdate extends AdaptyCommand {
    static override summary = 'Change a retention message; what you do not name stays';

    static override description = [
        'Give field flags and/or --file with the change: name, title, body, alt_text; localizations ([{locale, title, body, '
        + 'bullet_texts: {BULLET_ID: text}}], a new locale needs all of them); bullet_points ([{bullet_id, text, alt_text, '
        + 'image_path}]; a new bullet point has no bullet_id and needs image_path, text and texts: {LOCALE: text} for every '
        + 'localization); products ([{store_id, association}]: a left-out association stays, null removes it). Removal is only '
        + 'explicit: remove_localizations, remove_bullet_points, remove_products, remove_image or --remove-image.',
        'A conflict (one object both changed and removed, a field both as a flag and in the file, a text for a removed locale) '
        + 'is refused before anything is sent. Then it asks (--yes; exit 6 when nobody can answer), reads the message, merges '
        + 'the change and sends the full message once. An object to remove or change that the message does not have is refused '
        + 'after the read, with nothing sent. If the answer is lost, the result is unknown: read the message, do not repeat.',
        'Each update, also of the name only, sends the message to Apple review, and an inactive message starts to show again '
        + 'after Apple approves it. If someone edits the message in the dashboard at the same time, a change made between the '
        + 'read and the write of this update can be lost.',
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> retention-messaging messages update MESSAGE_ID --app UUID --title "Stay with us" --yes',
        '<%= config.bin %> retention-messaging messages update MESSAGE_ID --app UUID --file changes.json --yes',
    ];

    static override args = { ...messageIdArg };

    static override flags = {
        ...appIdFlag,
        'alt-text': Flags.string({ description: 'Alt text of the message image' }),
        'body': Flags.string({ description: 'Body in en-US' }),
        'file': Flags.string({ description: 'Path to the JSON file of the change, or - for stdin' }),
        'image': Flags.string({ description: 'Path to a new PNG message image' }),
        'name': Flags.string({ description: 'Name of the message' }),
        'remove-image': Flags.boolean({ description: 'Remove the message image' }),
        'title': Flags.string({ description: 'Title in en-US' }),
        ...yesFlag,
    };

    async run(): Promise<RetentionMessageAnswer> {
        const { args, flags } = await this.parse(RetentionMessagingMessagesUpdate);
        const file = flags.file === undefined ? {} : await readJsonFile(flags.file);

        assertValid(validateChangeShape(file));

        const change = changeFromInput(file as MessageChange, flags);

        assertValid(validateMessageChange(change, flags.image !== undefined));

        const paths = changeIconPaths(change);
        const icons = await readIcons(paths, fileFolder(flags.file));

        const images = {
            icons: new Map(paths.map((path, index) => [path, icons[index] ?? { bytes: new Uint8Array(), name: path }])),
            image: flags.image === undefined ? undefined : await readImage(flags.image),
        };

        assertValid(validateUpdateImages(images));

        await confirmAction({
            effect: `${effectOf(args.message_id)}\n${ASK_THE_USER}`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const { messages } = this.adapty.retentionMessaging;
        const read = await messages.get(flags.app, args.message_id);
        const plan = planUpdate(read.data, change, images);

        const answer = await messages.update(flags.app, args.message_id, plan).catch((error: unknown) => {
            throw withUnknownResult(error, 'Do not repeat the update. Read the message with `adapty retention-messaging messages '
                + `get ${args.message_id} --app ${flags.app}\` and check its state.`);
        });

        this.render(answer, renderWritten('Message updated!'));

        return answer;
    }
}
