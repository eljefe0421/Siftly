import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    const count = await prisma.bookmark.count()
    if (count === 0) {
      return NextResponse.json({ bookmark: null })
    }

    const skip = Math.floor(Math.random() * count)
    const [bookmark] = await prisma.bookmark.findMany({
      skip,
      take: 1,
      include: {
        mediaItems: { select: { id: true, type: true, url: true, thumbnailUrl: true } },
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true, color: true } },
          },
        },
      },
    })

    if (!bookmark) {
      return NextResponse.json({ bookmark: null })
    }

    return NextResponse.json({
      bookmark: {
        id: bookmark.id,
        tweetId: bookmark.tweetId,
        text: bookmark.text,
        authorHandle: bookmark.authorHandle,
        authorName: bookmark.authorName,
        tweetCreatedAt: bookmark.tweetCreatedAt?.toISOString() ?? null,
        importedAt: bookmark.importedAt.toISOString(),
        mediaItems: bookmark.mediaItems.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
        })),
        categories: bookmark.categories.map((bc) => ({
          id: bc.category.id,
          name: bc.category.name,
          slug: bc.category.slug,
          color: bc.category.color,
          confidence: bc.confidence,
        })),
      },
    })
  } catch (err) {
    console.error('Random bookmark error:', err)
    return NextResponse.json(
      { error: `Failed to fetch random bookmark: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
