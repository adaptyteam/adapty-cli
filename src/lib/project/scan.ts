import {readdir, readFile} from 'node:fs/promises'
import {basename, join} from 'node:path'

export type Platform = 'android' | 'capacitor' | 'flutter' | 'ios' | 'kmp' | 'react-native' | 'unity'

export interface DetectedProject {
  name: string
  path: string
  platform: Platform
  platformLabel: string
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  android: 'Android',
  capacitor: 'Capacitor',
  flutter: 'Flutter',
  ios: 'iOS',
  kmp: 'Kotlin Multiplatform',
  'react-native': 'React Native',
  unity: 'Unity',
}

async function readJson(path: string): Promise<null | Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function hasKmpModule(dir: string, topLevel: string[]): Promise<boolean> {
  const checks = await Promise.all(
    topLevel.map(async (entry) => (await entries(join(dir, entry, 'src'))).includes('commonMain')),
  )
  return checks.includes(true)
}

/**
 * Detect the mobile framework of the project at `dir`. Signals mirror the
 * adapty-integration skill's Phase 1 table. Only the top level is
 * inspected - monorepos should pass the app directory explicitly.
 */
export async function scanProject(dir: string): Promise<DetectedProject | null> {
  const topLevel = await entries(dir)
  const has = (name: string): boolean => topLevel.includes(name)
  const pkg = has('package.json') ? await readJson(join(dir, 'package.json')) : null
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  }

  let platform: null | Platform = null
  let name: null | string = null

  if (deps['@capacitor/core']) {
    platform = 'capacitor'
  } else if (deps['react-native']) {
    platform = 'react-native'
  } else if (has('pubspec.yaml')) {
    platform = 'flutter'
    const pubspec = await readFile(join(dir, 'pubspec.yaml'), 'utf8').catch(() => '')
    name = pubspec.match(/^name:\s*(\S+)/m)?.[1] ?? null
  } else if (has('Assets') && has('ProjectSettings')) {
    platform = 'unity'
  } else if (topLevel.some((f) => f === 'build.gradle' || f === 'build.gradle.kts' || f.startsWith('settings.gradle'))) {
    platform = (await hasKmpModule(dir, topLevel)) ? 'kmp' : 'android'
  } else {
    const xcodeproj = topLevel.find((f) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'))
    if (xcodeproj || has('Package.swift') || topLevel.some((f) => f.endsWith('.swift'))) {
      platform = 'ios'
      if (xcodeproj) name = xcodeproj.replace(/\.(xcodeproj|xcworkspace)$/, '')
    }
  }

  if (!platform) return null

  if (!name && typeof pkg?.name === 'string') name = pkg.name
  if (!name) name = basename(dir)

  return {name, path: dir, platform, platformLabel: PLATFORM_LABELS[platform]}
}
