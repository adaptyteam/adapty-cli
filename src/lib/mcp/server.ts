import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerAccessLevelsTools} from './tools/access-levels.js'
import {registerAppsTools} from './tools/apps.js'
import {registerAuthTools} from './tools/auth.js'
import {registerPaywallsTools} from './tools/paywalls.js'
import {registerPlacementsTools} from './tools/placements.js'
import {registerProductsTools} from './tools/products.js'

export function registerAllTools(server: McpServer, config: Config): void {
  registerAuthTools(server, config)
  registerAppsTools(server, config)
  registerProductsTools(server, config)
  registerPaywallsTools(server, config)
  registerPlacementsTools(server, config)
  registerAccessLevelsTools(server, config)
}
