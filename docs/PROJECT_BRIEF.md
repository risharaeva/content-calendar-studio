# Content Calendar Helper Project Brief

## Purpose

Content Calendar Helper is a local-first marketing workspace for planning, producing, reviewing, and improving social content systems.

The app started from a direct-to-consumer fashion and apparel use case, but the product direction is broader: reusable content planning for ecommerce brands, creator-led businesses, and founder-led content workflows.

## Current App

The MVP includes:

- Project switching and project creation
- Content calendar generation for a selected planning period
- Brand profile and strategy inputs
- Inspiration inbox for competitor, Pinterest, Instagram, TikTok, and internal ideas
- Campaign packet generation for each post
- Image, carousel, and video brief support
- Manual analytics capture
- Rule-based post scoring
- AI-assisted next-theme recommendations
- Configurable text providers for planning, copy, and insights
- Local-first image/provider settings

## Current Technical Stack

- Next.js + TypeScript
- SQLite local database
- Prisma client for app data access
- Custom SQLite bootstrap script at `prisma/init-db.ts`
- Optional Ollama support for local text generation
- Optional OpenAI text/image support
- Optional Anthropic text support
- Stable Diffusion WebUI-compatible local image endpoint support

## Product Direction

The app should evolve into a modular content operating system with tabs such as:

- Inputs
- Content Calendar
- Creative workspace
- Analytics
- Recommendations
- Assets
- Experiments
- Settings

## Provider Strategy

Text generation should be switchable per task:

- Content planning
- Post copy
- Analytics insights

Suggested usage:

- Local models for private, no-per-request-cost drafting
- GPT-style models for structure, analytics, campaign strategy, SEO, and search-oriented copy
- Claude-style models for voice, warmth, nuance, and caption refinement

Image generation should stay local-first for drafts, with external production workflows used when export-ready image quality is required.

## Content Strategy Principles

The planner should:

- Create quick audience recognition
- Reduce purchase anxiety
- Explain product use cases clearly
- Balance attraction, education, trust, desire, and conversion
- Reuse proven mechanics without copying competitor content
- Keep all generated content grounded in the selected brand profile and product truth

Avoid:

- Unsupported claims
- Body-shaming hooks
- Exact competitor-copy layouts
- Generic empowerment language
- Fake urgency or fabricated social proof

## Next Development Priorities

1. Add richer manual calendar editing with drag/reorder, statuses, and filters.
2. Add a dedicated creative workspace for image, carousel, and video briefs.
3. Add stronger analytics views with platform comparison.
4. Add suggestions that turn performance notes into next content directions.
5. Add provider presets for local models and cloud text/image providers.
6. Add import/export for project briefs and content calendars.
7. Move from local SQLite to hosted Postgres when shared editing is needed.
