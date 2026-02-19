import {readConfig} from './config.js'

export async function resolveToken(configDir?: string): Promise<null | string> {
  const envToken = process.env.ADAPTY_TOKEN
  if (envToken) return envToken

  const config = await readConfig(configDir)
  return config.access_token ?? null
}
