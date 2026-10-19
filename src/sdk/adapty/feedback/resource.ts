import { assertValid } from '../../core/validation.js';

import { toSendRequest, validateSendFeedback } from './send.js';

import type { SendFeedbackInput } from './send.js';
import type { Http } from '../../core/http/index.js';

export const feedback = (http: Http) => ({
    send: async (input: SendFeedbackInput): Promise<void> => {
        assertValid(validateSendFeedback(input));

        await http.post<undefined>('/feedback', toSendRequest(input));
    },
});

export type FeedbackApi = ReturnType<typeof feedback>;
