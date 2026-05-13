# Runbook

## Mac One-Click Files

For teammates on Mac, use:

```text
scripts/mac/Install Content Calendar.command
scripts/mac/Start Content Calendar.command
scripts/mac/Update Content Calendar.command
```

`Install` clones or updates the GitHub repository into `~/Documents/content-calendar-studio`, installs packages, prepares `.env`, and stops if the database URLs have not been configured yet.

`Start` runs an already installed app.

`Update` pulls the latest code from GitHub, runs `npm install`, and pushes the latest Prisma schema to the configured database.

## Manual Start The App

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

## Database

The app now expects a Postgres-compatible database, such as Supabase Postgres.

Required:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

Use the Supabase Transaction Pooler URI for `DATABASE_URL`.
Use the Supabase Direct URI or Session Pooler URI for `DIRECT_URL`; Prisma uses it for schema updates.

Update schema:

```bash
npm run db:push
```

Seed starter data:

```bash
npm run db:seed
```

## Hosted Access Gate

Set these in Vercel to protect the hosted app:

```env
APP_ACCESS_PASSWORD="choose-a-team-password"
AUTH_SECRET="long-random-string"
```

If `APP_ACCESS_PASSWORD` is empty, the app is open.

## Optional Providers

Optional text providers:

```env
OPENAI_API_KEY="..."
ANTHROPIC_API_KEY="..."
```

OpenAI image generation only runs if the app setting is switched to OpenAI.

## Local Text Generation

Ollama is optional if cloud text providers are used.

Install Ollama from:

```text
https://docs.ollama.com/macos
```

Then run:

```bash
ollama serve
ollama pull llama3.1:8b
```

## Local Image Generation

The app expects a local Stable Diffusion-compatible endpoint by default:

```text
http://127.0.0.1:7861/sdapi/v1/img2img
```

The default local generator is a draft renderer. For final social assets, use the production brief in the post workspace and paste that brief into ChatGPT, Nano Banana, or a production ComfyUI workflow with FLUX/SDXL.

## Checks

```bash
npm run lint
npm run test
npm run build
```
