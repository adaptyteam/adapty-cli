import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import type {Platform} from '../project/scan.js'

/**
 * Skill content is NOT vendored into this package - the single source of
 * truth is the adapty-skills repo. Files are fetched from
 * GitHub raw at run time; set ADAPTY_SKILL_DIR to a local checkout of the
 * skill directory (the one containing SKILL.md) to develop against local
 * edits.
 */
const RAW_BASE =
  'https://raw.githubusercontent.com/adaptyteam/adapty-skills/main/skills/adapty-integration'

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

/**
 * A skill file that may legitimately not exist. Only some migration sources
 * have a dedicated references/migration-<source>.md; a missing one means "use
 * the spine's unknown-source path", not an error. Every other failure still
 * throws, so a network problem is never mistaken for an absent file.
 */
async function loadOptionalSkillFile(rel: string): Promise<string | undefined> {
  try {
    return await loadSkillFile(rel)
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP 404')) return undefined
    if ((error as {code?: string}).code === 'ENOENT') return undefined
    throw error
  }
}

/** The platform-specific integration playbook (references/<platform>.md). */
export async function loadPlatformReference(platform: Platform): Promise<string> {
  return loadSkillFile(`references/${platform}.md`)
}

/**
 * The migration playbook: the source-agnostic spine, plus the source-specific
 * file when the skill ships one. The spine is REQUIRED - it carries the
 * mapping rules and the ADAPTY_SETUP.md contract that the migrate prompt no
 * longer inlines, so a run without it would silently lose them.
 */
export async function loadMigrationReference(source?: string): Promise<string> {
  const spine = await loadSkillFile('references/migration.md')
  const specific = source ? await loadOptionalSkillFile(`references/migration-${source}.md`) : undefined
  return specific ? `${spine}\n\n---\n\n${specific}` : spine
}
