import { Writable } from 'node:stream';

import { expect } from 'chai';

import { flagPassed, streamToStdout, writeJsonToStderr } from '../../../src/cli/output/file-to-stdout.js';

/** A writer that keeps what it got, chunk by chunk, and is full after every write until it drains. */
const slowSink = () => {
    const chunks: unknown[] = [];

    const sink = new Writable({
        highWaterMark: 1,
        write(chunk: unknown, _encoding, callback) {
            chunks.push(chunk);
            setImmediate(callback);
        },
    });

    return { chunks, sink };
};

async function* parts(...values: Uint8Array[]): AsyncGenerator<Uint8Array> {
    for (const value of values) {
        await Promise.resolve();
        yield value;
    }
}

describe('cli/output: file to stdout', () => {
    describe('flagPassed', () => {
        it('finds a flag passed with a separate value or with =', () => {
            expect(flagPassed(['--app', 'x', '--output', 'a.json'], 'output')).to.equal(true);
            expect(flagPassed(['--output=a.json'], 'output')).to.equal(true);
        });

        it('does not take another flag that starts with the same letters, or a value that looks like it', () => {
            expect(flagPassed(['--outputs', 'x'], 'output')).to.equal(false);
            expect(flagPassed(['--app', 'output'], 'output')).to.equal(false);
            expect(flagPassed([], 'output')).to.equal(false);
        });
    });

    describe('streamToStdout', () => {
        it('writes every byte unchanged and in order, as Buffers, waiting for the sink to drain', async () => {
            const { chunks, sink } = slowSink();
            // "é" is split across two chunks: the bytes must arrive as they are, not as decoded text
            const bytes = Buffer.from('{"price": 17.0, "name": "é"}', 'utf8');
            const split = bytes.indexOf(0xC3) + 1;

            await streamToStdout(parts(bytes.subarray(0, split), bytes.subarray(split)), sink);

            expect(chunks.every(chunk => Buffer.isBuffer(chunk))).to.equal(true);
            expect(Buffer.concat(chunks as Buffer[]).equals(bytes)).to.equal(true);
        });

        it('passes a failure of the source on, after what was already written', async () => {
            const { chunks, sink } = slowSink();
            const failure = new Error('connection dropped');

            async function* breaking(): AsyncGenerator<Uint8Array> {
                yield await Promise.resolve(Buffer.from('{"half": '));
                throw failure;
            }

            const error = await streamToStdout(breaking(), sink).then(() => undefined, (reason: unknown) => reason);

            expect(error).to.equal(failure);
            expect(Buffer.concat(chunks as Buffer[]).toString('utf8')).to.equal('{"half": ');
        });
    });

    describe('writeJsonToStderr', () => {
        it('prints the object pretty, as oclif does, with a final newline', () => {
            const { chunks, sink } = slowSink();

            writeJsonToStderr({ error: { code: 'not_found', message: 'Not found' } }, sink);

            expect(String(chunks[0])).to.equal('{\n  "error": {\n    "code": "not_found",\n    "message": "Not found"\n  }\n}\n');
        });
    });
});
