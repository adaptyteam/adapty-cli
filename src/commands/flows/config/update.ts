import { Args, Command, Flags } from '@oclif/core';

import { usageError } from '../../../cli/errors.js';
import { appIdFlag } from '../../../cli/input/app.js';
import { parseJson, readBodyFile, readJsonFile } from '../../../cli/input/json.js';
import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { FlowConfigDTO, FlowConfigWriteRequestDTO, FlowRemoteConfigDTO } from '../../../lib/api-schemas.js';

const KEEP_REMOTE_CONFIGS_HINT
    = 'To keep the stored remote configs, pass `remote_configs` from `flows config get --json`; [] deletes them all.';

export default class FlowsConfigUpdate extends Command {
    static override args = {
        flow_id: Args.string({ description: 'Flow ID (UUID)', required: true }),
    };

    static override description
        = 'Write the flow builder config and its remote configs (creates the first version, or edits/forks the current one). '
            + 'Both are required, and a write replaces the whole remote config list: to keep it, send the stored one back; [] deletes all. '
            + 'Send the output of `flows config get --json` with --file, or give --config (or --config-file) and --remote-configs.';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> flows config get --app UUID FLOW_UUID --json > flow.json',
        '<%= config.bin %> flows config update --app UUID FLOW_UUID --file flow.json',
        '<%= config.bin %> flows config update --app UUID FLOW_UUID --config-file config.json --remote-configs "$(jq -c .remote_configs flow.json)" --expected-updated-at "$(jq .updated_at flow.json)"',
        '<%= config.bin %> flows config update --app UUID NEW_FLOW_UUID --config-file config.json --remote-configs \'[]\'',
    ];

    static override flags = {
        ...appIdFlag,
        'config': Flags.string({
            description: 'Builder config as a JSON string',
            exclusive: ['config-file', 'file'],
        }),
        'config-file': Flags.string({
            description: 'JSON file with the builder config, or - to read stdin',
            exclusive: ['config', 'file'],
        }),
        'expected-updated-at': Flags.integer({
            description: 'Optimistic lock: the `updated_at` from a prior config read. Omit for last-write-wins.',
        }),
        'file': Flags.string({
            description: 'JSON file with `config` and `remote_configs` (the output of `flows config get --json`), or - to read stdin. Other keys are ignored.',
            exclusive: ['config', 'config-file', 'remote-configs'],
        }),
        'remote-configs': Flags.string({
            description: 'JSON array of remote config entries: [{locale, data}]. Replaces the stored list: pass `remote_configs` from `flows config get --json` to keep it; [] deletes all.',
        }),
    };

    async run(): Promise<FlowConfigDTO> {
        const { args, flags } = await this.parse(FlowsConfigUpdate);

        if (!isValidUuid(args.flow_id)) {
            this.error('Invalid flow ID format.', { exit: 2 });
        }

        const body = await this.readBody(flags);

        if (flags['expected-updated-at'] !== undefined) {
            body.expected_updated_at = flags['expected-updated-at'];
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.put<FlowConfigDTO>(`/apps/${flags.app}/flows/${args.flow_id}/config`, body);

        this.log('Flow config saved!');
        printResponse(result, this.log.bind(this));

        return result;
    }

    private async readBody(flags: {
        'config'?: string | undefined;
        'config-file'?: string | undefined;
        'file'?: string | undefined;
        'remote-configs'?: string | undefined;
    }): Promise<FlowConfigWriteRequestDTO> {
        if (flags.file !== undefined) {
            const envelope = await readBodyFile(flags.file);
            const absent = ['config', 'remote_configs'].filter(key => !(key in envelope));

            if (absent.length > 0) {
                throw usageError(
                    `Missing keys in ${flags.file}: ${absent.join(', ')}. The file needs both config and remote_configs.`
                    + (absent.includes('remote_configs') ? ` ${KEEP_REMOTE_CONFIGS_HINT}` : ''),
                );
            }

            return {
                config: envelope.config as Record<string, unknown>,
                remote_configs: envelope.remote_configs as FlowRemoteConfigDTO[],
            };
        }

        const config = await this.readConfig(flags);
        const remoteConfigs = flags['remote-configs'];

        const missing = [
            ...(config === undefined ? ['--config or --config-file'] : []),
            ...(remoteConfigs === undefined ? ['--remote-configs'] : []),
        ];

        if (config === undefined || remoteConfigs === undefined) {
            throw usageError(
                `Missing flags: ${missing.join(', ')}. Give both, or send the whole body with --file PATH|-.`
                + (remoteConfigs === undefined ? ` ${KEEP_REMOTE_CONFIGS_HINT}` : ''),
            );
        }

        return {
            config: config as Record<string, unknown>,
            remote_configs: parseJson(remoteConfigs, '--remote-configs') as FlowRemoteConfigDTO[],
        };
    }

    /** The config the flags gave, or undefined when neither flag was given. */
    private async readConfig(flags: { 'config'?: string | undefined; 'config-file'?: string | undefined }): Promise<unknown> {
        if (flags.config !== undefined) {
            return parseJson(flags.config, '--config');
        }

        return flags['config-file'] === undefined ? undefined : readJsonFile(flags['config-file']);
    }
}
