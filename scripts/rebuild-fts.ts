import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../app/generated/prisma/client.js'
import path from 'path'

const dbUrl = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) })

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_fts USING fts5(
      bookmark_id UNINDEXED, text, semantic_tags, entities, image_tags,
      tokenize='porter unicode61'
    )
  `)
  await prisma.$executeRawUnsafe('DELETE FROM bookmark_fts')

  const bookmarks = await prisma.bookmark.findMany({
    select: {
      id: true, text: true, semanticTags: true, entities: true,
      mediaItems: { select: { imageTags: true } },
    },
  })
  console.log(`Indexing ${bookmarks.length} bookmarks...`)

  const BATCH = 200
  for (let i = 0; i < bookmarks.length; i += BATCH) {
    const batch = bookmarks.slice(i, i + BATCH)
    await prisma.$transaction(
      batch.map((b) => {
        const imageTags = b.mediaItems.map((m) => m.imageTags || '').filter(Boolean).join(' ')
        return prisma.$executeRaw`
          INSERT INTO bookmark_fts(bookmark_id, text, semantic_tags, entities, image_tags)
          VALUES (${b.id}, ${b.text}, ${b.semanticTags || ''}, ${b.entities || ''}, ${imageTags})
        `
      })
    )
    if ((i + BATCH) % 2000 === 0) console.log(`  ...${i + BATCH} done`)
  }

  const count = await prisma.$queryRawUnsafe<{ c: number }[]>('SELECT COUNT(*) as c FROM bookmark_fts')
  console.log(`FTS index rebuilt: ${count[0].c} rows`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
