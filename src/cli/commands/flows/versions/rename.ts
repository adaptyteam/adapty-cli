import { Flags } from '@oclif/core';

import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { flowVersionIdArg } from '../../../input/flow-versions.js';
import { renamedLine } from '../../../views/flow-versions.js';

import type { FlowVersionRow } from '../../../../sdk/adapty/index.js';

export default class FlowsVersionsRename extends AdaptyCommand {
    static override args = { ...flowIdArg, ...flowVersionIdArg };
    static override description = 'Name a version of a flow (the draft, the live version or an earlier one); '
        + 'an empty name gives it its "Version N" title again. The content does not change';

    static override examples = [
        '<%= config.bin %> flows versions rename FLOW_UUID VERSION_UUID --app APP_UUID --name "Black Friday"',
        '<%= config.bin %> flows versions rename FLOW_UUID VERSION_UUID --app APP_UUID --name ""',
    ];

    static override flags = {
        ...appIdFlag,
        name: Flags.string({
            description: 'The new name; "" (or spaces only) removes the name',
            required: true,
        }),
    };

    async run(): Promise<FlowVersionRow> {
        const { args, flags } = await this.parse(FlowsVersionsRename);
        const row = await this.adapty.flows.versions.rename(flags.app, args.flow_id, args.version_id, flags.name);

        this.render(row, renamedLine);

        return row;
    }
}
