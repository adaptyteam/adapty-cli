import { Flags } from '@oclif/core';

import { findDraft } from '../../../../sdk/adapty/index.js';
import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { canAsk, confirmAction, yesFlag } from '../../../input/confirm.js';
import { flowVersionIdArg } from '../../../input/flow-versions.js';
import { replaceDraftQuestion, replaceDraftRefusal, restoredLine } from '../../../views/flow-versions.js';

import type { FlowVersionDetail, FlowVersionRow, RestoreFlowVersionInput } from '../../../../sdk/adapty/index.js';

const TOKEN_REQUIRED = '--expected-updated-at is required with --yes when the flow has a draft';

export default class FlowsVersionsRestore extends AdaptyCommand {
    static override args = { ...flowIdArg, ...flowVersionIdArg };
    static override description = 'Make a version of a flow the draft again: a new draft when the flow has none; when it has '
        + 'one, the draft gets the content of the version (it asks first). Nothing is published';

    static override examples = [
        '<%= config.bin %> flows versions restore FLOW_UUID VERSION_UUID --app APP_UUID',
        '<%= config.bin %> flows versions restore FLOW_UUID VERSION_UUID --app APP_UUID --yes --expected-updated-at 1794219300000',
    ];

    static override flags = {
        ...appIdFlag,
        'expected-updated-at': Flags.integer({
            description: 'The updated_at of the draft that the restore replaces, as `flows versions list --json` shows it; '
                + 'the restore fails when somebody changed the draft after that. Required with --yes when the flow has a draft',
        }),
        ...yesFlag,
    };

    async run(): Promise<FlowVersionDetail> {
        const { args, flags } = await this.parse(FlowsVersionsRestore);

        // The list first: whether there is a draft decides the question, and its row gives the token
        const { data: rows } = await this.adapty.flows.versions.list(flags.app, args.flow_id);
        const draft = findDraft(rows);
        const version = rows.find(row => row.flow_version_id === args.version_id);
        const versionTitle = version?.title ?? args.version_id;

        // Nothing to ask: no draft to replace; the draft itself (the server refuses it); a version that is
        // not in the list (the server answers that it does not exist)
        const replace = draft === undefined || version === undefined || draft === version
            ? undefined
            : await this.confirmReplace(draft, versionTitle, { token: flags['expected-updated-at'], yes: flags.yes });

        const restored = await this.adapty.flows.versions.restore(flags.app, args.flow_id, args.version_id, replace);

        this.render(restored, value => restoredLine(versionTitle, value));

        return restored;
    }

    private async confirmReplace(
        draft: FlowVersionRow,
        versionTitle: string,
        given: { token: number | undefined; yes: boolean },
    ): Promise<RestoreFlowVersionInput> {
        // --yes answers the question without anybody reading the draft: then the token is the proof of what is replaced
        if (given.yes && given.token === undefined) {
            throw new CliError(TOKEN_REQUIRED, exitCode.confirmRequired, 'confirm_required');
        }

        // Nobody can answer: say how to answer in the command, not only "--yes", which is refused without the token
        if (!given.yes && !canAsk({ interactive: this.interactive })) {
            throw new CliError(replaceDraftRefusal(draft, versionTitle), exitCode.confirmRequired, 'confirm_required');
        }

        await confirmAction({
            effect: replaceDraftQuestion(draft, versionTitle),
            interactive: this.interactive,
            signal: this.signal,
            yes: given.yes,
        });

        return { expectedUpdatedAt: given.token ?? draft.updated_at };
    }
}
