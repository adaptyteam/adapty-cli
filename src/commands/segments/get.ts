import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface SegmentDetailResponse {
  description: string
  segment_id: string
  title: string
}

export default class SegmentsGet extends Command {
  static args = {
    segment_id: Args.string({description: 'Segment ID (UUID)', required: true}),
  }
static description = 'Get segment details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> segments get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<SegmentDetailResponse> {
    const {args, flags} = await this.parse(SegmentsGet)

    if (!isValidUuid(args.segment_id)) {
      this.error('Invalid segment ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<SegmentDetailResponse>(`/apps/${flags.app}/segments/${args.segment_id}`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
