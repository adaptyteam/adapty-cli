import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import type {Platform} from '../project/scan.js'

/**
 * Skill content is NOT vendored into this package - the single source of
 * truth is the adapty-sdk-integration-skill repo. Files are fetched from
 * GitHub raw at run time; set ADAPTY_SKILL_DIR to a local checkout of the
 * skill directory (the one containing SKILL.md) to develop against local
 * edits.
 */
const RAW_BASE =
  'https://raw.githubusercontent.com/adaptyteam/adapty-sdk-integration-skill/main/skills/adapty-sdk-integration'

function stripFrontmatter(md: string): string {
  const lines = md.split('\n')
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) return lines.slice(end + 1).join('\n').trim()
  }

  return md.trim()
}

async function loadSkillFile(rel: string): Promise<string> {
  let content: string
  const localDir = process.env.ADAPTY_SKILL_DIR
  if (localDir) {
    content = await readFile(join(localDir, rel), 'utf8')
  } else {
    const response = await fetch(`${RAW_BASE}/${rel}`, {signal: AbortSignal.timeout(15_000)})
    if (!response.ok) {
      throw new Error(
        `Could not fetch skill file "${rel}" (HTTP ${response.status}). Check your connection and retry.`,
      )
    }

    content = await response.text()
  }

  // Normalize CRLF (e.g. a Windows checkout via ADAPTY_SKILL_DIR) so frontmatter stripping works.
  return stripFrontmatter(content.replaceAll('\r\n', '\n'))
}

/** The platform-specific integration playbook (references/<platform>.md). */
export async function loadPlatformReference(platform: Platform): Promise<string> {
  return loadSkillFile(`references/${platform}.md`)
}
