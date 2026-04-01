import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {readConfig} from '../../config.js'
import {fail, ok} from '../utils.js'

export function registerAuthTools(server: McpServer, config: Config): void {
  server.tool('adapty_auth_whoami', 'Show current user info by verifying the token against the Adapty API.', {}, async () => {
    try {
      const client = await createAuthenticatedClient(config)
      return ok(await client.get('/me'))
    } catch (err) {
      return fail(err)
    }
  })

  server.tool('adapty_auth_status', 'Check local authentication state without making a network request.', {}, async () => {
    try {
      const cfg = await readConfig(config.configDir)
      if (!cfg.access_token || !cfg.user) return ok({authenticated: false})
      return ok({
        authenticated: true,
        email: cfg.user.email,
        token_prefix: cfg.access_token.slice(0, 8),
        config_path: `${config.configDir}/config.json`,
      })
    } catch (err) {
      return fail(err)
    }
  })
}
