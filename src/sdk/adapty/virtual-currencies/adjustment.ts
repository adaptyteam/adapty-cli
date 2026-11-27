/**
 * A manual credit or debit of the coins of one profile. The server owns every value rule (the direction, the
 * operations of each direction, the amount range, the currency of the app), so a value is sent as given.
 */
export type AdjustmentInput = {
    amount: number;
    /** Left out: no comment. */
    comment?: string | undefined;
    currencyCode: string;
    /** `credit` or `debit`. */
    direction: string;
    feature: string;
    operation: string;
    /** Left out: no reference. */
    referenceId?: string | undefined;
};

/** The balance of the adjusted currency after the write. */
export type AdjustedBalance = {
    available: number;
    balance: number;
    code: string;
    name: string;
};

/**
 * The answer of an adjustment. A repeat with the same key within its hour gives the answer of the first write
 * again, its balance included, and writes nothing.
 */
export type Adjustment = {
    balance: AdjustedBalance;
    /** The time of the answer, in milliseconds since the epoch. */
    response_created_at: number;
    /** Null when the server could not read it. */
    spendable: null | number;
    transaction_id: string;
};

export const adjustmentBody = (input: AdjustmentInput): Record<string, unknown> => ({
    amount: input.amount,
    currency_code: input.currencyCode,
    direction: input.direction,
    feature: input.feature,
    operation: input.operation,
    ...(input.referenceId === undefined ? {} : { reference_id: input.referenceId }),
    ...(input.comment === undefined ? {} : { comment: input.comment }),
});

/** The key of the write: the server keeps the first answer under it for one hour and does not compare the body. */
export const adjustmentHeaders = (idempotencyKey: string): Record<string, string> => ({ 'idempotency-key': idempotencyKey });
