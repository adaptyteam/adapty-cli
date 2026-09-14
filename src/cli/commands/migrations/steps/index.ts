import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../flags.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Steps extends AdaptyCommand {
    static override description = 'Show the migration checklist: done, current and locked steps';

    static override examples = [
        '<%= config.bin %> migrations steps',
        '<%= config.bin %> migrations steps -m mig_7x2',
    ];

    static override flags = { ...migrationFlags };

    async run(): Promise<Envelope> {
        await this.parse(Steps);

        // TODO: resolve the migration id, GET the envelope and render steps[] as a checklist.
        throw new Error('`adapty migrations steps` is not implemented yet');
    }
}
