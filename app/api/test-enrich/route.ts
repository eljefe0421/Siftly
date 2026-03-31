import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { enrichBatchSemanticTags } from '@/lib/vision-analyzer'
import { resolveAnthropicClient } from '@/lib/claude-cli-auth'
import { getAnthropicModel } from '@/lib/settings'

export async function GET(): Promise<NextResponse> {
  try {
    const model = await getAnthropicModel()
    const dbApiKey = (await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } }))?.value?.trim() || ''
    const client = resolveAnthropicClient({ dbKey: dbApiKey })

    // Test raw API call first
    try {
      const test = await client.messages.create({
        model,
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say hello' }],
      })
      console.log('[test-enrich] Raw API test passed with model:', model)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `Raw API call failed with model ${model}: ${msg}` })
    }

    // Now test enrichment
    const rows = await prisma.bookmark.findMany({
      where: { semanticTags: null },
      take: 2,
      select: { id: true, text: true, entities: true, mediaItems: { select: { imageTags: true } } },
    })

    const batch = rows.map(b => ({
      id: b.id,
      text: b.text,
      imageTags: b.mediaItems.map(m => m.imageTags).filter((t): t is string => t !== null && t !== '' && t !== '{}'),
      entities: b.entities ? JSON.parse(b.entities) : undefined,
    }))

    const results = await enrichBatchSemanticTags(batch, client)
    return NextResponse.json({ model, batchSize: batch.length, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) })
  }
}
