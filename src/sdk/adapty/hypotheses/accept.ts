import type { Issue } from '../../core/errors.js';

/** Which product of the store fills a product row the hypothesis proposed. */
export type ProductFill = {
    hypothesisProductId: string;
    productId: string;
};

/**
 * Everything is optional: a flow row takes `{}`, and linking an A/B test fills the variant from its
 * arms. Whether a row needs a variant or products is the server's knowledge of that row.
 */
export type AcceptHypothesisInput = {
    /** An audience row: the live audience of the placement that carries the change. */
    placementAudienceId?: string | undefined;
    products?: readonly ProductFill[] | undefined;
    /** A flow row: the published flow to test against the subject flow. */
    variantFlowId?: string | undefined;
};

type AcceptRequest = {
    products?: { hypothesis_product_id: string; product_id: string }[];
    variant?: { placement_audience_id?: string; variant_flow_id?: string };
};

export const validateAccept = (input: AcceptHypothesisInput): Issue[] => {
    const seen = new Set<string>();
    const issues: Issue[] = [];

    for (const fill of input.products ?? []) {
        const key = fill.hypothesisProductId.toLowerCase();

        if (seen.has(key)) {
            issues.push({ message: `${fill.hypothesisProductId} is given more than once`, path: 'product' });
        }

        seen.add(key);
    }

    return issues;
};

/** An absent part is left out rather than sent empty. */
export const toAcceptRequest = (input: AcceptHypothesisInput): AcceptRequest => {
    const body: AcceptRequest = {};
    const variant: NonNullable<AcceptRequest['variant']> = {};

    if (input.variantFlowId !== undefined) {
        variant.variant_flow_id = input.variantFlowId;
    }

    if (input.placementAudienceId !== undefined) {
        variant.placement_audience_id = input.placementAudienceId;
    }

    if (Object.keys(variant).length > 0) {
        body.variant = variant;
    }

    if (input.products !== undefined && input.products.length > 0) {
        body.products = input.products.map(fill => ({
            hypothesis_product_id: fill.hypothesisProductId,
            product_id: fill.productId,
        }));
    }

    return body;
};
