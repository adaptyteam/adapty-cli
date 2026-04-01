import type {Config} from '@oclif/core'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {createAuthenticatedClient} from '../../client-from-config.js'
import {fail, ok, paginationParams} from '../utils.js'

const PERIODS = ['weekly', 'monthly', 'two_months', 'trimonthly', 'semiannual', 'annual', 'lifetime'] as const

export function registerProductsTools(server: McpServer, config: Config): void {
  server.tool(
    'adapty_products_list',
    'List all products for an Adapty app.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async ({app_id, page, page_size}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/products`, paginationParams(page, page_size)))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_products_get',
    'Get details for a specific product.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      product_id: z.string().uuid().describe('Product ID (UUID)'),
    },
    async ({app_id, product_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.get(`/apps/${app_id}/products/${product_id}`))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_products_create',
    'Create a product. IMPORTANT: period, ios_product_id, android_product_id, and android_base_plan_id are IMMUTABLE after creation. At least one of ios_product_id or android_product_id is required. android_base_plan_id is required for Android non-lifetime subscriptions.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      title: z.string().min(1).describe('Product title'),
      period: z.enum(PERIODS).describe('Subscription period — IMMUTABLE after creation'),
      access_level_id: z.string().uuid().describe('Access level ID (UUID)'),
      ios_product_id: z.string().optional().describe('iOS product ID — IMMUTABLE after creation. Required if android_product_id not provided.'),
      android_product_id: z.string().optional().describe('Android product ID — IMMUTABLE after creation. Required if ios_product_id not provided.'),
      android_base_plan_id: z.string().optional().describe('Android base plan ID — IMMUTABLE after creation. Required for Android non-lifetime subscriptions.'),
    },
    async ({app_id, title, period, access_level_id, ios_product_id, android_product_id, android_base_plan_id}) => {
      try {
        if (!ios_product_id && !android_product_id)
          return fail('At least one of ios_product_id or android_product_id is required')
        if (android_product_id && !android_base_plan_id && period !== 'lifetime')
          return fail('android_base_plan_id is required with android_product_id for non-lifetime subscriptions')

        const client = await createAuthenticatedClient(config)
        const body: Record<string, unknown> = {title, period, access_level_id}
        if (ios_product_id) body.ios_product_id = ios_product_id
        if (android_product_id) body.android_product_id = android_product_id
        if (android_base_plan_id) body.android_base_plan_id = android_base_plan_id
        return ok(await client.post(`/apps/${app_id}/products`, body))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.tool(
    'adapty_products_update',
    'Update a product title and access level. Note: period, ios_product_id, android_product_id, and android_base_plan_id cannot be changed after creation.',
    {
      app_id: z.string().uuid().describe('App ID (UUID)'),
      product_id: z.string().uuid().describe('Product ID (UUID)'),
      title: z.string().min(1).describe('Product title'),
      access_level_id: z.string().uuid().describe('Access level ID (UUID)'),
    },
    async ({app_id, product_id, title, access_level_id}) => {
      try {
        const client = await createAuthenticatedClient(config)
        return ok(await client.put(`/apps/${app_id}/products/${product_id}`, {title, access_level_id}))
      } catch (err) {
        return fail(err)
      }
    },
  )
}
