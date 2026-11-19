import { fontReferences, refreshFlowFonts } from '../../../../../sdk/adapty/index.js';
import { ApiError } from '../../../../../sdk/core/errors.js';
import { CliError, toCliError } from '../../../../errors.js';

import type { Adapty, FlowConfig, FlowFontRefresh } from '../../../../../sdk/adapty/index.js';

/** The stored config and its font copy as the app fonts are now; nothing when the flow names no custom font. */
export type FontStep = { refresh: FlowFontRefresh; stored: FlowConfig };

/**
 * Reads what the publish needs to refresh the font copy, before anything is written: a failed read of the
 * font list stops the command with its own exit code. A flow with no config yet, or with no custom font,
 * has nothing to refresh and does not read the font list.
 */
export const readFontStep = async (adapty: Adapty, appId: string, flowId: string): Promise<FontStep | undefined> => {
    const stored = await adapty.flows.config.get(appId, flowId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
            return undefined;
        }

        throw error;
    });

    // An answer without a config object has nothing to refresh either: the publish decides on it
    if (stored === undefined || typeof stored.config !== 'object' || fontReferences(stored.config).length === 0) {
        return undefined;
    }

    const { data } = await adapty.fonts.list(appId);

    return { refresh: refreshFlowFonts(stored.config, data), stored };
};

/** The save keeps the stored remote configs and fails when the flow changed after the read. */
type FlowRef = { appId: string; flowId: string };

export const saveFonts = async (adapty: Adapty, ids: FlowRef, step: FontStep): Promise<void> => {
    try {
        await adapty.flows.config.update(ids.appId, ids.flowId, {
            config: step.refresh.config,
            expectedUpdatedAt: step.stored.updated_at,
            remoteConfigs: step.stored.remote_configs,
        });
    } catch (error) {
        const failure = toCliError(error);

        if (!(failure instanceof CliError)) {
            throw failure;
        }

        const message = `Nothing was published: the save of the flow config with the current fonts failed.\n${failure.message}`;

        const json = { ...failure.json, message };

        throw new CliError(message, failure.exitCode, failure.code, { cause: error, json });
    }
};
