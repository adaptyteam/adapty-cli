#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import net from 'node:net';

import { execute } from '@oclif/core';

// Node abandons every address but the last after 250ms. On a slow link the working address is
// dropped and the last one, e.g. IPv6 with no route, fails. Never lower a user-set value.
net.setDefaultAutoSelectFamilyAttemptTimeout(Math.max(net.getDefaultAutoSelectFamilyAttemptTimeout(), 1000));

await execute({ development: true, dir: import.meta.url });
