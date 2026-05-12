import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const configuredUrl = process.env.DATABASE_URL;

if (!configuredUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a SQLite file: URL.");
}

const sqlitePath = configuredUrl.replace(/^file:/, "");
const dbPath = path.isAbsolute(sqlitePath)
  ? sqlitePath
  : path.resolve(process.cwd(), "prisma", sqlitePath);

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug");

  INSERT OR IGNORE INTO "Project" ("id", "name", "slug", "description")
  VALUES (1, 'ILARIA', 'ilaria', 'Comfort-first intimates and shapewear content system');

  CREATE TABLE IF NOT EXISTS "ProjectProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "brandName" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "offers" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "contentPillars" TEXT NOT NULL,
    "currentPriorities" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "monthlyPostCount" INTEGER NOT NULL DEFAULT 30,
    "monthlyStartDate" TEXT NOT NULL DEFAULT '',
    "monthlyEndDate" TEXT NOT NULL DEFAULT '',
    "monthlyCampaignName" TEXT NOT NULL DEFAULT '',
    "monthlyPlatformFocus" TEXT NOT NULL DEFAULT 'BOTH',
    "monthlyProductFocus" TEXT NOT NULL DEFAULT '',
    "monthlyOffers" TEXT NOT NULL DEFAULT '',
    "monthlyPriorities" TEXT NOT NULL DEFAULT '',
    "monthlyMustInclude" TEXT NOT NULL DEFAULT '',
    "monthlyAvoid" TEXT NOT NULL DEFAULT '',
    "logoReferenceUrl" TEXT NOT NULL DEFAULT '',
    "visualFonts" TEXT NOT NULL DEFAULT '',
    "visualColors" TEXT NOT NULL DEFAULT '',
    "productReferenceUrl" TEXT NOT NULL DEFAULT '',
    "bannerReferenceUrl" TEXT NOT NULL DEFAULT '',
    "layoutReferenceNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "ollamaModel" TEXT NOT NULL DEFAULT 'llama3.1:8b',
    "planTextProvider" TEXT NOT NULL DEFAULT 'OLLAMA',
    "planTextModel" TEXT NOT NULL DEFAULT 'llama3.1:8b',
    "copyTextProvider" TEXT NOT NULL DEFAULT 'OLLAMA',
    "copyTextModel" TEXT NOT NULL DEFAULT 'llama3.1:8b',
    "insightsProvider" TEXT NOT NULL DEFAULT 'OLLAMA',
    "insightsModel" TEXT NOT NULL DEFAULT 'llama3.1:8b',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'English',
    "brandVoice" TEXT NOT NULL DEFAULT 'Clear, useful, observant, and concise.',
    "imageProvider" TEXT NOT NULL DEFAULT 'LOCAL_SD_WEBUI',
    "imageModel" TEXT NOT NULL DEFAULT 'segmind/tiny-sd',
    "localImageEndpoint" TEXT NOT NULL DEFAULT 'http://127.0.0.1:7861/sdapi/v1/img2img',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "ContentPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "plannedDate" DATETIME NOT NULL,
    "goal" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'Reel',
    "theme" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "visualConcept" TEXT NOT NULL DEFAULT '',
    "tiktokExecution" TEXT NOT NULL DEFAULT '',
    "instagramExecution" TEXT NOT NULL DEFAULT '',
    "assetLinks" TEXT NOT NULL DEFAULT '',
    "imageFormatKey" TEXT NOT NULL DEFAULT 'reels_tiktok_cover',
    "imageResolution" TEXT NOT NULL DEFAULT '1080x1920',
    "imageStyle" TEXT NOT NULL DEFAULT '',
    "imageObjects" TEXT NOT NULL DEFAULT '',
    "imageImpression" TEXT NOT NULL DEFAULT '',
    "imageReferenceIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "CampaignPacket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "targetPlatform" TEXT NOT NULL,
    "coreAngle" TEXT NOT NULL,
    "hookVariants" TEXT NOT NULL,
    "captionVariants" TEXT NOT NULL,
    "ctaVariants" TEXT NOT NULL,
    "hashtagSet" TEXT NOT NULL,
    "visualBrief" TEXT NOT NULL,
    "imagePromptVariants" TEXT NOT NULL,
    "reviewChecklist" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPacket_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "CampaignPacket_postId_key" ON "CampaignPacket"("postId");

  CREATE TABLE IF NOT EXISTS "GeneratedImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "variant" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedImage_postId_variant_key" ON "GeneratedImage"("postId", "variant");

  CREATE TABLE IF NOT EXISTS "ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "productCategory" TEXT NOT NULL DEFAULT '',
    "colors" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "ImageAsset_projectId_type_idx" ON "ImageAsset"("projectId", "type");
  CREATE INDEX IF NOT EXISTS "ImageAsset_projectId_isActive_idx" ON "ImageAsset"("projectId", "isActive");

  CREATE TABLE IF NOT EXISTS "ReviewResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "reach" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "likes" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL,
    "followerGain" INTEGER NOT NULL,
    "manualVerdict" TEXT NOT NULL,
    "manualNote" TEXT NOT NULL,
    "autoScore" REAL NOT NULL,
    "autoClass" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewResult_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "ReviewResult_postId_key" ON "ReviewResult"("postId");

  CREATE TABLE IF NOT EXISTS "PublishedPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "textPreview" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "profileVisits" INTEGER NOT NULL DEFAULT 0,
    "followerGain" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishedPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  DROP INDEX IF EXISTS "PublishedPost_projectId_postUrl_key";
  CREATE INDEX IF NOT EXISTS "PublishedPost_projectId_publishedAt_idx" ON "PublishedPost"("projectId", "publishedAt");

  CREATE TABLE IF NOT EXISTS "CompetitorPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'COMPETITOR',
    "competitorName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "format" TEXT NOT NULL DEFAULT '',
    "theme" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "visualPattern" TEXT NOT NULL DEFAULT '',
    "offer" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "CompetitorPost_projectId_competitorName_idx" ON "CompetitorPost"("projectId", "competitorName");
  CREATE INDEX IF NOT EXISTS "CompetitorPost_projectId_publishedAt_idx" ON "CompetitorPost"("projectId", "publishedAt");
  CREATE INDEX IF NOT EXISTS "CompetitorPost_projectId_isActive_idx" ON "CompetitorPost"("projectId", "isActive");

  CREATE TABLE IF NOT EXISTS "ThemeRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedNextAngle" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThemeRecommendation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
