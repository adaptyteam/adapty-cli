import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {fail, ok, paginationParams} from '../utils.js'

export function registerPaywallsTools(server: McpServer, config: Config): void {
  server.tool(
    'adapty_paywalls_list',
    'List all paywalls for an Adapty app.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async ({app_id, page, page_size}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/paywalls`, paginationParams(page, page_size)))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_paywalls_get',
    'Get details for a specific paywall.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      paywall_id: z.string().uuid().describe('Paywall ID (UUID)'),
    },
    async ({app_id, paywall_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/paywalls/${paywall_id}`))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_paywalls_create',
    'Create a paywall with one or more products.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      title: z.string().min(1).describe('Paywall title'),
      product_ids: z.array(z.string().uuid()).min(1).describe('Product IDs (UUIDs) to include in this paywall'),
    },
    async ({app_id, title, product_ids}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.post(`/apps/${app_id}/paywalls`, {title, product_ids}))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_paywalls_update',
    'Update a paywall. WARNING: This replaces ALL fields — any product_ids not listed will be removed. Fetch the current paywall first if you only want to change the title.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      paywall_id: z.string().uuid().describe('Paywall ID (UUID)'),
      title: z.string().min(1).describe('Paywall title'),
      product_ids: z.array(z.string().uuid()).min(1).describe('Complete list of product IDs — replaces all existing products on this paywall'),
    },
    async ({app_id, paywall_id, title, product_ids}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.put(`/apps/${app_id}/paywalls/${paywall_id}`, {title, product_ids}))
      } catch (err) {
        return fail(err)
      }
    },
  )
}
