# Content Calendar Studio

Content planning and creative production workspace for social media teams.

The app supports content calendar generation, inspiration capture, post packets, image/video briefs, and performance notes.

## Current Status

The project is being prepared for shared hosted use:

- Code lives in GitHub.
- Data should live in a shared Supabase/Postgres database.
- The hosted Vercel app should be protected with `APP_ACCESS_PASSWORD`.

## Local Setup

Requirements:

- Node.js 20+
- npm
- Supabase/Postgres `DATABASE_URL` and `DIRECT_URL`
- Optional: Ollama for local text generation

### Mac One-Click Setup

Download or clone the repository, then double-click:

```text
scripts/mac/Install Content Calendar.command
```

The installer will clone/update the project in:

```text
~/Documents/content-calendar-studio
```

If `.env` does not contain real Supabase/Postgres URLs, the installer will stop and ask you to paste them.

After installation:

```text
scripts/mac/Start Content Calendar.command
scripts/mac/Update Content Calendar.command
```

Use `Start` to run the app. Use `Update` after new code has been pushed to GitHub.

### Manual Setup

```bash
git clone https://github.com/risharaeva/content-calendar-studio.git
cd content-calendar-studio
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

Shared database:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

Use the Supabase Transaction Pooler URI for `DATABASE_URL`.
Use the Supabase Direct URI or Session Pooler URI for `DIRECT_URL`; Prisma uses it when creating or updating tables.

Hosted password gate:

```env
APP_ACCESS_PASSWORD="choose-a-team-password"
AUTH_SECRET="long-random-string"
```

Optional cloud providers:

```env
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

## Scripts

```bash
npm run dev              # Start local dev server
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Unit tests
npm run db:push          # Push Prisma schema to Postgres
npm run db:seed          # Seed starter data
npm run prisma:generate  # Generate Prisma client
```

## Repository Safety

Do commit:

- `src/`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `docs/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `.env.example`

Do not commit:

- `.env`
- local database files
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
