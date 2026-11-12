import { Flags } from '@oclif/core';

import { AdaptyCommand, flowIdArg } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { uuidParser } from '../../input/uuid.js';
import { duplicatedLine } from '../../views/flow-versions.js';

import type { Flow } from '../../../sdk/adapty/index.js';

export default class FlowsDuplicate extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'Copy a flow to a new flow "<name>_copy" with one unpublished draft: the content of '
        + '--version, else of the current version (the draft, else the live one). The source flow does not change';

    static override examples = [
        '<%= config.bin %> flows duplicate FLOW_UUID --app APP_UUID',
        '<%= config.bin %> flows duplicate FLOW_UUID --app APP_UUID --version VERSION_UUID',
    ];

    static override flags = {
        ...appIdFlag,
        version: Flags.string({
            description: 'The version to copy (UUID), as `flows versions list` shows it; the current version when omitted',
            parse: uuidParser('Invalid flow version ID format. Run `adapty flows versions list FLOW_ID --app <app>` to find it.'),
        }),
    };

    async run(): Promise<Flow> {
        const { args, flags } = await this.parse(FlowsDuplicate);
        const flow = await this.adapty.flows.duplicate(flags.app, args.flow_id, flags.version);

        this.render(flow, duplicatedLine);

        return flow;
    }
}
