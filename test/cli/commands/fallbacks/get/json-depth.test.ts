import { expect } from 'chai';

import { createDepthScanner } from '../../../../../src/cli/commands/fallbacks/get/lib/json-depth.js';

const encoder = new TextEncoder();

/** The first reason the scanner gives for the body cut into `parts`, at a push or at the end. */
const scan = (...parts: string[]): string | undefined => {
    const scanner = createDepthScanner();

    for (const part of parts) {
        const reason = scanner.push(encoder.encode(part));

        if (reason !== undefined) {
            return reason;
        }
    }

    return scanner.end();
};

/** Every split of `text` into two chunks, so each border falls once on every byte. */
const splits = (text: string): [string, string][] =>
    Array.from({ length: text.length + 1 }, (_, index) => [text.slice(0, index), text.slice(index)]);

describe('fallbacks get: createDepthScanner', () => {
    const whole = '  {"a": [1, {"b": "x}]\\"{"}], "c": "\\\\", "d": {}}\n';

    it('takes a whole object, with any chunk border, brackets and escaped quotes inside strings', () => {
        for (const [head, tail] of splits(whole)) {
            expect(scan(head, tail), JSON.stringify([head, tail])).to.equal(undefined);
        }
    });

    it('refuses a body cut after an inner }', () => {
        const file = '{"meta": {"version": 11}, "data": {"p": {"x": 1}}}';

        for (const cut of [file.indexOf('}') + 1, file.lastIndexOf('}')]) {
            expect(scan(file.slice(0, cut))).to.equal('the body ends before its closing }');
        }
    });

    it('does not count a } inside a string, even split from its escape', () => {
        // The string holds `\"}`: the quote is escaped, so the string is still open at `}`
        expect(scan('{"a": "\\', '"}')).to.equal('the body ends before its closing }');
        expect(scan('{"a": "}"')).to.equal('the body ends before its closing }');
    });

    it('takes an escaped backslash before the closing quote of a string', () => {
        expect(scan('{"a": "\\\\', '"}')).to.equal(undefined);
    });

    it('refuses a body that does not start with {, or has more after the closing }', () => {
        expect(scan('  <html>')).to.equal('the body does not start with {');
        expect(scan('[{}]')).to.equal('the body does not start with {');
        expect(scan('{}', ' {}')).to.equal('the body has more after the closing }');
        expect(scan('{]')).to.equal('the top-level object ends with ]');
    });

    it('refuses an empty or whitespace-only body', () => {
        expect(scan()).to.equal('the body is empty');
        expect(scan(' \n', '\t')).to.equal('the body is empty');
    });
});
