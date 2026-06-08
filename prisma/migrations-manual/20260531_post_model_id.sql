-- Migration: add ContentPost.modelId (explicit Shoot Studio model / "the girl")
--
-- New schema bit:
--   - ContentPost.modelId String @default("")
--
-- Lets the user pin which Shoot Studio virtual model is rendered on the post.
-- When empty, the renderer auto-selects the model from the product's size range
-- (legacy behaviour). When set, the renderer uses this exact model id, so the
-- user can control which model appears instead of always getting the size-range
-- default.
--
-- Purely additive:
--   - `npm run db:push` alone creates the column with its default ''. Existing
--     rows get modelId = '' (auto), preserving today's behaviour. db:push does
--     NOT need --accept-data-loss for this.
--
-- Idempotent and safe to re-run; there is no data to remap.

BEGIN;

ALTER TABLE "ContentPost"
  ADD COLUMN IF NOT EXISTS "modelId" TEXT NOT NULL DEFAULT '';

COMMIT;
