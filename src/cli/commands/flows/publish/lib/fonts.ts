import { fontReferences, isFontReferenceIssue, isMissingFlowConfig, refreshFlowFonts, requireWritableConfig } from '../../../../../sdk/adapty/index.js';
import { ApiError, NetworkError, ValidationError } from '../../../../../sdk/core/errors.js';
import { toFontsCliError } from '../../../../errors/fonts.js';
import { CliError, toCliError } from '../../../../errors.js';

import type { Adapty, FlowConfig, FlowFontRefresh, FontFamily } from '../../../../../sdk/adapty/index.js';

/** The stored config and its font copy as the app fonts are now; nothing when there is nothing to refresh. */
export type FontStep = { refresh: FlowFontRefresh; stored: FlowConfig };

const storedFonts = (config: Record<string, unknown>): unknown[] => {
    const meta = config._meta;
    const fonts = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).fonts : undefined;

    return Array.isArray(fonts) ? fonts : [];
};

const isMalformed = (error: unknown): boolean => error instanceof ApiError && error.code === 'malformed_response';

/**
 * The failure as the CLI says it, with what this step did: a line before the message, and a next step after
 * it (on its own line after a line before, else in the same line).
 */
const explained = (error: unknown, text: { after?: string; before?: string; detail?: string }): Error => {
    const failure = toCliError(error);

    if (!(failure instanceof CliError)) {
        return failure;
    }

    const detail = text.detail ?? failure.message;
    const head = text.before === undefined ? detail : `${text.before}\n${detail}`;
    const message = text.after === undefined ? head : `${head}${text.before === undefined ? ' ' : '\n'}${text.after}`;

    return new CliError(message, failure.exitCode, failure.code, { cause: error, json: { ...failure.json, message } });
};

const NOTHING_DONE = 'Nothing was written and nothing was published.';

/** A flow with no config version has nothing to refresh. A failed config read stops the publish. */
const readConfig = (adapty: Adapty, appId: string, flowId: string): Promise<FlowConfig | undefined> =>
    adapty.flows.config.get(appId, flowId).catch((error: unknown) => {
        if (isMissingFlowConfig(error)) {
            return undefined;
        }

        throw isMalformed(error) ? explained(error, { after: NOTHING_DONE }) : error;
    });

/**
 * The save sends back what it read: the lock and the remote configs. Without them it would be a
 * last-write-wins save that drops somebody's change, so a read without them stops before any write.
 */
const requireLock = (stored: FlowConfig): void => {
    try {
        requireWritableConfig(stored);
    } catch (error) {
        throw explained(error, { after: `The save of the fonts needs it to keep the remote configs. ${NOTHING_DONE}` });
    }
};

/** The refresh of the copy; a reference it cannot match stops the publish, with the way out and what was done. */
const refreshed = (stored: FlowConfig, families: FontFamily[]): FlowFontRefresh => {
    try {
        return refreshFlowFonts(stored.config, families);
    } catch (error) {
        if (!(error instanceof ValidationError)) {
            throw error;
        }

        throw new ValidationError(error.issues.map((issue) => {
            const wayOut = isFontReferenceIssue(issue) && issue.reason === 'ambiguous_name'
                ? ' Rename one of them, or name the family by its id in the flow.'
                : '';

            return { ...issue, message: `${issue.message}${wayOut} Nothing was saved or published.` };
        }));
    }
};

/**
 * Reads what the publish needs to refresh the font copy, before anything is written: a failed read of the
 * font list stops the command with its own exit code. A flow with no config yet has nothing to refresh. A
 * config that names no custom font reads no font list: its copy is refreshed against no family, so an
 * entry left from a removed font is cleared and a config with no entries is not written.
 */
export const readFontStep = async (adapty: Adapty, appId: string, flowId: string): Promise<FontStep | undefined> => {
    const stored = await readConfig(adapty, appId, flowId);

    if (stored === undefined) {
        return undefined;
    }

    const named = fontReferences(stored.config).length > 0;

    if (!named && storedFonts(stored.config).length === 0) {
        return undefined;
    }

    const families = named
        ? (await adapty.fonts.list(appId).catch((error: unknown) => {
                throw toFontsCliError(error);
            })).data
        : [];

    const refresh = refreshed(stored, families);

    if (refresh.changed) {
        requireLock(stored);
    }

    return { refresh, stored };
};

/** The save keeps the stored remote configs and fails when the flow changed after the read. */
type FlowRef = { appId: string; flowId: string };

/** An answer the CLI cannot read may follow a save that went through. */
const unknownSave = (ids: FlowRef) => ({
    after: `Run \`adapty flows config get --app ${ids.appId} ${ids.flowId}\` to see the stored config, `
        + `then run \`adapty flows publish --app ${ids.appId} ${ids.flowId}\` again.`,
    before: 'Nothing was published: the answer to the save of the flow config with the current fonts could not be read, '
        + 'so it is not known whether the save went through.',
});

export const saveFonts = async (adapty: Adapty, ids: FlowRef, step: FontStep): Promise<void> => {
    try {
        await adapty.flows.config.update(ids.appId, ids.flowId, {
            config: step.refresh.config,
            expectedUpdatedAt: step.stored.updated_at,
            remoteConfigs: step.stored.remote_configs,
        });
    } catch (error) {
        if (error instanceof NetworkError) {
            throw explained(error, { ...unknownSave(ids), detail: 'The connection failed before a complete answer arrived.' });
        }

        throw explained(error, isMalformed(error) ? unknownSave(ids) : { before: 'Nothing was published: the save of the flow config with the current fonts failed.' });
    }
};
