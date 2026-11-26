import { ApiError } from '../../../../sdk/core/errors.js';
import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { CliError, toCliError } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { yesFlag } from '../../../input/confirm.js';
import { flowFixLinks } from '../../../views/flow-links.js';
import { renderRecord } from '../../../views/record.js';

import { confirmPublish } from './lib/confirm.js';
import { readFontStep, saveFonts } from './lib/fonts.js';

import type { Flow } from '../../../../sdk/adapty/index.js';

const SAVED = 'The flow config was saved with the current fonts before the publish; that save stays.';

/**
 * A refused publish. A config the server cannot publish keeps the published wording and exit 1, with the
 * links to fix it; after a font save the message and `saved` in --json say that the save went through.
 */
export const publishError = (error: unknown, flowId: string, saved: boolean): Error => {
    if (error instanceof ApiError && (error.status === 400 || error.code === 'validation_error')) {
        const message = `Flow publish failed: ${error.message}\n`
            + 'Publishing needs a flow with a valid config. Fix it, then run `adapty flows publish` again:\n'
            + flowFixLinks(flowId)
            + (saved ? `\n${SAVED}` : '');

        return new CliError(message, 1, error.code, { cause: error, json: saved ? { saved: true } : undefined });
    }

    const failure = toCliError(error);

    if (!saved || !(failure instanceof CliError)) {
        return failure;
    }

    const message = `${failure.message}\n${SAVED}`;

    const json = { ...failure.json, message, saved: true };

    return new CliError(message, failure.exitCode, failure.code, { cause: error, json });
};

export default class FlowsPublish extends AdaptyCommand {
    static override args = { ...flowIdArg };

    static override description
        = 'Publish a flow (async — publication completes in the background). '
            + 'When the flow uses custom fonts, the copy of the fonts in its config is refreshed from the app fonts first, '
            + 'as the flow builder does, and the config is saved (with its remote configs) when the copy changed. '
            + 'A malformed config response stops the publish (exit 4). If the save response is malformed, the save may have gone through. '
            + 'Read it with `adapty flows config get --app APP_ID FLOW_ID` before publishing again. A missing flow exits 4. '
            + 'The command returns status `publishing`. Poll `adapty flows get <flow_id>` for `published` or `publication_failed`. '
            + 'On failure, `adapty flows config get <flow_id>` shows why.';

    static override examples = ['<%= config.bin %> flows publish --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = { ...appIdFlag, ...yesFlag };

    async run(): Promise<Flow> {
        const { args, flags } = await this.parse(FlowsPublish);
        const ids = { appId: flags.app, flowId: args.flow_id };
        const base = `/apps/${flags.app}/flows/${args.flow_id}`;
        const flow = await this.adapty.flows.get(flags.app, args.flow_id);
        const fonts = await readFontStep(this.adapty, flags.app, args.flow_id);
        const save = fonts?.refresh.changed === true ? fonts : undefined;

        await confirmPublish({
            requests: [...(save === undefined ? [] : [`PUT ${base}/config/`]), `POST ${base}/publish/`],
            summary: `Publish flow "${flow.name}" live to end users`
                + (save === undefined ? '' : ', after saving its config with the current fonts'),
        }, { json: this.jsonEnabled(), signal: this.signal, yes: flags.yes });

        if (save !== undefined) {
            await saveFonts(this.adapty, ids, save);
        }

        const result = await this.adapty.flows.publish(flags.app, args.flow_id).catch((error: unknown) => {
            throw publishError(error, args.flow_id, save !== undefined);
        });

        this.render(result, value => [
            ...(save === undefined ? [] : ['Fonts refreshed: the flow config was saved with the current app fonts.']),
            'Publishing started — status: publishing. This is asynchronous; the flow is NOT published yet.',
            `Check progress:  adapty flows get --app ${flags.app} ${args.flow_id}   (wait for status 'published' or 'publication_failed')`,
            `If it fails:     adapty flows config get --app ${flags.app} ${args.flow_id}   (shows why)`,
            renderRecord(value),
        ].join('\n'));

        return result;
    }
}
