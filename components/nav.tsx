'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import ThemeToggle from './theme-toggle'
import {
  LayoutDashboard,
  Upload,
  Search,
  Tag,
  GitBranch,
  Settings,
  Sparkles,
  Shuffle,
  ChevronRight,
  Command,
  Bookmark,
  Copy,
  Check,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/ai-search', label: 'AI Search', icon: Sparkles },
  { href: '/bookmarks', label: 'Browse', icon: Search },
  { href: '/stumble', label: 'Stumble', icon: Shuffle },
  { href: '/mindmap', label: 'Mindmap', icon: GitBranch },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function NavFooter() {
  return (
    <div className="mx-3 mt-auto mb-3 pt-3 border-t border-[#1a2e22]">
      <a
        href="https://x.com/diego_salinas33"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[#4a6055] hover:text-[#00e676] hover:bg-[#0e1612] transition-all group"
      >
        <span className="text-[13px]">𝕏</span>
        <span className="text-[11px] font-medium">@diego_salinas33</span>
      </a>
    </div>
  )
}

interface CategoryItem {
  name: string
  slug: string
  color: string
  bookmarkCount: number
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

interface PipelineStatus {
  status: 'idle' | 'running' | 'stopping'
  stage: string | null
  done: number
  total: number
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  vision: 'Analyzing images',
  entities: 'Extracting entities',
  enrichment: 'Generating tags',
  categorize: 'Categorizing',
}

export default function Nav() {
  const pathname = usePathname()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [totalBookmarks, setTotalBookmarks] = useState<number | null>(null)
  const [showAllCats, setShowAllCats] = useState(false)
  const [collectionsOpen, setCollectionsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('nav-collections-open') !== 'false'
  })
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null)

  function toggleCollections() {
    setCollectionsOpen((v) => {
      const next = !v
      localStorage.setItem('nav-collections-open', String(next))
      return next
    })
  }

  function openSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  }

  useEffect(() => {
    function handleCleared() {
      setCategories([])
      setTotalBookmarks(0)
    }
    window.addEventListener('xtract:cleared', handleCleared)
    return () => window.removeEventListener('xtract:cleared', handleCleared)
  }, [])

  useEffect(() => {
    // Fetch stats
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: { totalBookmarks?: number }) => {
        if (d.totalBookmarks !== undefined) setTotalBookmarks(d.totalBookmarks)
      })
      .catch(() => {})

    // Fetch categories with counts
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: CategoryItem[] }) => setCategories(d.categories ?? []))
      .catch(() => {})

    // Poll pipeline status every 3s to show global indicator
    function pollPipeline() {
      fetch('/api/categorize')
        .then((r) => r.json())
        .then((d: PipelineStatus) => setPipeline(d))
        .catch(() => {})
    }
    pollPipeline()
    const interval = setInterval(pollPipeline, 3000)
    return () => clearInterval(interval)
  }, [])

  const visibleCats = showAllCats ? categories : categories.slice(0, 8)

  return (
    <aside className="flex flex-col bg-[#080c0a] border-r border-[#1a2e22] shrink-0 sticky top-0 h-screen overflow-y-auto" style={{ width: '228px' }}>

      {/* Brand */}
      <div className="flex items-center justify-center gap-3 px-4 py-3.5 border-b border-[#1a2e22]">
        <img src="/logo.svg" alt="Xtract" className="w-9 h-9 shrink-0" />
        <span className="text-[#cddad2] font-bold text-[17px] tracking-[3px] uppercase" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          X<span style={{ color: '#00e676' }}>tract</span>
        </span>
        <div className="shrink-0 flex items-center">
          <ThemeToggle />
        </div>
      </div>

      {/* Pipeline running indicator — hidden on /categorize and /import */}
      {pipeline && (pipeline.status === 'running' || pipeline.status === 'stopping') &&
       pathname !== '/categorize' && pathname !== '/import' && (
        <Link
          href="/categorize"
          className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(0,230,118,0.08)] border border-[rgba(0,230,118,0.2)] hover:bg-[rgba(0,230,118,0.12)] transition-colors"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e676] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e676]" />
          </span>
          <span className="text-[11px] font-medium text-[#4aea9a] truncate">
            {pipeline.stage ? (PIPELINE_STAGE_LABELS[pipeline.stage] ?? pipeline.stage) : 'AI pipeline'}
            {pipeline.stage === 'categorize' && pipeline.total > 0
              ? ` ${pipeline.done}/${pipeline.total}`
              : '…'}
          </span>
        </Link>
      )}

      {/* Ctrl+K search trigger */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={openSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0e1612] border border-[#1a2e22] text-[#4a6055] hover:text-[#cddad2] hover:bg-[#141f1a] hover:border-[#243a2d] transition-all text-xs"
        >
          <Search size={12} className="shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="flex items-center gap-0.5 text-[10px] text-zinc-600 font-mono">
            <Command size={9} />K
          </kbd>
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-px px-2 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                active
                  ? 'bg-[rgba(0,230,118,0.12)] text-[#00e676]'
                  : 'text-[#4a6055] hover:bg-[#0e1612] hover:text-[#cddad2]'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-[#1a2e22]" />

      {/* Categories section */}
      {categories.length > 0 && (
        <div className="px-2 py-3 flex-1 min-h-0 flex flex-col">
          <button
            onClick={toggleCollections}
            className="flex items-center justify-between px-2 mb-2 w-full group"
          >
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
              Collections
            </p>
            <div className="flex items-center gap-1.5">
              <Link
                href="/categories"
                onClick={(e) => e.stopPropagation()}
                className="text-zinc-700 hover:text-zinc-400 transition-colors p-0.5 rounded"
                title="Manage categories"
              >
                <Tag size={11} />
              </Link>
              <ChevronRight
                size={10}
                className={`text-zinc-600 transition-transform duration-200 ${collectionsOpen ? 'rotate-90' : ''}`}
              />
            </div>
          </button>

          {collectionsOpen && (
            <>
              <div className="flex flex-col gap-px overflow-y-auto flex-1 min-h-0 max-h-64">
                {visibleCats.map((cat) => {
                  const catActive = pathname === `/categories/${cat.slug}`
                  return (
                    <Link
                      key={cat.slug}
                      href={`/categories/${cat.slug}`}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all group ${
                        catActive
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      <Bookmark
                        size={12}
                        className="flex-shrink-0 transition-colors"
                        style={{ color: cat.color, fill: cat.color }}
                      />
                      <span className="truncate flex-1">{cat.name}</span>
                      <span className="text-[11px] text-zinc-600 group-hover:text-zinc-500 tabular-nums font-normal">
                        {cat.bookmarkCount}
                      </span>
                    </Link>
                  )
                })}
              </div>

              {categories.length > 8 && (
                <button
                  onClick={() => setShowAllCats((v) => !v)}
                  className="flex items-center gap-1.5 px-2 mt-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <ChevronRight
                    size={10}
                    className={`transition-transform ${showAllCats ? 'rotate-90' : ''}`}
                  />
                  {showAllCats ? 'Show less' : `${categories.length - 8} more`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <NavFooter />
    </aside>
  )
}
