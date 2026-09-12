import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Loads `apps/api/.env.local` into process.env — the one place a learner running
 * this locally is told to put an API key. The file is gitignored; nothing here
 * ever reads it into application code, only into the environment the provider
 * factory already consults.
 *
 * Deliberately not a dependency: the format we need is KEY=VALUE, optional quotes,
 * `#` comments, and "don't clobber what the shell already exported".
 */
export function loadLocalEnv(file = defaultEnvFile()): string[] {
  if (!existsSync(file)) return []
  const loaded: string[] = []
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
      loaded.push(key)
    }
  }
  return loaded
}

function defaultEnvFile(): string {
  // src/infra/env.ts → apps/api/.env.local
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local')
}
