import { PassThrough } from 'node:stream';

import { expect } from 'chai';

import { exitCode } from '../../../src/cli/errors.js';
import { confirmAction } from '../../../src/cli/input/confirm.js';
import { rejection } from '../../helpers/rejection.js';

import type { CliError } from '../../../src/cli/errors.js';

const EFFECT = 'Start A/B test "T". You cannot undo a start.';

type Terminal = { input: PassThrough; output: PassThrough; written: () => string };

/** A person at a terminal: both streams say so, and the test types for them. */
const terminal = (isTTY = true, outputIsTTY = false): Terminal => {
    const input = Object.assign(new PassThrough(), { isTTY });
    const output = Object.assign(new PassThrough(), { isTTY: outputIsTTY });
    const chunks: string[] = [];

    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    return { input, output, written: () => chunks.join('') };
};

const confirm = (
    options: { interactive?: boolean; yes?: boolean },
    streams: Terminal,
    signal = new AbortController().signal,
) =>
    confirmAction({
        effect: EFFECT,
        interactive: options.interactive ?? true,
        signal,
        streams,
        yes: options.yes ?? false,
    });

describe('confirmAction', () => {
    it('goes on with --yes, and asks nothing', async () => {
        const streams = terminal();

        await confirm({ yes: true }, streams);

        expect(streams.written()).to.equal('');
    });

    for (const [name, options, isTTY] of [
        ['--json or a pipe on stdout', { interactive: false }, true],
        ['stdin that is not a terminal', { interactive: true }, false],
    ] as const) {
        it(`refuses with exit 6 and the effect when nobody can answer: ${name}`, async () => {
            const error = await rejection(confirm(options, terminal(isTTY))) as CliError;

            expect(error.exitCode).to.equal(exitCode.confirmRequired);
            expect(error.json.code).to.equal('confirm_required');
            expect(error.message).to.equal(`${EFFECT}\n\nRe-run with --yes to do it.`);
        });
    }

    for (const answer of ['y', 'yes', ' YES ']) {
        it(`shows the effect and goes on after "${answer}"`, async () => {
            const streams = terminal();
            const done = confirm({}, streams);

            streams.input.write(`${answer}\n`);
            await done;

            expect(streams.written()).to.contain(EFFECT).and.to.contain('Apply? [y/N]');
        });
    }

    for (const answer of ['n', 'no', '', 'maybe']) {
        it(`stops with exit 1 after "${answer}", and says nothing was sent`, async () => {
            const streams = terminal();
            const done = rejection(confirm({}, streams));

            streams.input.write(`${answer}\n`);

            const error = await done as CliError;

            expect(error.exitCode).to.equal(1);
            expect(error.message).to.equal('Cancelled, nothing was sent.');
        });
    }

    it('exits 130 on Ctrl+C', async () => {
        // readline reads the key as an interrupt only when the output is a terminal too
        const streams = terminal(true, true);
        const done = rejection(confirm({}, streams));

        streams.input.write('\u0003');

        expect(((await done) as CliError).exitCode).to.equal(exitCode.cancelled);
    });

    it('exits 130 when the command is aborted while it waits', async () => {
        const streams = terminal();
        const abort = new AbortController();
        const done = rejection(confirm({}, streams, abort.signal));

        abort.abort();

        expect(((await done) as CliError).exitCode).to.equal(exitCode.cancelled);
    });

    it('exits 1 when the input ends with no answer', async () => {
        const streams = terminal();
        const done = rejection(confirm({}, streams));

        streams.input.end();

        expect(((await done) as CliError).exitCode).to.equal(1);
    });
});
