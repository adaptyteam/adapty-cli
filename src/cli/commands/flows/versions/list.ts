import { Flags } from '@oclif/core';

import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderVersionList } from '../../../views/flow-versions.js';

import type { FlowVersionRow, Paginated } from '../../../../sdk/adapty/index.js';

export default class FlowsVersionsList extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'List every version of a flow, newest first, in one answer (no pages): the draft, the live '
        + 'version and the versions before them (the version history of the flow builder)';

    static override examples = [
        '<%= config.bin %> flows versions list FLOW_UUID --app APP_UUID',
        '<%= config.bin %> flows versions list FLOW_UUID --app APP_UUID --search "black friday"',
        '<%= config.bin %> flows versions list FLOW_UUID --app APP_UUID --json',
    ];

    static override flags = {
        ...appIdFlag,
        search: Flags.string({
            description: 'Keep the versions whose title has this text (any case, part of a word; an unnamed version is "Version N")',
        }),
    };

    async run(): Promise<Paginated<FlowVersionRow>> {
        const { args, flags } = await this.parse(FlowsVersionsList);
        const page = await this.adapty.flows.versions.list(flags.app, args.flow_id, { search: flags.search });
        const searched = (flags.search ?? '').trim() !== '';

        this.render(page, value => renderVersionList(value, searched));

        return page;
    }
}
