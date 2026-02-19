import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, paginationFlags, paginationParams} from '../../lib/flags.js'
import {isValidUuid, printList} from '../../lib/output.js'

interface AccessLevelItem {
  id: string
  sdk_id: string
  title: string
}

interface PaginatedResponse {
  data: AccessLevelItem[]
  meta: {pagination: {count: number; page: number; pages: number}}
}

export default class AccessLevelsList extends Command {
  static description = 'List access levels for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> access-levels list --app 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse> {
    const {flags} = await this.parse(AccessLevelsList)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse>(
      `/apps/${flags.app}/access-levels`,
      paginationParams(flags),
    )

    printList(
      result.data.map((al) => ({ID: al.id, 'SDK ID': al.sdk_id, Title: al.title})),
      this.log.bind(this),
      result.meta.pagination,
    )

    return result
  }
}