`);

const profileColumns = db
  .prepare(`PRAGMA table_info("ProjectProfile")`)
  .all()
  .map((column) => String(column.name));

if (!profileColumns.includes("projectId")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "projectId" INTEGER NOT NULL DEFAULT 1;`);
}

if (!profileColumns.includes("visualFonts")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "visualFonts" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("visualColors")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "visualColors" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("productReferenceUrl")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "productReferenceUrl" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("bannerReferenceUrl")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "bannerReferenceUrl" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("layoutReferenceNotes")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "layoutReferenceNotes" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyPostCount")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyPostCount" INTEGER NOT NULL DEFAULT 30;`);
}

if (!profileColumns.includes("monthlyStartDate")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyStartDate" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyEndDate")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyEndDate" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyCampaignName")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyCampaignName" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyPlatformFocus")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyPlatformFocus" TEXT NOT NULL DEFAULT 'BOTH';`);
}

if (!profileColumns.includes("monthlyProductFocus")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyProductFocus" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyOffers")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyOffers" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyPriorities")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyPriorities" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyMustInclude")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyMustInclude" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("monthlyAvoid")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "monthlyAvoid" TEXT NOT NULL DEFAULT '';`);
}

if (!profileColumns.includes("logoReferenceUrl")) {
  db.exec(`ALTER TABLE "ProjectProfile" ADD COLUMN "logoReferenceUrl" TEXT NOT NULL DEFAULT '';`);
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectProfile_projectId_key" ON "ProjectProfile"("projectId");`);

const contentPostColumns = db
  .prepare(`PRAGMA table_info("ContentPost")`)
  .all()
  .map((column) => String(column.name));

if (!contentPostColumns.includes("projectId")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "projectId" INTEGER NOT NULL DEFAULT 1;`);
}

if (!contentPostColumns.includes("format")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'Reel';`);
}

