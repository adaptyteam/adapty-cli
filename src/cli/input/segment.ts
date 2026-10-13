import { Flags } from '@oclif/core';

import { usageError } from '../errors.js';

/** One filter of a segment body, as the developer API takes it. */
export type SegmentFilterInput = {
    field_name: string;
    operator: string;
    value_list: unknown[];
};

const FILTER_USAGE
    = 'Filters are written as field:OPERATOR:value[,value...] (e.g. campaign:IN:2144520245), as field:IS NULL, '
        + 'or as one JSON object {"field_name": ..., "operator": ..., "value_list": [...]}.';

const EXISTENCE_OPERATORS = new Set(['IS NOT NULL', 'IS NULL']);

function parseJsonSegmentFilter(raw: string): SegmentFilterInput {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw usageError(`The filter is not valid JSON. ${FILTER_USAGE}`);
    }

    const { field_name: fieldName, operator, value_list: valueList } = (parsed ?? {}) as Record<string, unknown>;

    if (typeof fieldName !== 'string' || typeof operator !== 'string' || !Array.isArray(valueList)) {
        throw usageError(`A JSON filter needs field_name, operator and value_list. ${FILTER_USAGE}`);
    }

    return { field_name: fieldName, operator, value_list: valueList };
}

/**
 * Values stay strings on the short form: the server turns them into numbers for numeric fields. The JSON form is
 * for typed or nested values the short form cannot express.
 */
export function parseSegmentFilter(input: string): SegmentFilterInput {
    const trimmed = input.trim();

    if (trimmed.startsWith('{')) {
        return parseJsonSegmentFilter(trimmed);
    }

    const [fieldName, rawOperator, ...rest] = trimmed.split(':');
    const operator = rawOperator?.trim() ?? '';

    if (!fieldName || !operator) {
        throw usageError(FILTER_USAGE);
    }

    const valueList = rest.join(':').split(',').map(value => value.trim()).filter(value => value !== '');

    if (EXISTENCE_OPERATORS.has(operator)) {
        if (valueList.length > 0) {
            throw usageError(`${operator} takes no values. ${FILTER_USAGE}`);
        }

        return { field_name: fieldName, operator, value_list: [] };
    }

    if (valueList.length === 0) {
        throw usageError(`A filter needs at least one value. ${FILTER_USAGE}`);
    }

    return { field_name: fieldName, operator, value_list: valueList };
}

/** Spread into a write command: `static flags = { ...appIdFlag, ...segmentWriteFlags }`. */
export const segmentWriteFlags = {
    description: Flags.string({ description: 'Segment description' }),
    filter: Flags.string({
        description: 'Filter as field:OPERATOR:value[,value...] (e.g. campaign:IN:2144520245), field:IS NULL, or a JSON '
            + 'object {"field_name","operator","value_list"}; repeatable',
        multiple: true,
        // oclif keeps a string flag a string: the parsed filter travels as JSON and segmentFilters unpacks it
        parse: (input: string) => Promise.resolve(JSON.stringify(parseSegmentFilter(input))),
        required: true,
    }),
    title: Flags.string({ description: 'Segment title', required: true }),
};

export function segmentFilters(flags: { filter?: string[] | undefined }): SegmentFilterInput[] {
    return (flags.filter ?? []).map(raw => JSON.parse(raw) as SegmentFilterInput);
}
