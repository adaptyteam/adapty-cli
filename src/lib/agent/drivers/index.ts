import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

import {claudeDriver} from './claude.js'
import {codexDriver} from './codex.js'
import {copilotDriver} from './copilot.js'
import {cursorDriver} from './cursor.js'
import {geminiDriver} from './gemini.js'
import {type AgentDriver, type AgentResult, type AgentRunOptions, withAuthCheck} from './shared.js'

export type {AgentDriver, AgentResult, AgentRunOptions, DriverId} from './shared.js'

const execFileAsync = promisify(execFile)

/** All supported agents; array order is the preference order when several are installed. */
export const DRIVERS: AgentDriver[] = [claudeDriver, codexDriver, geminiDriver, cursorDriver, copilotDriver]

/** For the --driver flag's `options` list. */
export const DRIVER_IDS = DRIVERS.map((d) => d.id)

async function onPath(bin: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin], {timeout: 5000})
    return true
  } catch {
    return false
  }
}

export async function detectDrivers(): Promise<AgentDriver[]> {
  const found = await Promise.all(DRIVERS.map(async (d) => ((await onPath(d.bin)) ? d : null)))
  return found.filter((d): d is AgentDriver => d !== null)
}

export async function runAgent(driver: AgentDriver, opts: AgentRunOptions): Promise<AgentResult> {
  return withAuthCheck(await driver.run(opts), driver.authErrorPattern)
}
