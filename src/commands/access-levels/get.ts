import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface AccessLevelDetailResponse {
  id: string
  sdk_id: string
  title: string
}

export default class AccessLevelsGet extends Command {
  static args = {
    access_level_id: Args.string({description: 'Access Level ID (UUID)', required: true}),
  }
static description = 'Get access level details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> access-levels get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<AccessLevelDetailResponse> {
    const {args, flags} = await this.parse(AccessLevelsGet)

    if (!isValidUuid(args.access_level_id)) {
      this.error('Invalid access level ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<AccessLevelDetailResponse>(`/apps/${flags.app}/access-levels/${args.access_level_id}`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
