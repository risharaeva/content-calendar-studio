-- Run this on Supabase before `npm run db:push -- --accept-data-loss`.
-- It preserves existing rows while moving the enum to the manual workflow labels.

BEGIN;

ALTER TYPE "PostStatus" RENAME VALUE 'PACKET_READY' TO 'IN_PROGRESS';
ALTER TYPE "PostStatus" RENAME VALUE 'REVIEWED' TO 'DONE';

COMMIT;
