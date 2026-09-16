import { actionBlock } from '../../../../views/migrations/envelope/action-block.js';

import type { Action } from '../../../../../sdk/adapty/index.js';

type ActionView = { action: Action; migrationId: string };

export const actionView = ({ action, migrationId }: ActionView): string => actionBlock(action, migrationId).join('\n');
