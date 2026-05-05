import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface SegmentItem {
  description: string
  segment_id: string
  title: string
}

export default class SegmentsList extends Command {
  static description = 'List segments for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> segments list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<SegmentItem>> {
    const {flags} = await this.parse(SegmentsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<SegmentItem>>(
      `/apps/${flags.app}/segments`,
      paginationParams(flags),
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
