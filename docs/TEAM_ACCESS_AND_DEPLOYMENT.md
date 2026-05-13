# Team Access And Deployment

## Goal

Make Content Calendar Studio available as one shared browser workspace where teammates edit the same data.

Recommended stack:

- GitHub for code
- Supabase Postgres for shared data
- Vercel for hosting
- `APP_ACCESS_PASSWORD` as the first simple access gate

## Required Environment Variables

Set these in Vercel:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
APP_ACCESS_PASSWORD="choose-a-team-password"
AUTH_SECRET="long-random-string"
```

Optional:

```env
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

## Supabase Setup

Create a Supabase project and copy the Postgres connection string.

For Vercel/serverless usage, use the Transaction Pooler URI as `DATABASE_URL`, with `pgbouncer=true&connection_limit=1`.
Use the Direct URI or Session Pooler URI as `DIRECT_URL` so Prisma can update the schema. Keep passwords private and do not commit them into GitHub.

After `DATABASE_URL` is available:

```bash
npm run db:push
npm run db:seed
```

## Vercel Setup

1. Import the GitHub repository into Vercel.
2. Add the environment variables above.
3. Deploy.
4. Open the deployed URL.
5. Enter the `APP_ACCESS_PASSWORD`.

## Current Access Model

This is a simple password gate, not full user accounts.

Good enough for a first internal MVP:

- One shared password
- One shared database
- One shared Vercel URL

Later, replace this with proper authentication and roles:

- Supabase Auth
- Auth.js
- Clerk
- Project-level permissions

## Data Safety

Do not upload private source folders, unpublished campaign files, real customer data, or API keys into GitHub. If the app needs business context, add sanitized summaries in `docs/` or import them through the UI later.
