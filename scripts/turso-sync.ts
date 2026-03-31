/**
 * Turso Sync Script
 *
 * Syncs the local SQLite database to/from the Turso cloud database.
 * Both devices read/write locally, then sync to Turso as the source of truth.
 *
 * Usage:
 *   npx tsx scripts/turso-sync.ts push   # Push local → Turso
 *   npx tsx scripts/turso-sync.ts pull   # Pull Turso → local
 *   npx tsx scripts/turso-sync.ts status # Compare row counts
 */

import Database from 'better-sqlite3'
import { createClient } from '@libsql/client'
import path from 'path'
import 'dotenv/config'

const LOCAL_DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db')
const TURSO_URL = process.env.TURSO_DATABASE_URL
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env')
  process.exit(1)
}

const local = new Database(LOCAL_DB_PATH)
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const TABLES = ['Bookmark', 'Category', 'BookmarkCategory', 'MediaItem', 'ImportJob', 'Setting']

async function getLocalCount(table: string): Promise<number> {
  const row = local.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c: number }
  return row.c
}

async function getTursoCount(table: string): Promise<number> {
  const result = await turso.execute(`SELECT COUNT(*) as c FROM "${table}"`)
  return Number(result.rows[0].c)
}

async function status() {
  console.log('\n📊 Sync Status\n')
  console.log('Table'.padEnd(20), 'Local'.padEnd(10), 'Turso'.padEnd(10), 'Diff')
  console.log('-'.repeat(55))

  for (const table of TABLES) {
    const localCount = await getLocalCount(table)
    const tursoCount = await getTursoCount(table)
    const diff = localCount - tursoCount
    const diffStr = diff === 0 ? 'in sync' : diff > 0 ? `+${diff} local` : `+${Math.abs(diff)} turso`
    console.log(table.padEnd(20), String(localCount).padEnd(10), String(tursoCount).padEnd(10), diffStr)
  }
  console.log()
}

async function push() {
  console.log('\nPushing local → Turso...\n')

  for (const table of TABLES) {
    const localRows = local.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
    if (localRows.length === 0) {
      console.log(`  ${table}: 0 rows (skip)`)
      continue
    }

    // Get column names from first row
    const columns = Object.keys(localRows[0])
    const placeholders = columns.map(() => '?').join(', ')
    const columnList = columns.map(c => `"${c}"`).join(', ')

    // Clear Turso table first
    await turso.execute(`DELETE FROM "${table}"`)

    // Insert in batches of 100
    const batchSize = 100
    let inserted = 0
    for (let i = 0; i < localRows.length; i += batchSize) {
      const batch = localRows.slice(i, i + batchSize)
      const stmts = batch.map(row => ({
        sql: `INSERT OR REPLACE INTO "${table}" (${columnList}) VALUES (${placeholders})`,
        args: columns.map(c => {
          const val = row[c]
          if (val === null || val === undefined) return null
          if (val instanceof Date) return val.toISOString()
          return val as string | number
        }),
      }))
      await turso.batch(stmts)
      inserted += batch.length
    }

    console.log(`  ${table}: ${inserted} rows pushed`)
  }

  console.log('\nPush complete!\n')
}

async function pull() {
  console.log('\nPulling Turso → local...\n')

  // Disable FK checks during bulk import
  local.pragma('foreign_keys = OFF')

  for (const table of TABLES) {
    const result = await turso.execute(`SELECT * FROM "${table}"`)
    if (result.rows.length === 0) {
      console.log(`  ${table}: 0 rows (skip)`)
      continue
    }

    const columns = result.columns
    const columnList = columns.map(c => `"${c}"`).join(', ')
    const placeholders = columns.map(() => '?').join(', ')

    // Clear local table
    local.prepare(`DELETE FROM "${table}"`).run()

    // Insert all rows
    const insert = local.prepare(`INSERT OR REPLACE INTO "${table}" (${columnList}) VALUES (${placeholders})`)
    const insertMany = local.transaction((rows: unknown[][]) => {
      for (const row of rows) insert.run(...row)
    })

    const rowData = result.rows.map(row => columns.map(c => row[c] ?? null))
    insertMany(rowData)

    console.log(`  ${table}: ${result.rows.length} rows pulled`)
  }

  local.pragma('foreign_keys = ON')
  console.log('\nPull complete!\n')
}

const command = process.argv[2]

switch (command) {
  case 'push':
    push().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
    break
  case 'pull':
    pull().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
    break
  case 'status':
    status().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
    break
  default:
    console.log('Usage: npx tsx scripts/turso-sync.ts [push|pull|status]')
    process.exit(1)
}
