import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {fail, ok, paginationParams} from '../utils.js'

export function registerAccessLevelsTools(server: McpServer, config: Config): void {
  server.tool(
    'adapty_access_levels_list',
    'List all access levels for an Adapty app.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async ({app_id, page, page_size}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/access-levels`, paginationParams(page, page_size)))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_access_levels_get',
    'Get details for a specific access level.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      access_level_id: z.string().uuid().describe('Access level ID (UUID)'),
    },
    async ({app_id, access_level_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/access-levels/${access_level_id}`))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_access_levels_create',
    'Create a custom access level. IMPORTANT: sdk_id is IMMUTABLE after creation and cannot be changed.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      sdk_id: z.string().min(1).describe('SDK identifier used in app code (e.g. "premium") — IMMUTABLE after creation'),
      title: z.string().min(1).describe('Access level title'),
    },
    async ({app_id, sdk_id, title}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.post(`/apps/${app_id}/access-levels`, {sdk_id, title}))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_access_levels_update',
    'Update an access level title. Note: sdk_id cannot be changed after creation.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      access_level_id: z.string().uuid().describe('Access level ID (UUID)'),
      title: z.string().min(1).describe('New access level title'),
    },
    async ({app_id, access_level_id, title}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.put(`/apps/${app_id}/access-levels/${access_level_id}`, {title}))
      } catch (err) {
        return fail(err)
      }
    },
  )
}
