import { expect } from 'chai';

import { parseCsv } from '../../../../../src/cli/commands/product-prices/set/lib/csv.js';
import { ValidationError } from '../../../../../src/sdk/core/errors.js';

const cells = (text: string): string[][] => parseCsv(text).map(row => row.cells);

const failure = (text: string): string => {
    try {
        parseCsv(text);
    } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);

        return (error as ValidationError).issues.map(issue => `${issue.path}: ${issue.message}`).join('; ');
    }

    throw new Error('parseCsv did not throw');
};

describe('parseCsv', () => {
    it('keeps a comma, a line break and a doubled quote inside a quoted field', () => {
        expect(cells('a,"b,c","d\ne","say ""hi"""\n')).to.deep.equal([['a', 'b,c', 'd\ne', 'say "hi"']]);
    });

    it('reads CRLF line ends and drops a BOM', () => {
        expect(cells('﻿a,b\r\nc,"d"\r\n')).to.deep.equal([['a', 'b'], ['c', 'd']]);
    });

    it('skips blank lines and gives each row the file line it starts on', () => {
        expect(parseCsv('a,b\n\n,\n"c\nd",e\nf,g')).to.deep.equal([
            { cells: ['a', 'b'], line: 1 },
            { cells: ['c\nd', 'e'], line: 4 },
            { cells: ['f', 'g'], line: 6 },
        ]);
    });

    it('reads a quote inside an unquoted field as a plain character', () => {
        expect(cells('Germany,9" screen,EUR\n')).to.deep.equal([['Germany', '9" screen', 'EUR']]);
    });

    it('refuses a quote that is never closed, naming the line it opens on', () => {
        expect(failure('region_code,status\nDE,"synced\nFR,pending\nIT,pending\n'))
            .to.equal('file: is not a valid CSV: a quote is not closed at line 2');
    });

    it('refuses a closing quote followed by a character other than a separator', () => {
        expect(failure('a,b\n"c"d,e\n'))
            .to.equal('file: is not a valid CSV: a closing quote is followed by a character other than a comma or a line break at line 2');
    });
});