if (!contentPostColumns.includes("visualConcept")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "visualConcept" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("tiktokExecution")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "tiktokExecution" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("instagramExecution")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "instagramExecution" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("assetLinks")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "assetLinks" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("imageFormatKey")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageFormatKey" TEXT NOT NULL DEFAULT 'reels_tiktok_cover';`);
}

if (!contentPostColumns.includes("imageResolution")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageResolution" TEXT NOT NULL DEFAULT '1080x1920';`);
}

if (!contentPostColumns.includes("imageStyle")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageStyle" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("imageObjects")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageObjects" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("imageImpression")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageImpression" TEXT NOT NULL DEFAULT '';`);
}

if (!contentPostColumns.includes("imageReferenceIds")) {
  db.exec(`ALTER TABLE "ContentPost" ADD COLUMN "imageReferenceIds" TEXT NOT NULL DEFAULT '[]';`);
}

db.exec(`CREATE INDEX IF NOT EXISTS "ContentPost_projectId_plannedDate_idx" ON "ContentPost"("projectId", "plannedDate");`);

const publishedPostColumns = db
  .prepare(`PRAGMA table_info("PublishedPost")`)
  .all()
  .map((column) => String(column.name));

if (!publishedPostColumns.includes("capturedAt")) {
  db.exec(`ALTER TABLE "PublishedPost" ADD COLUMN "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
}

db.exec(`
  DROP INDEX IF EXISTS "PublishedPost_projectId_postUrl_key";
  CREATE INDEX IF NOT EXISTS "PublishedPost_projectId_capturedAt_idx" ON "PublishedPost"("projectId", "capturedAt");
`);

const competitorPostColumns = db
  .prepare(`PRAGMA table_info("CompetitorPost")`)
  .all()
  .map((column) => String(column.name));

if (!competitorPostColumns.includes("sourceType")) {
  db.exec(`ALTER TABLE "CompetitorPost" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'COMPETITOR';`);
}

const themeRecommendationColumns = db
  .prepare(`PRAGMA table_info("ThemeRecommendation")`)
  .all()
  .map((column) => String(column.name));

if (!themeRecommendationColumns.includes("projectId")) {
  db.exec(`ALTER TABLE "ThemeRecommendation" ADD COLUMN "projectId" INTEGER NOT NULL DEFAULT 1;`);
}

db.exec(`
  DROP INDEX IF EXISTS "ThemeRecommendation_rank_key";
  CREATE UNIQUE INDEX IF NOT EXISTS "ThemeRecommendation_projectId_rank_key" ON "ThemeRecommendation"("projectId", "rank");
`);

const appSettingsColumns = db
  .prepare(`PRAGMA table_info("AppSettings")`)
  .all()
  .map((column) => String(column.name));

if (!appSettingsColumns.includes("imageProvider")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "imageProvider" TEXT NOT NULL DEFAULT 'LOCAL_SD_WEBUI';`);
}

if (!appSettingsColumns.includes("planTextProvider")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "planTextProvider" TEXT NOT NULL DEFAULT 'OLLAMA';`);
}

if (!appSettingsColumns.includes("planTextModel")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "planTextModel" TEXT NOT NULL DEFAULT 'llama3.1:8b';`);
}

if (!appSettingsColumns.includes("copyTextProvider")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "copyTextProvider" TEXT NOT NULL DEFAULT 'OLLAMA';`);
}

if (!appSettingsColumns.includes("copyTextModel")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "copyTextModel" TEXT NOT NULL DEFAULT 'llama3.1:8b';`);
}

if (!appSettingsColumns.includes("insightsProvider")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "insightsProvider" TEXT NOT NULL DEFAULT 'OLLAMA';`);
}

if (!appSettingsColumns.includes("insightsModel")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "insightsModel" TEXT NOT NULL DEFAULT 'llama3.1:8b';`);
}

if (!appSettingsColumns.includes("imageModel")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "imageModel" TEXT NOT NULL DEFAULT 'segmind/tiny-sd';`);
}

if (!appSettingsColumns.includes("localImageEndpoint")) {
  db.exec(`ALTER TABLE "AppSettings" ADD COLUMN "localImageEndpoint" TEXT NOT NULL DEFAULT 'http://127.0.0.1:7861/sdapi/v1/img2img';`);
}

db.close();

console.log(`SQLite schema initialized at ${dbPath}`);
