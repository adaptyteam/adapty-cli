import {Args, Command} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {basename, extname} from 'node:path'

import type {MediaDTO} from '../../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../../lib/client-from-config.js'
import {appFlag} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export default class FlowsMediaUpload extends Command {
  static args = {
    file: Args.string({description: 'Path to the image file to upload', required: true}),
  }
static description = 'Upload an image as a flow builder asset; prints the CDN URL to reference from a flow config'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows media upload --app UUID ./onboarding-hero.png']
static flags = {
    ...appFlag,
  }

  async run(): Promise<MediaDTO> {
    const {args, flags} = await this.parse(FlowsMediaUpload)

    let content: Buffer
    try {
      content = await readFile(args.file)
    } catch {
      this.error(`Cannot read file: ${args.file}`, {exit: 2})
    }

    const name = basename(args.file)
    const type = IMAGE_MIME_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream'

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(content)], {type}), name)

    const client = await createAuthenticatedClient(this.config)
    const result = await client.postForm<MediaDTO>(`/apps/${flags.app}/flows/media/images`, form)

    this.log('Image uploaded!')
    // `preview_base64` is a long data blob with no value in human output; --json still returns it in full.
    printResponse({id: result.id, name: result.name, url: result.url}, this.log.bind(this))

    return result
  }
}
