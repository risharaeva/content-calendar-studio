# Architecture Notes

## Current Shape

The app is still intentionally small.

Main areas:

- `src/app/page.tsx`: server entrypoint for dashboard data
- `src/components/dashboard-shell.tsx`: main interactive UI
- `src/app/api/**`: local API routes
- `src/lib/marketing.ts`: orchestration for profile, planning, packets, reviews, and recommendations
- `src/lib/text-generation.ts`: text provider routing
- `src/lib/image-renderer.ts`: image provider routing
- `src/lib/scoring.ts`: scoring rules and tests
- `prisma/schema.prisma`: data model
- `prisma/init-db.ts`: SQLite bootstrap and incremental column setup
- `prisma/seed.ts`: starter demo data

## Important Design Choice

The app now has a project-aware foundation. `Project` is the parent for project-specific profile data, calendar posts, and theme recommendations, while provider settings remain global for the local workstation.

Current and recommended structure:

- `Project`
- `ProjectProfile`
- `ContentPost`
- `CampaignPacket`
- `GeneratedImage`
- `ReviewResult`
- `ThemeRecommendation`

Future additions should keep the same ownership boundary:

- `GeneratedAsset`
- `AnalyticsEntry`
- `Suggestion`
- `BrandVoice`
- `ContentPillar`

## Provider Routing

Text generation is routed by task:

- `planTextProvider` / `planTextModel`
- `copyTextProvider` / `copyTextModel`
- `insightsProvider` / `insightsModel`

Supported providers:

- `OLLAMA`
- `OPENAI`
- `ANTHROPIC`

Image generation is routed by:

- `imageProvider`
- `imageModel`
- `localImageEndpoint`

Supported image providers:

- `LOCAL_SD_WEBUI`
- `OPENAI`

## Future UI Direction

The app should become tab-based rather than one long dashboard.

Suggested navigation:

- Calendar
- Workspace
- Creatives
- Analytics
- Suggestions
- Projects
- Settings

Keep the interface operational, dense, and calm. This is a working content system, not a landing page.
