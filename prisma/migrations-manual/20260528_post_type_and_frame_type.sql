-- Migration: introduce PostType and FrameType axes
--
-- New schema bits:
--   - enum PostType  { VIDEO, CAROUSEL, BANNER }
--   - enum FrameType { WITH_PERSON, PRODUCT_ONLY, USEFUL, OTHER }
--   - ContentPost.postType         PostType  @default(VIDEO)
--   - ContentPost.defaultFrameType FrameType @default(WITH_PERSON)
--   - ContentPost.frameDescription String    @default("")
--   - CampaignPacket.videoScript    String   @default("")
--   - CampaignPacket.carouselSlides String   @default("[]")
--   - CampaignPacket.bannerBrief    String   @default("")
--
-- Order of operations:
--   1. Run `npm run db:push` first. Prisma will create the new enums and add
--      the new columns with their default values. Existing rows therefore
--      end up with postType = 'VIDEO' and defaultFrameType = 'WITH_PERSON'
--      regardless of what their old `format` / `imageFormatKey` actually
--      meant. db:push will NOT need --accept-data-loss; this is additive.
--   2. Then run this file on Supabase. It walks the existing rows and
--      remaps `postType` and `defaultFrameType` based on the old `format`
--      and `imageFormatKey` columns, so the calendar reads correctly.
--
-- Safe to re-run: every UPDATE only touches rows that still carry the
-- default value, so manual edits made after the migration are preserved.

BEGIN;

-- PostType inference from the free-text `format` column.
-- Old values seen in the codebase: Reel, Carousel, Editorial graphic,
-- Product banner, Collage, Offer banner. Reel -> VIDEO is the default,
-- so we only need to bump the others.
UPDATE "ContentPost"
   SET "postType" = 'CAROUSEL'
 WHERE "postType" = 'VIDEO'
   AND LOWER("format") LIKE '%carousel%';

UPDATE "ContentPost"
   SET "postType" = 'BANNER'
 WHERE "postType" = 'VIDEO'
   AND (
        LOWER("format") LIKE '%banner%'
     OR LOWER("format") LIKE '%collage%'
     OR LOWER("format") LIKE '%editorial%'
     OR LOWER("format") LIKE '%graphic%'
     OR LOWER("format") LIKE '%static%'
   );

-- FrameType inference from the old `imageFormatKey` enum-ish column.
-- Default is WITH_PERSON, so we only need to bump the obvious non-person
-- and infographic-shaped templates.
UPDATE "ContentPost"
   SET "defaultFrameType" = 'PRODUCT_ONLY'
 WHERE "defaultFrameType" = 'WITH_PERSON'
   AND "imageFormatKey" IN ('product_still', 'offer_banner');

UPDATE "ContentPost"
   SET "defaultFrameType" = 'USEFUL'
 WHERE "defaultFrameType" = 'WITH_PERSON'
   AND "imageFormatKey" IN ('graphic_collage');

-- WITH_PERSON is correct for the remaining cases:
-- 'reels_tiktok_cover', 'carousel', 'product_on_body', and any custom keys
-- entered by hand. No UPDATE needed for those.

COMMIT;
