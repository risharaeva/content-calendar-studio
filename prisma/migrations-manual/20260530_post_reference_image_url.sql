-- Migration: add ContentPost.referenceImageUrl (style reference for generation)
--
-- New schema bit:
--   - ContentPost.referenceImageUrl String @default("")
--
-- This holds a URL to a visual reference image the user wants to mimic in style
-- (pasted URL or an uploaded image). At render time, when set, a vision model
-- (gpt-4o) describes the reference and that style brief is injected into the
-- image prompts so generated images echo its look — the garment still comes from
-- the post's selected product.
--
-- Purely additive:
--   - `npm run db:push` alone creates the column with its default ''. Existing
--     rows get referenceImageUrl = '' (no reference), preserving today's behaviour.
--     db:push does NOT need --accept-data-loss for this.
--
-- Idempotent and safe to re-run; there is no data to remap.

BEGIN;

ALTER TABLE "ContentPost"
  ADD COLUMN IF NOT EXISTS "referenceImageUrl" TEXT NOT NULL DEFAULT '';

COMMIT;
