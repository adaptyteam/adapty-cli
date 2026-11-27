import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Hook } from '@oclif/core';

export const OPT_OUT_ENV_VAR = 'ADAPTY_NO_AUTOPILOT_NOTICE';

/** The one line to change when the beta opens to everyone or the way to join changes. */
export const JOIN_LINE = 'To join the beta, write to your Adapty manager.';

const AUTOPILOT_TOPICS = ['asa:budget-autopilot:', 'asa:keyword-autopilot:'];
const NOTICE_FILE = 'autopilot-notice.json';

const BOLD = '\u001B[1m';
const RESET = '\u001B[0m';

const isOptedOut = (value: string | undefined): boolean => value !== undefined && !['', '0', 'false'].includes(value);

const isCoveredCommand = (id: string): boolean =>
    id.startsWith('asa:') && !AUTOPILOT_TOPICS.some(topic => `${id}:`.startsWith(topic));

const today = (): string => {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const readLastShown = async (path: string): Promise<string | undefined> => {
    try {
        const state = JSON.parse(await readFile(path, 'utf8')) as { last_shown?: string };

        return state.last_shown;
    } catch {
        return undefined;
    }
};

const buildNotice = (colored: boolean): string => {
    const headline
        = 'Autopilot for Apple Ads is in beta: it steers keyword bids toward your target cost per paying user '
            + 'and moves budget between campaigns, starting in Preview.';

    return [
        '',
        colored ? `${BOLD}${headline}${RESET}` : headline,
        'Try it: adapty asa budget-autopilot status · adapty asa keyword-autopilot --help',
        JOIN_LINE,
        `Hide this notice: ${OPT_OUT_ENV_VAR}=1`,
        '',
    ].join('\n');
};

/** Runs after a command has succeeded, never after an error or `--help`. Always writes to stderr. */
const hook: Hook<'postrun'> = async function ({ Command }) {
    if (!isCoveredCommand(Command.id) || isOptedOut(process.env[OPT_OUT_ENV_VAR])) {
        return;
    }

    const path = join(this.config.configDir, NOTICE_FILE);
    const day = today();

    if ((await readLastShown(path)) === day) {
        return;
    }

    const colored = process.stderr.isTTY && !process.env.NO_COLOR;
    process.stderr.write(`${buildNotice(colored)}\n`);

    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify({ last_shown: day }) + '\n', 'utf8');
    } catch {
        // A read-only config dir must not fail a command that already succeeded
    }
};

export default hook;
