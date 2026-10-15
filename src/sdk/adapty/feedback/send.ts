import type { Issue } from '../../core/errors.js';

export const sentiments = ['positive', 'neutral', 'negative'] as const;

export type Sentiment = (typeof sentiments)[number];

export type SendFeedbackInput = {
    context?: string | undefined;
    feature?: string | undefined;
    message: string;
    sentiment: Sentiment;
};

type SendFeedbackRequest = {
    context?: string;
    feature?: string;
    message: string;
    sentiment: Sentiment;
};

// A coarse first pass: the server scrubs reports more thoroughly.
const secrets: { kind: string; pattern: RegExp }[] = [
    { kind: 'an API key or token', pattern: /(?<![a-z\d])(?:dev|secret|sk|pk|rk)_(?:live|test)_(?=[a-z\d]{0,64}\d)[a-z\d]{6,}/i },
    { kind: 'a bearer token', pattern: /\bbearer\s+(?=[\w.~+-]{0,64}\d)[\w.~+-]{16,}/i },
    { kind: 'a JWT', pattern: /(?<![\w-])eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/ },
    // Lookbehinds and bounded repeats keep matching linear on a long pasted log.
    { kind: 'an email address', pattern: /(?<![\w.%+-])(?!git@)[\w.%+-]{1,64}@[a-z][a-z\d-]*(?:\.[a-z\d-]+)*\.[a-z]{2,}\b/i },
];

const checkSecrets = (issues: Issue[], path: string, value: string | undefined): void => {
    if (value === undefined) {
        return;
    }

    for (const { kind, pattern } of secrets) {
        if (pattern.test(value)) {
            issues.push({ message: `looks like it contains ${kind}; remove it and send again`, path });
        }
    }
};

export const validateSendFeedback = (input: SendFeedbackInput): Issue[] => {
    const issues: Issue[] = [];

    checkSecrets(issues, 'message', input.message);
    checkSecrets(issues, 'context', input.context);
    checkSecrets(issues, 'feature', input.feature);

    return issues;
};

export const toSendRequest = (input: SendFeedbackInput): SendFeedbackRequest => {
    const body: SendFeedbackRequest = { message: input.message, sentiment: input.sentiment };

    if (input.feature !== undefined) {
        body.feature = input.feature;
    }

    if (input.context !== undefined) {
        body.context = input.context;
    }

    return body;
};
