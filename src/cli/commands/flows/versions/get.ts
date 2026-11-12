import { access, writeFile } from 'node:fs/promises';

import { Flags } from '@oclif/core';

import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { CliError, errorCode } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { flowVersionIdArg } from '../../../input/flow-versions.js';
import { renderVersion } from '../../../views/flow-versions.js';

import type { FlowVersionDetail } from '../../../../sdk/adapty/index.js';

const exists = async (path: string): Promise<boolean> => {
    try {
        await access(path);

        return true;
    } catch {
        return false;
    }
};

export default class FlowsVersionsGet extends AdaptyCommand {
    static override args = { ...flowIdArg, ...flowVersionIdArg };
    static override description = 'Show one version of a flow with all its content: the configs, every layout, the remote '
        + 'configs and the paywalls. Nothing changes: the draft and the live version stay as they are';

    static override examples = [
        '<%= config.bin %> flows versions get FLOW_UUID VERSION_UUID --app APP_UUID',
        '<%= config.bin %> flows versions get FLOW_UUID VERSION_UUID --app APP_UUID --output version.json',
        '<%= config.bin %> flows versions get FLOW_UUID VERSION_UUID --app APP_UUID --json',
    ];

    static override flags = {
        ...appIdFlag,
        output: Flags.string({
            description: 'Write the version as JSON to this file; an existing file is replaced only after a yes',
        }),
        ...yesFlag,
    };

    async run(): Promise<FlowVersionDetail> {
        const { args, flags } = await this.parse(FlowsVersionsGet);
        const version = await this.adapty.flows.versions.get(flags.app, args.flow_id, args.version_id);

        if (flags.output !== undefined) {
            await this.write(flags.output, version, flags.yes);
        }

        this.render(version, value => renderVersion(value, flags.output !== undefined));

        return version;
    }

    private async write(path: string, version: FlowVersionDetail, yes: boolean): Promise<void> {
        if (await exists(path)) {
            await confirmAction({
                effect: `Replace the file ${path} with version '${version.title}'.`,
                interactive: this.interactive,
                signal: this.signal,
                yes,
            });
        }

        try {
            await writeFile(path, `${JSON.stringify(version, null, 2)}\n`);
        } catch (error) {
            // The errno says why (a missing folder, no permission, a full disk); the foreign message stays out
            throw new CliError(`Could not write ${path} (${errorCode(error) ?? 'unknown error'}).`, 1, 'write_failed', {
                cause: error,
            });
        }

        if (!this.jsonEnabled()) {
            this.log(`Wrote version '${version.title}' to ${path}.`);
        }
    }
}
