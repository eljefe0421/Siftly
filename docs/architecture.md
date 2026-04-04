# Xtract — Architecture Overview

## What It Is
Self-hosted Twitter/X bookmark manager with AI-powered categorization, search, and visualization.

## Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Database:** SQLite via Prisma 7
- **AI:** Anthropic SDK (Claude CLI auth, no API key needed)
- **Visualization:** @xyflow/react (mindmap)
- **Styling:** Tailwind CSS v4

## Data Flow
```
Twitter Export / Manual Import
  → /app/api/import (parse bookmarks)
  → Prisma/SQLite (store)
  → /app/api/categorize (Claude AI categorization)
  → /app/api/search/ai (semantic search)
  → /app/api/analyze/images (vision analysis)
  → UI: categories, bookmarks, mindmap, ai-search
```

## Key Architecture Decisions
- **SQLite over Postgres:** Single-user self-hosted app. No server needed. File-based DB keeps deployment simple.
- **Claude CLI Auth:** Piggybacks on existing Claude subscription instead of requiring a separate API key. See `lib/claude-cli-auth.ts`.
- **CLI for AI agents:** `cli/xtract.ts` provides direct DB access so Claude Code can query bookmarks without going through the web UI.

## Module Map
- `/app/api/` — All API routes (categorize, import, search, settings, analyze, bookmarks, categories, mindmap, stats)
- `/lib/` — Core logic (auth, categorizer, vision, full-text search, parser, exporter)
- `/components/` — React UI components
- `/prisma/` — Schema + SQLite database file

## Danger Zones
- `lib/claude-cli-auth.ts` — Reads OAuth tokens from macOS keychain. Platform-specific.
- `prisma/dev.db` — The actual database. Don't delete.
- Privacy: Never use real name in commits. Always "Viperr" / "viperrcrypto".
