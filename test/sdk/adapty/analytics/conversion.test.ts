import { expect } from 'chai';

import { toConversionRequest } from '../../../../src/sdk/adapty/analytics/conversion.js';
import { validateConversion } from '../../../../src/sdk/adapty/analytics/index.js';

import { paths, quarter } from './fixtures.js';

import type { ConversionInput } from '../../../../src/sdk/adapty/analytics/index.js';

const conversion: ConversionInput = { ...quarter, conversionId: 'trial-paid' };

describe('validateConversion', () => {
    const cases: { expected: string[]; input: ConversionInput; name: string }[] = [
        { expected: [], input: conversion, name: 'trial to paid over a quarter' },
        { expected: [], input: { ...conversion, compareFrom: '2026-04-01', compareTo: '2026-06-30' }, name: 'a compared period' },
        { expected: ['compareFrom'], input: { ...conversion, compareTo: '2026-06-30' }, name: 'a compared period without its start' },
        { expected: ['compareFrom'], input: { ...conversion, compareFrom: '2026-13-01', compareTo: '2026-06-30' }, name: 'a compared start that is no day' },
        { expected: ['dateFrom'], input: { ...conversion, dateFrom: '01.07.2026' }, name: 'a start not in YYYY-MM-DD form' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateConversion(input))).to.deep.equal(expected);
        });
    }
});

describe('toConversionRequest', () => {
    it('sends the conversion id as it is, never another pair', () => {
        expect(toConversionRequest({ ...conversion, conversionId: 'paid-2year', granularity: 'month', groupBy: 'country' })).to.deep.equal({
            conversion_id: 'paid-2year',
            filters: { date: ['2026-07-01', '2026-09-30'] },
            period_unit: 'month',
            segmentation: 'country',
        });
    });
});
