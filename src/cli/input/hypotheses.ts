import { Args, Flags } from '@oclif/core';

import { hypothesisOrders, hypothesisPhases, hypothesisResults, hypothesisStates } from '../../sdk/adapty/index.js';
import { usageError } from '../errors.js';

import { readJsonFile } from './json.js';
import { uuidParser } from './uuid.js';

import type { HypothesisCreateBody, ListHypothesesParams, ProductFill } from '../../sdk/adapty/index.js';

const idParser = (what: string, whereToLook: string) => uuidParser(`Invalid ${what} ID format. ${whereToLook}`);

const hypothesisParser = idParser('hypothesis', 'Run `adapty hypotheses list --app <app>` to find it.');
const placementParser = idParser('placement', 'Run `adapty placements list --app <app>` to find it.');
const segmentParser = idParser('segment', 'Run `adapty segments list --app <app>` to find it.');
const flowParser = idParser('flow', 'Run `adapty flows list --app <app>` to find it.');
const abTestParser = idParser('A/B test', 'Run `adapty ab-tests list --app <app>` to find it.');

/** The filters go to the server comma separated, so a value with a comma would be read as two. */
const typeParser = (input: string): Promise<string> => (input.trim() === '' || input.includes(',')
    ? Promise.reject(usageError('--type takes one namespace:name; repeat the flag for several.'))
    : Promise.resolve(input.trim()));

export const hypothesisIdArg = {
    hypothesis_id: Args.string({
        description: 'Hypothesis ID (UUID)',
        parse: hypothesisParser,
        required: true,
    }),
};

/** Every filter repeats, and the rows matching any of its values are listed. */
export const listFilterFlags = {
    'flow': Flags.string({ description: 'Only the hypotheses about this flow (ID); repeatable', multiple: true, parse: flowParser }),
    'order-by': Flags.option({
        description: 'Sort order; by default the rows that need attention come first, then the backlog order',
        options: hypothesisOrders,
    })(),
    'parent': Flags.string({
        description: 'Only the follow-ups of this hypothesis (ID); repeatable',
        multiple: true,
        parse: hypothesisParser,
    }),
    'phase': Flags.option({
        description: 'Only the hypotheses in this phase; repeatable',
        multiple: true,
        options: hypothesisPhases,
    })(),
    'placement': Flags.string({
        description: 'Only the hypotheses of this placement (ID), with those of other placements whose flow is shown here; repeatable',
        multiple: true,
        parse: placementParser,
    }),
    'segment': Flags.string({ description: 'Only the hypotheses about this segment (ID); repeatable', multiple: true, parse: segmentParser }),
    'state': Flags.option({
        description: 'Only the hypotheses in this state; repeatable',
        multiple: true,
        options: hypothesisStates,
    })(),
    'type': Flags.string({
        description: 'Only the hypotheses of this type, as namespace:name (e.g. adapty:flow_design); repeatable',
        multiple: true,
        parse: typeParser,
    }),
    'variant-flow': Flags.string({
        description: 'Only the hypotheses that test this flow as the variant (ID); repeatable',
        multiple: true,
        parse: flowParser,
    }),
};

type ListFilterFlags = {
    'flow'?: string[] | undefined;
    'order-by'?: (typeof hypothesisOrders)[number] | undefined;
    'parent'?: string[] | undefined;
    'phase'?: (typeof hypothesisPhases)[number][] | undefined;
    'placement'?: string[] | undefined;
    'segment'?: string[] | undefined;
    'state'?: (typeof hypothesisStates)[number][] | undefined;
    'type'?: string[] | undefined;
    'variant-flow'?: string[] | undefined;
};

export const listFilters = (flags: ListFilterFlags): ListHypothesesParams => ({
    flowIds: flags.flow,
    orderBy: flags['order-by'],
    parentHypothesisIds: flags.parent,
    phases: flags.phase,
    placementIds: flags.placement,
    segmentIds: flags.segment,
    states: flags.state,
    types: flags.type,
    variantFlowIds: flags['variant-flow'],
});

export const resultFlag = {
    result: Flags.option({ description: 'The verdict', options: hypothesisResults, required: true })(),
};

const PRODUCT_USAGE = '--product takes HYPOTHESIS_PRODUCT_ID=PRODUCT_ID: the product row of the hypothesis, then the product of the app that fills it.';

const productFillParser = idParser('product', 'Run `adapty products list --app <app>` to find it.');
const rowParser = idParser('hypothesis product', 'Run `adapty hypotheses get --app <app> HYPOTHESIS_ID` to see the product rows.');

const parseProductFill = async (input: string): Promise<ProductFill> => {
    const [row, product, ...rest] = input.split('=');

    if (row === undefined || product === undefined || rest.length > 0) {
        throw usageError(PRODUCT_USAGE);
    }

    return { hypothesisProductId: await rowParser(row.trim()), productId: await productFillParser(product.trim()) };
};

export const acceptFlags = {
    'placement-audience': Flags.string({
        description: 'An audience hypothesis: the live audience of the placement that carries the change (ID)',
        parse: idParser('placement audience', 'Run `adapty placements get --app <app> PLACEMENT_ID` to see its audiences.'),
    }),
    'product': Flags.custom<ProductFill>({
        description: 'Fill a product row of the hypothesis: HYPOTHESIS_PRODUCT_ID=PRODUCT_ID; repeatable',
        multiple: true,
        // The hypothesis id may follow the flag: it is not one more value of it
        multipleNonGreedy: true,
        parse: parseProductFill,
    })(),
    'variant-flow': Flags.string({
        description: 'A flow hypothesis: the published flow to test against the current one (ID). '
            + 'Leave it out to take it from the A/B test linked later',
        parse: flowParser,
    }),
};

export const abTestFlag = {
    'ab-test': Flags.string({
        description: 'The A/B test (ID): a flow test of two arms on the same placement, one of them the current flow',
        parse: abTestParser,
        required: true,
    }),
};

const CREATE_USAGE = 'The file holds one create body, an array of them, or {"hypotheses": [...]}.';

const isObject = (value: unknown): value is HypothesisCreateBody =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** One body, an array of them, or a batch body as the server takes it: always a list of bodies. */
export const readCreateBodies = async (path: string): Promise<HypothesisCreateBody[]> => {
    const parsed = await readJsonFile(path);
    const source = path === '-' ? 'stdin' : path;

    if (isObject(parsed) && 'hypotheses' in parsed && !Array.isArray(parsed.hypotheses)) {
        throw usageError(`${source}: "hypotheses" must be an array. ${CREATE_USAGE}`);
    }

    const wrapped = isObject(parsed) && Array.isArray(parsed.hypotheses);

    if (wrapped) {
        const others = Object.keys(parsed).filter(key => key !== 'hypotheses');

        if (others.length > 0) {
            throw usageError(`${source}: {"hypotheses": [...]} takes no other key, found ${others.join(', ')}. `
                + 'Set force on each item, or pass --force.');
        }
    }

    const items: unknown = wrapped ? parsed.hypotheses : parsed;

    const list: unknown[] = Array.isArray(items) ? items : [items];

    if (list.length === 0) {
        throw usageError(`${source} holds no hypothesis. ${CREATE_USAGE}`);
    }

    return list.map((item, index) => {
        if (!isObject(item)) {
            throw usageError(`Item ${String(index + 1)} of ${source} is not a JSON object. ${CREATE_USAGE}`);
        }

        return item;
    });
};
