import { Flags } from '@oclif/core';

import { revenueBases } from '../../../sdk/attribution/index.js';

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};
