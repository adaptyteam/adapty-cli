import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {fail, ok, paginationParams} from '../utils.js'

export function registerPlacementsTools(server: McpServer, config: Config): void {
  server.tool(
    'adapty_placements_list',
    'List all placements for an Adapty app.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async ({app_id, page, page_size}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/placements`, paginationParams(page, page_size)))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_placements_get',
    'Get details for a specific placement.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      placement_id: z.string().uuid().describe('Placement ID (UUID)'),
    },
    async ({app_id, placement_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/placements/${placement_id}`))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_placements_create',
    'Create a placement linked to a paywall. The developer_id is the string your app uses at runtime to fetch this placement.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      title: z.string().min(1).describe('Placement title'),
      developer_id: z.string().min(1).describe('Developer ID used by the SDK to fetch this placement at runtime'),
      paywall_id: z.string().uuid().describe('Paywall ID (UUID) to link to this placement'),
    },
    async ({app_id, title, developer_id, paywall_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.post(`/apps/${app_id}/placements`, {title, developer_id, paywall_id}))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_placements_update',
    'Update a placement. WARNING: This replaces ALL fields — fetch the current placement first if you only want to change one field.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      placement_id: z.string().uuid().describe('Placement ID (UUID)'),
      title: z.string().min(1).describe('Placement title'),
      developer_id: z.string().min(1).describe('Developer ID used by the SDK at runtime'),
      paywall_id: z.string().uuid().describe('Paywall ID (UUID) — replaces the existing linked paywall'),
    },
    async ({app_id, placement_id, title, developer_id, paywall_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.put(`/apps/${app_id}/placements/${placement_id}`, {title, developer_id, paywall_id}))
      } catch (err) {
        return fail(err)
      }
    },
  )
}
