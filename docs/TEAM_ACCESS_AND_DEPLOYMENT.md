# Team Access And Deployment

## Goal

Make Content Calendar Helper available to other people in two stages:

1. Team can view and edit the code through GitHub.
2. Team can open one shared hosted app in the browser and edit the same data.

## Stage 1: GitHub Code Access

For public sharing, use a personal public GitHub repository and keep the repository free of secrets, local databases, generated media, and internal brand materials.

Recommended setup:

- Repository visibility: public only if the code and docs are sanitized
- Owner: personal account or company organization
- Access: invite teammates as collaborators if they need direct push access
- Branching: protect `main`, use pull requests for changes

Before pushing:

- Keep `.env` local only
- Keep `prisma/dev.db` local only
- Keep `.logs/`, `.next/`, `node_modules/`, and generated media out of Git
- Commit `.env.example` so teammates know which variables exist

Local teammate flow:

```bash
git clone <repo-url>
cd "Content Calendar Helper"
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

This gives every teammate their own local copy and their own local database.

## Stage 2: Shared Browser Workspace

To let everyone open the same app and edit the same data, localhost is not enough. The app needs:

- Hosted app: Vercel is the simplest fit for Next.js
- Shared database: Supabase Postgres, Neon Postgres, or Railway Postgres
- Authentication: login or invite-only access before real team use

Recommended order:

1. Move Prisma from SQLite to Postgres.
2. Create a hosted Postgres database.
3. Add hosted `DATABASE_URL` in the deployment environment.
4. Deploy the app to Vercel.
5. Add authentication and project-level access rules.
6. Add backups/export for content plans and performance history.

## Current Limitation

The app currently uses SQLite through:

```env
DATABASE_URL="file:./dev.db"
```

SQLite is good for local work, but it is not the right database for multiple people editing the same hosted workspace.

## Suggested Deployment Target

Recommended MVP stack:

- GitHub public repo for sanitized code, or private repo if business context is included
- Vercel for hosting
- Supabase Postgres for shared data
- Later: Clerk, Auth.js, or Supabase Auth for login

## Data Safety

Do not upload private source folders, unpublished campaign files, real customer data, or API keys into GitHub. If the app needs business context, add sanitized summaries in `docs/` or import them through the UI later.
