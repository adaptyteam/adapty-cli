import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {fail, ok, paginationParams} from '../utils.js'

export function registerAppsTools(server: McpServer, config: Config): void {
  server.tool(
    'adapty_apps_list',
    'List all Adapty apps. Returns paginated results.',
    {
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async ({page, page_size}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get('/apps', paginationParams(page, page_size)))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_apps_get',
    'Get details for a specific Adapty app.',
    {app_id: z.string().uuid().describe('App ID (UUID)')},
    async ({app_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}`))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_apps_create',
    'Create a new Adapty app. apple_bundle_id required when ios in platforms; google_bundle_id required when android in platforms.',
    {
      title: z.string().min(1).describe('App title'),
      platforms: z.array(z.enum(['ios', 'android'])).min(1).describe('Target platforms'),
      apple_bundle_id: z.string().optional().describe('Apple bundle ID (required if platforms includes ios)'),
      google_bundle_id: z.string().optional().describe('Google bundle ID (required if platforms includes android)'),
    },
    async ({title, platforms, apple_bundle_id, google_bundle_id}) => {
      try {
        if (platforms.includes('ios') && !apple_bundle_id)
          return fail('apple_bundle_id is required when platforms includes ios')
        if (platforms.includes('android') && !google_bundle_id)
          return fail('google_bundle_id is required when platforms includes android')

        const client = await createAuthenticatedClient(config)
        const body: Record<string, unknown> = {title, platforms}
        if (apple_bundle_id) body.apple_bundle_id = apple_bundle_id
        if (google_bundle_id) body.google_bundle_id = google_bundle_id
        return ok(await client.post('/apps', body))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_apps_update',
    'Update an existing Adapty app. At least one of title, apple_bundle_id, or google_bundle_id must be provided.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      title: z.string().optional().describe('New app title'),
      apple_bundle_id: z.string().optional().describe('New Apple bundle ID'),
      google_bundle_id: z.string().optional().describe('New Google bundle ID'),
    },
    async ({app_id, title, apple_bundle_id, google_bundle_id}) => {
      try {
        if (!title && !apple_bundle_id && !google_bundle_id)
          return fail('At least one of title, apple_bundle_id, or google_bundle_id is required')

        const client = await createAuthenticatedClient(config)
        const body: Record<string, unknown> = {}
        if (title) body.title = title
        if (apple_bundle_id) body.apple_bundle_id = apple_bundle_id
        if (google_bundle_id) body.google_bundle_id = google_bundle_id
        return ok(await client.put(`/apps/${app_id}`, body))
      } catch (err) {
        return fail(err)
      }
    },
  )
}
