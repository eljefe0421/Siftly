'use client'

import { useState, useCallback } from 'react'
import { Shuffle, ExternalLink } from 'lucide-react'
import BookmarkCard from '@/components/bookmark-card'
import type { BookmarkWithMedia } from '@/lib/types'

export default function StumblePage() {
  const [bookmark, setBookmark] = useState<BookmarkWithMedia | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasStumbled, setHasStumbled] = useState(false)

  const stumble = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookmarks/random')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setBookmark(data.bookmark)
      setHasStumbled(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      {!hasStumbled && (
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Stumble Upon</h1>
          <p className="text-sm text-zinc-500">Rediscover a random bookmark from your collection.</p>
        </div>
      )}

      <button
        onClick={stumble}
        disabled={loading}
        className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[rgba(0,230,118,0.12)] border border-[rgba(0,230,118,0.25)] text-[#00e676] font-semibold text-sm hover:bg-[rgba(0,230,118,0.2)] hover:border-[rgba(0,230,118,0.4)] disabled:opacity-50 transition-all mb-8"
      >
        <Shuffle size={16} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Finding...' : hasStumbled ? 'Stumble again' : 'Stumble'}
      </button>

      {bookmark && (
        <div className="w-full max-w-lg">
          <BookmarkCard bookmark={bookmark} />
          <div className="flex justify-center mt-4">
            <a
              href={`https://x.com/i/status/${bookmark.tweetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              View on X <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
