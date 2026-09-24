import open from 'open';

import { isHttps } from './https.js';

type BrowserFlags = { 'no-browser': boolean; 'open': boolean };

/** Piped and JSON output require --open to launch a browser. */
export const openLink = async (href: string, flags: BrowserFlags, interactive: boolean): Promise<void> => {
    const wanted = flags.open || interactive;
    const allowed = !flags['no-browser'] && process.env.BROWSER !== 'none' && isHttps(href);

    if (!wanted || !allowed) {
        return;
    }

    await open(href).catch(() => undefined);
};
