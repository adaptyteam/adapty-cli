#!/usr/bin/env node

import {existsSync, readFileSync} from 'node:fs'
import {relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = fileURLToPath(new URL('../oclif.manifest.json', import.meta.url))
const INVENTORY_DOCS = [
  fileURLToPath(new URL('../docs/agent/asa-management.md', import.meta.url)),
  fileURLToPath(new URL('../docs/agent/asa-metrics.md', import.meta.url)),
]
const SETUP_DOC = fileURLToPath(new URL('../docs/agent/skills/adapty-cli-setup/SKILL.md', import.meta.url))
const METRICS_DOC = fileURLToPath(new URL('../docs/agent/asa-metrics.md', import.meta.url))
const EXAMPLE_DOCS = [
  ...INVENTORY_DOCS,
  SETUP_DOC,
]

const errors = []
const fail = (file, line, message) => errors.push(`${relative(ROOT, file)}:${line}: ${message}`)
const normalizeNewlines = (text) => text.replaceAll(/\r\n?/g, '\n')

if (!existsSync(MANIFEST)) {
  console.error('oclif.manifest.json is missing; run `pnpm build && pnpm exec oclif manifest` first.')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const commands = new Map(
  Object.entries(manifest.commands).filter(
    ([id, command]) => id.startsWith('asa:') && Array.isArray(command.relativePath),
  ),
)
const documented = new Map()

function cells(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function commandReference(cell) {
  const code = cell.match(/`(asa(?:\s+[a-z][a-z-]*){1,2}(?:\s+[^`]*)?)`/)?.[1]
  if (!code) return null

  const commandText = code.match(/^asa(?:\s+[a-z][a-z-]*){1,2}/)?.[0]
  if (!commandText) return null

  return {code, id: commandText.replaceAll(' ', ':')}
}

function resolveFlag(command, writtenName) {
  if (command.flags?.[writtenName]) return writtenName
  if (writtenName.startsWith('no-')) {
    const positiveName = writtenName.slice(3)
    if (command.flags?.[positiveName]?.allowNo) return positiveName
  }

  return null
}

for (const file of INVENTORY_DOCS) {
  const lines = readFileSync(file, 'utf8').split('\n')

  for (const [index, line] of lines.entries()) {
    if (!line.startsWith('|')) continue
    const row = cells(line)
    if (row.length < 3) continue

    const reference = commandReference(row[0])
    if (!reference) continue

    const command = commands.get(reference.id)
    if (!command) {
      fail(file, index + 1, `documents unknown command ${reference.id.replaceAll(':', ' ')}`)
      continue
    }

    if (documented.has(reference.id)) {
      fail(file, index + 1, `documents ${reference.id.replaceAll(':', ' ')} more than once`)
      continue
    }

    documented.set(reference.id, {file, line: index + 1})
    const writtenFlags = new Set()
    for (const match of row[1].matchAll(/`--([a-z][a-z0-9-]*)/g)) {
      const resolved = resolveFlag(command, match[1])
      if (resolved) {
        writtenFlags.add(resolved)
      } else {
        fail(file, index + 1, `${reference.id.replaceAll(':', ' ')} has no --${match[1]} flag`)
      }
    }

    for (const [name, flag] of Object.entries(command.flags ?? {})) {
      if (flag.required && !writtenFlags.has(name)) {
        fail(file, index + 1, `${reference.id.replaceAll(':', ' ')} is missing required flag --${name}`)
      }
    }

    const requiredArguments = Object.values(command.args ?? {}).filter((argument) => argument.required).length
    const writtenArguments = [...reference.code.matchAll(/<[^>]+>/g)].length
    if (writtenArguments < requiredArguments) {
      fail(
        file,
        index + 1,
        `${reference.id.replaceAll(':', ' ')} documents ${writtenArguments} positional argument(s), manifest requires ${requiredArguments}`,
      )
    }
  }
}

for (const id of commands.keys()) {
  if (!documented.has(id)) fail(MANIFEST, 1, `${id.replaceAll(':', ' ')} is missing from the agent docs`)
}

function checkExamples(file, line, lineNumber) {
  for (const match of line.matchAll(/\badapty\s+asa(?:\s+[a-z][a-z-]*){1,2}/g)) {
    const words = match[0].replace(/^adapty\s+/, '').split(/\s+/)
    let id = words.join(':')
    while (words.length > 2 && !commands.has(id)) {
      words.pop()
      id = words.join(':')
    }

    const command = commands.get(id)
    if (!command) {
      fail(file, lineNumber, `example uses unknown command ${match[0]}`)
      continue
    }

    const example = line.slice(match.index)
    for (const flag of example.matchAll(/--([a-z][a-z0-9-]*)/g)) {
      if (!resolveFlag(command, flag[1])) {
        fail(file, lineNumber, `${id.replaceAll(':', ' ')} example uses unknown flag --${flag[1]}`)
      }
    }
  }
}

for (const file of EXAMPLE_DOCS) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const [index, line] of lines.entries()) {
    checkExamples(file, line, index + 1)
  }
}

const setupText = normalizeNewlines(readFileSync(SETUP_DOC, 'utf8'))
const setupDescription = setupText.match(/^description:\s*(.+)$/m)?.[1] ?? ''
const setupContracts = [
  ['## Entry boundary', 'explicit setup entry boundary'],
  ['`NetworkError` means the CLI could not reach the API. Do not install or log in.', 'NetworkError routing'],
  ['failed to copy trust settings of system certificate-25291', 'Cowork certificate-noise signature'],
  ['NODE_USE_SYSTEM_CA=0', 'system CA fallback'],
  [
    'Adapty API is unreachable from this sandbox. Allow network access for `adapty.io` and',
    'concise network failure message',
  ],
]
for (const [contract, label] of setupContracts) {
  if (!setupText.includes(contract)) fail(SETUP_DOC, 1, `missing setup contract: ${label}`)
}

if (setupDescription.includes('402') || setupDescription.includes('ads_manager_subscription_required')) {
  fail(SETUP_DOC, 1, '402 must not trigger the setup skill')
}

if (setupText.indexOf('## Entry boundary') > setupText.indexOf('## Run this')) {
  fail(SETUP_DOC, 1, 'setup entry boundary must be read before install and login instructions')
}

const metricsText = normalizeNewlines(readFileSync(METRICS_DOC, 'utf8'))
const metricContracts = [
  ['`revenue`, `roas`, `arpu`, `arppu`, `arpas`, and\n  `roi`', 'complete cohort-window metric family'],
  ['Agent workflows use the `net_` variant', 'net revenue-family workflow default'],
  ['`cost_per_paid` and `cost_per_trial` are values for the requested date window', 'cost metric date-window semantics'],
  ['`--by-days` does not turn either into a day-X metric', 'non-cohort day-X prohibition'],
]
for (const [contract, label] of metricContracts) {
  if (!metricsText.includes(contract)) fail(METRICS_DOC, 1, `missing metrics contract: ${label}`)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`)
  console.error(`\n${errors.length} agent documentation drift error(s)`)
  process.exit(1)
}

console.log(`Agent docs match ${commands.size} executable Apple Ads commands in oclif.manifest.json.`)
