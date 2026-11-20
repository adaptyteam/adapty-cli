import { fontReferences, refreshFlowFonts } from '../../../../../sdk/adapty/index.js';
import { ApiError } from '../../../../../sdk/core/errors.js';
import { CliError, toCliError } from '../../../../errors.js';

import type { Adapty, FlowConfig, FlowFontRefresh } from '../../../../../sdk/adapty/index.js';

/** The stored config and its font copy as the app fonts are now; nothing when there is nothing to refresh. */
export type FontStep = { refresh: FlowFontRefresh; stored: FlowConfig };

const storedFonts = (config: Record<string, unknown>): unknown[] => {
    const meta = config._meta;
    const fonts = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).fonts : undefined;

    return Array.isArray(fonts) ? fonts : [];
};

/**
 * The save sends back what it read: the lock and the remote configs. Without them it would be a
 * last-write-wins save that drops somebody's change, so a read without them stops before any write.
 */
const requireLock = (stored: FlowConfig): void => {
    const missing = [
        ...(Number.isInteger(stored.updated_at) ? [] : ['updated_at']),
        ...(Array.isArray(stored.remote_configs) ? [] : ['remote_configs']),
    ];

    if (missing.length > 0) {
        throw new ApiError({
            code: 'malformed_response',
            details: stored,
            message: `The flow config answer has no ${missing.join(', ')}, which the save of the fonts needs `
                + 'to keep changes made after the read. Nothing was written and nothing was published.',
            status: 200,
        });
    }
};

/**
 * Reads what the publish needs to refresh the font copy, before anything is written: a failed read of the
 * font list stops the command with its own exit code. A flow with no config yet has nothing to refresh. A
 * config that names no custom font reads no font list: its copy is refreshed against no family, so an
 * entry left from a removed font is cleared and a config with no entries is not written.
 */
export const readFontStep = async (adapty: Adapty, appId: string, flowId: string): Promise<FontStep | undefined> => {
    const stored = await adapty.flows.config.get(appId, flowId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
            return undefined;
        }

        throw error;
    });

    // An answer without a config object has nothing to refresh either: the publish decides on it
    if (stored === undefined || typeof stored.config !== 'object' || (stored.config as unknown) === null) {
        return undefined;
    }

    const named = fontReferences(stored.config).length > 0;

    if (!named && storedFonts(stored.config).length === 0) {
        return undefined;
    }

    const families = named ? (await adapty.fonts.list(appId)).data : [];
    const refresh = refreshFlowFonts(stored.config, families);

    if (refresh.changed) {
        requireLock(stored);
    }

    return { refresh, stored };
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
