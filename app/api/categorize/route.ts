import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { resolveAnthropicClient } from '@/lib/claude-cli-auth'
import { getCliAuthStatus } from '@/lib/claude-cli-auth'
import { categorizeAll, seedDefaultCategories } from '@/lib/categorizer'
import { analyzeAllUntagged, enrichAllBookmarks } from '@/lib/vision-analyzer'
import { backfillEntities } from '@/lib/rawjson-extractor'
import { rebuildFts } from '@/lib/fts'

type Stage = 'vision' | 'entities' | 'enrichment' | 'categorize'

interface CategorizationState {
  status: 'idle' | 'running' | 'stopping'
  stage: Stage | null
  done: number
  total: number
  stageCounts: {
    visionTagged: number
    entitiesExtracted: number
    enriched: number
    categorized: number
  }
  lastError: string | null
  error: string | null
}

// In-memory state for progress tracking across requests
const globalState = globalThis as unknown as {
  categorizationState: CategorizationState
  categorizationAbort: boolean
}

if (!globalState.categorizationState) {
  globalState.categorizationState = {
    status: 'idle',
    stage: null,
    done: 0,
    total: 0,
    stageCounts: { visionTagged: 0, entitiesExtracted: 0, enriched: 0, categorized: 0 },
    lastError: null,
    error: null,
  }
}
if (globalState.categorizationAbort === undefined) {
  globalState.categorizationAbort = false
}

function shouldAbort(): boolean {
  return globalState.categorizationAbort
}

function getState(): CategorizationState {
  return { ...globalState.categorizationState }
}

function setState(update: Partial<CategorizationState>): void {
  globalState.categorizationState = { ...globalState.categorizationState, ...update }
}

export async function GET(): Promise<NextResponse> {
  const state = getState()
  return NextResponse.json({
    status: state.status,
    stage: state.stage,
    done: state.done,
    total: state.total,
    stageCounts: state.stageCounts,
    lastError: state.lastError,
    error: state.error,
  })
}

export async function DELETE(): Promise<NextResponse> {
  const state = getState()
  if (state.status !== 'running') {
    return NextResponse.json({ error: 'No pipeline running' }, { status: 409 })
  }
  globalState.categorizationAbort = true
  setState({ status: 'stopping' })
  return NextResponse.json({ stopped: true })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (getState().status === 'running' || getState().status === 'stopping') {
    return NextResponse.json({ error: 'Categorization is already running' }, { status: 409 })
  }

  let body: { bookmarkIds?: string[]; apiKey?: string; force?: boolean } = {}
  try {
    const text = await request.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { bookmarkIds = [], apiKey, force = false } = body

  if (apiKey && typeof apiKey === 'string' && apiKey.trim() !== '') {
    await prisma.setting.upsert({
      where: { key: 'anthropicApiKey' },
      update: { value: apiKey.trim() },
      create: { key: 'anthropicApiKey', value: apiKey.trim() },
    })
  }

  globalState.categorizationAbort = false

  let total = 0
  try {
    if (bookmarkIds.length > 0) {
      total = bookmarkIds.length
    } else if (force) {
      total = await prisma.bookmark.count()
    } else {
      total = await prisma.bookmark.count({ where: { enrichedAt: null } })
    }
  } catch {
    total = 0
  }

  setState({
    status: 'running',
    stage: 'entities',
    done: 0,
    total,
    stageCounts: { visionTagged: 0, entitiesExtracted: 0, enriched: 0, categorized: 0 },
    lastError: null,
    error: null,
  })

  const dbApiKey =
    (await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } }))?.value?.trim() || ''

  // Sequential pipeline: entities → vision → enrichment → categorize → rebuild FTS
  void (async () => {
    const counts = { visionTagged: 0, entitiesExtracted: 0, enriched: 0, categorized: 0 }

    try {
      let client
      try {
        client = resolveAnthropicClient({ dbKey: dbApiKey })
      } catch {
        const cliStatus = getCliAuthStatus()
        if (cliStatus.available && cliStatus.expired) {
          setState({ lastError: 'Claude CLI session expired. Open Claude Code or run `claude` in your terminal to refresh it.' })
        } else {
          setState({ lastError: 'No Anthropic API key configured. Go to Settings to add one, or log in with Claude CLI.' })
        }
        console.error('No API key or CLI auth — skipping pipeline')
        return
      }

      await seedDefaultCategories()

      if (force) {
        await prisma.mediaItem.updateMany({ where: { imageTags: '{}' }, data: { imageTags: null } })
        await prisma.bookmark.updateMany({ where: { semanticTags: '[]' }, data: { semanticTags: null } })
      }

      // Stage 1: Entity extraction (free, fast — no API calls)
      if (!shouldAbort()) {
        setState({ stage: 'entities' })
        counts.entitiesExtracted = await backfillEntities((n) => {
          counts.entitiesExtracted = n
          setState({ stageCounts: { ...counts } })
        }, shouldAbort).catch((err) => {
          console.error('Entity extraction error:', err)
          return counts.entitiesExtracted
        })
        setState({ stageCounts: { ...counts } })
      }

      // Stage 2: Analyze ALL untagged media (images, video thumbnails, gifs)
      if (!shouldAbort()) {
        setState({ stage: 'vision' })
        counts.visionTagged = await analyzeAllUntagged(client, (n) => {
          counts.visionTagged = n
          setState({ stageCounts: { ...counts } })
        }, shouldAbort).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('Vision analysis error:', msg)
          setState({ lastError: `Vision: ${msg.slice(0, 120)}` })
          return counts.visionTagged
        })
        setState({ stageCounts: { ...counts } })
      }

      // Stage 3: Generate semantic tags for all bookmarks
      if (!shouldAbort()) {
        console.log('[pipeline] Starting enrichment stage, shouldAbort:', shouldAbort())
        setState({ stage: 'enrichment' })
        counts.enriched = await enrichAllBookmarks(client, (n) => {
          counts.enriched = n
          setState({ stageCounts: { ...counts } })
        }, shouldAbort).catch((err) => {
          console.error('Semantic enrichment error:', err)
          return counts.enriched
        })
        setState({ stageCounts: { ...counts } })
      }
    } catch (err) {
      console.error('Pre-categorization enrichment error:', err)
    }

    // Stage 4: Categorize using text + image tags + semantic tags + entities
    if (!shouldAbort()) {
      setState({ stage: 'categorize' })
      await categorizeAll(bookmarkIds, (done, runTotal) => {
        counts.categorized = done
        setState({ done, total: runTotal, stageCounts: { ...counts } })
      }, force, shouldAbort)
    }

    // Stage 5: Rebuild FTS5 search index
    if (!shouldAbort()) {
      await rebuildFts().catch((err) => console.error('FTS rebuild error:', err))
    }
  })()
    .then(() => {
      const wasStopped = globalState.categorizationAbort
      globalState.categorizationAbort = false
      setState({
        status: 'idle',
        stage: null,
        done: wasStopped ? getState().done : total,
        total,
        error: wasStopped ? 'Stopped by user' : null,
      })
    })
    .catch((err) => {
      globalState.categorizationAbort = false
      console.error('Categorization pipeline error:', err)
      setState({
        status: 'idle',
        stage: null,
        error: err instanceof Error ? err.message : String(err),
      })
    })

  return NextResponse.json({ status: 'started', total })
}
