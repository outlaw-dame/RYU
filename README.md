# Ryu

Ryu is a local-first, iOS-style Progressive Web App client for [BookWyrm](https://joinbookwyrm.com/).

The project is built around three principles:

1. **Book-cover-first UI** inspired by Oku-style library minimalism.
2. **Apple-native interaction feel** where practical for a PWA: system body font, safe areas, 44pt targets, reduced-motion support, and tab accessibility.
3. **BookWyrm-aware architecture**: ActivityPub JSON-LD ingestion, normalized local SQLite schema, offline write queue, and room for a write proxy while BookWyrm lacks full write APIs.

## Stack

- React + TypeScript + Vite
- Framer Motion for iOS-like motion and reduced-motion handling
- Lucide React as the open-source icon approximation
- wa-sqlite/OPFS architecture placeholder for local-first storage
- Zod for ActivityPub wire validation
- DOMPurify for BookWyrm HTML content sanitization

## Project structure

```text
src/
  app/                 App shell and tab panels
  components/common/   Reusable UI primitives
  components/layout/   Main tab bar
  db/                  Schema, migrations, DB lifecycle, write queue
  design/              Tokens and motion presets
  hooks/               Network, install, and DB lifecycle hooks
  lib/                 Sanitization and ISBN utilities
  sync/                Fetch queue and ActivityPub resolver scaffold
  types/               Runtime schemas and TypeScript types
```

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Current phase

This repo is a fresh Phase 1 scaffold. It includes the corrected design foundation and a runnable app shell. The database and ActivityPub layers are scaffolded for Phase 2 implementation, but not yet fully wired to wa-sqlite execution.

## License

AGPL-3.0-or-later.
