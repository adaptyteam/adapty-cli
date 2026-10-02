import type { Envelope } from './model.js';

const MIN_POLL_SECONDS = 5;

export const DEFAULT_TIMEOUT_MS = 120_000;

/** Use the server's delay, with a five-second minimum to avoid rapid polling. */
export const pollDelayMs = (envelope: Envelope): number =>
    Math.max(envelope.migration.poll_after_seconds, MIN_POLL_SECONDS) * 1000;

/** Unknown states also end the wait. */
export const hasMoved = (envelope: Envelope, baselineRevision: number): boolean => {
    const { revision, state } = envelope.migration;

    return revision !== baselineRevision || state !== 'running';
};
