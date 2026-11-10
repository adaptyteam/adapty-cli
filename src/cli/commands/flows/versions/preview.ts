import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { flowVersionIdArg } from '../../../input/flow-versions.js';

import type { FlowVersionPreview } from '../../../../sdk/adapty/index.js';

export default class FlowsVersionsPreview extends AdaptyCommand {
    static override args = { ...flowIdArg, ...flowVersionIdArg };
    static override description = 'Print the link that opens one version of a flow on a test device, in the Adapty app '
        + '(the "Test on device" link of the dashboard). Any version: the draft, the live version or an earlier one';

    static override examples = [
        '<%= config.bin %> flows versions preview FLOW_UUID VERSION_UUID --app APP_UUID',
    ];

    static override flags = {
        ...appIdFlag,
    };

    async run(): Promise<FlowVersionPreview> {
        const { args, flags } = await this.parse(FlowsVersionsPreview);
        const preview = await this.adapty.flows.versions.preview(flags.app, args.flow_id, args.version_id);

        this.render(preview, value => value.preview_url);

        return preview;
    }
}
