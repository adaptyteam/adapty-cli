import { expect } from 'chai';

import { parseSegmentFilter } from '../../../src/cli/input/segment.js';

describe('parseSegmentFilter', () => {
    it('splits field, operator and comma-separated values', () => {
        expect(parseSegmentFilter('campaign:IN:2144520245, 2144520246')).to.deep.equal({
            field_name: 'campaign',
            operator: 'IN',
            value_list: ['2144520245', '2144520246'],
        });
    });

    it('keeps colons inside values', () => {
        expect(parseSegmentFilter('custom_attr:IN:a:b')).to.deep.equal({
            field_name: 'custom_attr',
            operator: 'IN',
            value_list: ['a:b'],
        });
    });

    it('refuses a filter without an operator or without values', () => {
        expect(() => parseSegmentFilter('campaign:2144520245')).to.throw(/field:OPERATOR:value/);
        expect(() => parseSegmentFilter('campaign:IN:')).to.throw(/at least one value/);
        expect(() => parseSegmentFilter(':IN:1')).to.throw(/field:OPERATOR:value/);
    });

    it('takes an existence operator without values and refuses values after it', () => {
        expect(parseSegmentFilter('customer_user_id:IS NOT NULL')).to.deep.equal({
            field_name: 'customer_user_id',
            operator: 'IS NOT NULL',
            value_list: [],
        });

        expect(parseSegmentFilter('subscription_expiration_date:IS NULL:')).to.deep.equal({
            field_name: 'subscription_expiration_date',
            operator: 'IS NULL',
            value_list: [],
        });

        expect(() => parseSegmentFilter('customer_user_id:IS NULL:x')).to.throw(/takes no values/);
    });

    it('takes a JSON object with typed values as is', () => {
        expect(parseSegmentFilter('{"field_name": "age", "operator": ">", "value_list": [18]}')).to.deep.equal({
            field_name: 'age',
            operator: '>',
            value_list: [18],
        });
    });

    it('refuses malformed or incomplete JSON filters', () => {
        expect(() => parseSegmentFilter('{"field_name": "age"')).to.throw(/not valid JSON/);
        expect(() => parseSegmentFilter('{"field_name": "age", "operator": ">"}')).to.throw(/needs field_name, operator and value_list/);
        expect(() => parseSegmentFilter('{"field_name": "age", "operator": ">", "value_list": 18}')).to.throw(/needs field_name/);
    });
});
