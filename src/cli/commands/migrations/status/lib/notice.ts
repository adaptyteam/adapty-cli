import type { Envelope, Progress } from '../../../../../sdk/adapty/index.js';

const workDone = (progress: Progress): string => {
    const done = progress.total === null ? String(progress.done) : `${progress.done} of ${progress.total}`;

    return `${done} ${progress.unit}`;
};

/** Format a progress line for stderr, including when progress or its total is unknown. */
export const pollNotice = (envelope: Envelope, delayMs: number): string => {
    const { progress, state } = envelope.migration;
    const work = progress === null ? state : `${state}  ${workDone(progress)}`;

    return `${work} — checking again in ${Math.round(delayMs / 1000)}s`;
};
