import type { RefundMetrics } from '../../../sdk/adapty/index.js';

export const renderMetrics = (metrics: RefundMetrics): string => [
    `Saved Amount: ${metrics.saved_amount_usd} USD`,
    `Saved Count: ${metrics.saved_count}`,
    `Requested Amount: ${metrics.requested_amount_usd} USD`,
    `Requested Count: ${metrics.requested_count}`,
    `Win Rate: ${metrics.win_rate}%`,
].join('\n');
