# Content Calendar Helper

Local-first content planning and marketing production workspace.

The first internal use case was a direct-to-consumer apparel brand, but the app is intended to grow into a reusable content calendar and creative planning tool for multiple projects, ecommerce brands, and founder-led content systems.

## Current Status

This version is ready for local team development through GitHub. It is not yet a shared hosted workspace: each developer who runs it locally gets their own SQLite database.

For shared browser access and shared editing, the next step is moving the database to hosted Postgres and deploying the Next.js app.

## Local Setup

Requirements:

- Node.js 20+
- npm
- Optional: Ollama for local text generation

```bash
git clone <repo-url>
cd "Content Calendar Helper"
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Local SQLite:

```env
DATABASE_URL="file:./dev.db"
```

Optional cloud providers:

```env
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

The local SQLite database is created at `prisma/dev.db` and is intentionally ignored by Git.

## Scripts

```bash
npm run dev              # Start local dev server
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Unit tests
npm run db:push          # Initialize/update local SQLite schema
npm run db:seed          # Seed demo data
npm run prisma:generate  # Generate Prisma client
```

## Repository Safety

Do commit:

- `src/`
- `prisma/schema.prisma`
- `prisma/init-db.ts`
- `prisma/seed.ts`
- `docs/`
- `package.json`
- `package-lock.json`
- `.env.example`

Do not commit:

- `.env`
- `prisma/dev.db`
- `.logs/`
- `.next/`
- `node_modules/`
- generated images in `public/generated/`

## Docs

- [Project brief](docs/PROJECT_BRIEF.md)
- [Runbook](docs/RUNBOOK.md)
- [Architecture notes](docs/ARCHITECTURE.md)
- [Inspiration source guide](docs/INSPIRATION_SOURCE_GUIDE.md)
- [Team access and deployment plan](docs/TEAM_ACCESS_AND_DEPLOYMENT.md)
