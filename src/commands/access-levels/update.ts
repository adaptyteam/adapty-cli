import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class AccessLevelsUpdate extends Command {
  static args = {
    access_level_id: Args.string({description: 'Access Level ID (UUID)', required: true}),
  }
static description = 'Update an access level'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> access-levels update --app UUID 550e8400-... --title "VIP Access"',
  ]
static flags = {
    ...appFlag,
    title: Flags.string({description: 'Access level title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {args, flags} = await this.parse(AccessLevelsUpdate)

    if (!isValidUuid(args.access_level_id)) {
      this.error('Invalid access level ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<Record<string, unknown>>(`/apps/${flags.app}/access-levels/${args.access_level_id}`, {
      title: flags.title,
    })

    this.log('Access level updated!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
