import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

export interface AdaptyConfig {
  access_token?: string
  user?: {email: string; name: string}
}

const CONFIG_DIR = join(homedir(), '.config', 'adapty')
const CONFIG_FILE = 'config.json'

function configPath(configDir?: string): string {
  return join(configDir ?? CONFIG_DIR, CONFIG_FILE)
}

export async function readConfig(configDir?: string): Promise<AdaptyConfig> {
  try {
    const raw = await readFile(configPath(configDir), 'utf8')
    return JSON.parse(raw) as AdaptyConfig
  } catch {
    return {}
  }
}

export async function writeConfig(config: AdaptyConfig, configDir?: string): Promise<void> {
  const path = configPath(configDir)
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await chmod(path, 0o600)
}
