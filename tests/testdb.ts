import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Each integration file gets its own Postgres schema in the test database, pushed
 * fresh from the Prisma schema and dropped afterwards, so files can run in
 * parallel without seeing each other's rows. The base URL comes from
 * `LLD_TEST_DATABASE_URL`, or the local Homebrew default.
 */
const apiDir = fileURLToPath(new URL('../apps/api', import.meta.url))

export function testDatabaseUrl(schema: string): string {
  const base = process.env.LLD_TEST_DATABASE_URL ?? `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/lld_practice_test`
  return `${base}${base.includes('?') ? '&' : '?'}schema=${schema}`
}

/** Drop the file's schema (the SQLite version deleted its file), then push it fresh. */
export async function pushSchema(url: string): Promise<void> {
  const schema = new URL(url).searchParams.get('schema')!
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasources: { db: { url } } })
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await admin.$disconnect()
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}
