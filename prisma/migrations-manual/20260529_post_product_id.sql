-- Migration: add ContentPost.productId (Shoot Studio product selection)
--
-- New schema bit:
--   - ContentPost.productId String @default("")
--
-- This is the explicit Shoot Studio garment id a post is shot for. When set,
-- the renderer resolves the exact garment by this id (and auto-selects the
-- matching model size) instead of guessing the product from the prompt text.
-- An empty string means "auto — detect from brief" (legacy inference path).
--
-- This change is purely additive:
--   - `npm run db:push` alone creates the column with its default ''. Existing
--     rows therefore get productId = '' (auto/infer), which preserves today's
--     behaviour. db:push does NOT need --accept-data-loss for this.
--
-- This file exists for environments where the column is applied with raw SQL
-- instead of db:push. It is idempotent and safe to re-run; there is no data to
-- remap because productId has no predecessor column.

BEGIN;

ALTER TABLE "ContentPost"
  ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';

COMMIT;
