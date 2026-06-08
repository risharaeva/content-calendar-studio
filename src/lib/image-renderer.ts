import OpenAI from "openai";
import { AppSettings, ImageAssetType } from "@prisma/client";
import { deflateSync } from "node:zlib";
import { saveBase64Image } from "@/lib/storage";
import {
  type ShootStudioProduct,
  defaultModelForProduct,
  fetchShootStudioCatalog,
  findShootStudioModel,
  findShootStudioProduct,
  inferShootStudioColor,
  inferShootStudioProduct,
} from "@/lib/shoot-studio-catalog";

interface RenderImageInput {
  prompt: string;
  postId: string;
  variant: number;
  settings: AppSettings;
  referenceImages?: RenderReferenceImage[];
  imageFormatKey?: string;
  productId?: string;
  modelId?: string;
}

interface RenderReferenceImage {
  name: string;
  sourcePath: string;
  type: ImageAssetType;
}

interface StableDiffusionResponse {
  images?: string[];
}

const LOCAL_IMAGE_WIDTH = 768;
const LOCAL_IMAGE_HEIGHT = 1024;
const DEFAULT_SHOOT_STUDIO_URL = "https://ilaria-fitting-room.vercel.app";

export function isImageRenderingConfigured(settings: Pick<AppSettings, "imageProvider" | "localImageEndpoint">) {
  if (settings.imageProvider === "OPENAI") {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  if (settings.imageProvider === "SHOOT_STUDIO") {
    return Boolean(process.env.SHOOT_STUDIO_API_URL ?? settings.localImageEndpoint ?? DEFAULT_SHOOT_STUDIO_URL);
  }

  return Boolean(settings.localImageEndpoint);
}

export async function renderPromptToImage({
  prompt,
  postId,
  variant,
  settings,
  referenceImages = [],
  imageFormatKey = "",
  productId = "",
  modelId = "",
}: RenderImageInput) {
  if (settings.imageProvider === "SHOOT_STUDIO") {
    return renderWithShootStudio(prompt, settings, imageFormatKey, productId, modelId);
  }

  const base64 = settings.imageProvider === "OPENAI"
    ? await renderWithOpenAI(prompt)
    : await renderWithStableDiffusionWebUi(prompt, settings, referenceImages, imageFormatKey);

  return saveBase64Image({
    base64,
    fileName: `${postId}-variant-${variant}.png`,
  });
}

async function renderWithShootStudio(
  prompt: string,
  settings: AppSettings,
  imageFormatKey: string,
  productId: string,
  modelId: string,
) {
  const baseUrl = normalizeShootStudioUrl(process.env.SHOOT_STUDIO_API_URL ?? settings.localImageEndpoint);

  // Pull the live catalog (falls back to the bundled snapshot) so explicit
  // product ids always resolve against the same roster Shoot Studio renders from.
  const catalog = await fetchShootStudioCatalog(baseUrl);

  // Prefer the explicitly selected product. Only guess from prompt text when no
  // product was chosen for the post (the "Авто по товару" preference relies on a
  // real product id; inference is the legacy fallback).
  const product =
    findShootStudioProduct(productId, catalog.products) ??
    inferShootStudioProduct(prompt, catalog.products);

  const color = inferShootStudioColor(prompt, product);
  // Use the explicitly chosen model when the post pins one; otherwise auto-select
  // it from the product's size range (the legacy default).
  const model = findShootStudioModel(modelId, catalog.models) ?? defaultModelForProduct(product, catalog.models);
  const finalPrompt = buildShootStudioPrompt(prompt, product, color, imageFormatKey);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.SHOOT_STUDIO_API_KEY) {
    headers.Authorization = `Bearer ${process.env.SHOOT_STUDIO_API_KEY}`;
  }

  const response = await fetch(`${baseUrl}/api/shoots/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: finalPrompt,
      finalPrompt,
      product,
      model,
      color,
      aspectRatio: aspectRatioForFormat(imageFormatKey),
      generationSettings: {
        provider: process.env.SHOOT_STUDIO_PROVIDER ?? "fal",
        falModel: settings.imageModel || process.env.SHOOT_STUDIO_FAL_MODEL || "fal-ai/nano-banana-2/edit",
        falResolution: process.env.SHOOT_STUDIO_FAL_RESOLUTION ?? "2K",
        openAiModel: process.env.SHOOT_STUDIO_OPENAI_MODEL ?? "gpt-image-1.5",
        openAiQuality: process.env.SHOOT_STUDIO_OPENAI_QUALITY ?? "medium",
        openAiSize: sizeForFormat(imageFormatKey),
        outputFormat: "jpeg",
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as { shoot?: { imageUrls?: string[] }; error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error || `ILARIA Shoot Studio did not generate an image. HTTP ${response.status}`);
  }

  const imageUrl = payload?.shoot?.imageUrls?.[0];

  if (!imageUrl) {
    throw new Error("ILARIA Shoot Studio returned no image URL.");
  }

  return /^https?:\/\//i.test(imageUrl) ? imageUrl : `${baseUrl}${imageUrl}`;
}

function normalizeShootStudioUrl(rawUrl: string) {
  const url = (rawUrl || DEFAULT_SHOOT_STUDIO_URL).trim() || DEFAULT_SHOOT_STUDIO_URL;
  const withoutGeneratePath = url.replace(/\/api\/shoots\/generate\/?$/i, "");
  return withoutGeneratePath.replace(/\/$/, "");
}

function buildShootStudioPrompt(prompt: string, product: ShootStudioProduct, color: string, imageFormatKey: string) {
  return [
    "Create one finished photorealistic social-commerce image for ILARIA Intimates.",
    "Adult woman 30+, tasteful premium ecommerce/editorial mood, catalog-safe lingerie and shapewear context.",
    `Product: ${product.name} in ${color}. Preserve exact garment truth from stored product references: ${product.prompt}.`,
    `Product purpose: ${product.fitPromise}`,
    `Format direction: ${labelFormatForShootStudio(imageFormatKey)}.`,
    `Creative direction from Content Calendar: ${prompt}`,
    "Keep the product clearly readable, naturally worn, realistic fabric texture, natural skin texture, warm refined lighting.",
    "No text, no watermark, no logo overlay, no collage, no explicit pose, no plastic skin, no invented garment shape, color, straps, seams, lace, or hardware.",
  ].join("\n");
}

function labelFormatForShootStudio(imageFormatKey: string) {
  if (imageFormatKey === "reels_tiktok_cover") return "vertical 9:16 Reels/TikTok cover with clear first-frame composition and negative space for later typography";
  if (imageFormatKey === "offer_banner") return "4:5 or 1:1 offer banner base image with readable negative space, no text baked into the image";
  if (imageFormatKey === "product_still") return "product-only still life; do not add a person unless explicitly requested";
  if (imageFormatKey === "product_on_body") return "product-on-body visual; the selected product must be worn by the model";
  if (imageFormatKey === "graphic_collage") return "editorial graphic/collage base image, still coherent and photorealistic";
  return "Instagram 4:5 social image";
}

function aspectRatioForFormat(imageFormatKey: string) {
  if (imageFormatKey === "reels_tiktok_cover") return "9:16";
  if (imageFormatKey === "product_still") return "1:1";
  return "3:4";
}

function sizeForFormat(imageFormatKey: string) {
  if (imageFormatKey === "reels_tiktok_cover") return "1024x1536";
  if (imageFormatKey === "product_still") return "1024x1024";
  return "1024x1536";
}

async function renderWithOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Switch image provider to Local, or add a key to use GPT image generation.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: "gpt-5.5",
    input: prompt,
    tools: [{ type: "image_generation" }],
  });

  const imageData = response.output
    .filter((output) => output.type === "image_generation_call")
    .map((output) => output.result)
    .filter((result): result is string => typeof result === "string" && result.length > 0);

  if (!imageData.length) {
    throw new Error("OpenAI did not return an image payload.");
  }

  return imageData[0];
}

async function renderWithStableDiffusionWebUi(
  prompt: string,
  settings: AppSettings,
  referenceImages: RenderReferenceImage[],
  imageFormatKey: string,
) {
  const img2img = settings.localImageEndpoint.includes("/img2img");
  const referenceBase64 = img2img ? await findInitReferenceImage(referenceImages, imageFormatKey) : null;
  const response = await fetch(settings.localImageEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      img2img
        ? {
            prompt,
            negative_prompt:
              "low quality, blurry, distorted hands, distorted face, harsh compression, body shaming, text artifacts, watermark",
            init_images: [referenceBase64 ?? createNeutralInitImage()],
            steps: 24,
            width: LOCAL_IMAGE_WIDTH,
            height: LOCAL_IMAGE_HEIGHT,
            cfg_scale: 6.5,
            denoising_strength: referenceBase64 ? denoiseForFormat(imageFormatKey) : 0.82,
            batch_size: 1,
            n_iter: 1,
          }
        : {
            prompt,
            negative_prompt:
              "low quality, blurry, distorted hands, distorted face, harsh compression, body shaming, text artifacts, watermark",
            steps: 24,
            width: 1024,
            height: 1024,
            batch_size: 1,
            n_iter: 1,
            sampler_name: "DPM++ 2M Karras",
            override_settings: {
              sd_model_checkpoint: settings.imageModel,
            },
          },
    ),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText ||
        "Local image server did not render the image. Check that your Stable Diffusion WebUI-compatible server is running.",
    );
  }

  const payload = (await response.json()) as StableDiffusionResponse;
  const image = payload.images?.[0];

  if (!image) {
    throw new Error("Local image server returned no image.");
  }

  return image;
}

async function findInitReferenceImage(referenceImages: RenderReferenceImage[], imageFormatKey: string) {
  const candidates = rankReferenceImages(referenceImages, imageFormatKey);

  for (const candidate of candidates) {
    const image = await readReferenceImage(candidate.sourcePath);

    if (image) {
      return image;
    }
  }

  return null;
}

function rankReferenceImages(referenceImages: RenderReferenceImage[], imageFormatKey: string) {
  if (imageFormatKey === "product_still") {
    return referenceImages.filter((image) => image.type === "PRODUCT");
  }

  if (imageFormatKey === "product_on_body") {
    return [
      ...referenceImages.filter((image) => image.type === "PRODUCT_ON_BODY"),
      ...referenceImages.filter((image) => image.type === "PRODUCT"),
    ];
  }

  if (imageFormatKey === "offer_banner" || imageFormatKey === "graphic_collage") {
    return [
      ...referenceImages.filter((image) => image.type === "BANNER_REFERENCE"),
      ...referenceImages.filter((image) => image.type === "STYLE_REFERENCE"),
      ...referenceImages.filter((image) => image.type === "BACKGROUND"),
    ];
  }

  return [
    ...referenceImages.filter((image) => image.type === "PRODUCT_ON_BODY"),
    ...referenceImages.filter((image) => image.type === "STYLE_REFERENCE"),
    ...referenceImages.filter((image) => image.type === "PRODUCT"),
  ];
}

function denoiseForFormat(imageFormatKey: string) {
  if (imageFormatKey === "product_still") {
    return 0.42;
  }

  if (imageFormatKey === "product_on_body") {
    return 0.58;
  }

  if (imageFormatKey === "offer_banner" || imageFormatKey === "graphic_collage") {
    return 0.62;
  }

  return 0.7;
}

async function readReferenceImage(sourcePath: string) {
  try {
    if (/^https?:\/\//i.test(sourcePath)) {
      const response = await fetch(sourcePath, {
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (!contentType.startsWith("image/")) {
        return null;
      }

      return Buffer.from(await response.arrayBuffer()).toString("base64");
    }

    const localPath = normalizeLocalPath(sourcePath);

    if (!localPath) {
      return null;
    }

    const fs = await import("node:fs");

    if (!fs.existsSync(/* turbopackIgnore: true */ localPath)) {
      return null;
    }

    const filePath = fs.statSync(/* turbopackIgnore: true */ localPath).isDirectory() ? findFirstImageFile(localPath, fs) : localPath;

    if (!filePath || !isSupportedImagePath(filePath)) {
      return null;
    }

    return fs.readFileSync(/* turbopackIgnore: true */ filePath).toString("base64");
  } catch (error) {
    console.warn("Reference image could not be loaded.", error);
    return null;
  }
}

function normalizeLocalPath(sourcePath: string) {
  const trimmed = sourcePath.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("~/")) {
    return `${process.env.HOME ?? ""}/${trimmed.slice(2)}`;
  }

  return trimmed;
}

function findFirstImageFile(directory: string, fs: typeof import("node:fs")) {
  const root = directory.replace(/\/$/, "");

  return fs.readdirSync(/* turbopackIgnore: true */ directory)
    .map((fileName) => `${root}/${fileName}`)
    .filter((filePath) => {
      try {
        return fs.statSync(/* turbopackIgnore: true */ filePath).isFile() && isSupportedImagePath(filePath);
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b))[0] ?? "";
}

function isSupportedImagePath(filePath: string) {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function createNeutralInitImage() {
  const bytesPerPixel = 3;
  const raw = Buffer.alloc((LOCAL_IMAGE_WIDTH * bytesPerPixel + 1) * LOCAL_IMAGE_HEIGHT);

  for (let y = 0; y < LOCAL_IMAGE_HEIGHT; y += 1) {
    const rowStart = y * (LOCAL_IMAGE_WIDTH * bytesPerPixel + 1);
    raw[rowStart] = 0;

    for (let x = 0; x < LOCAL_IMAGE_WIDTH; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      const grain = ((x * 13 + y * 17) % 19) - 9;
      const warmth = Math.round(236 + (y / LOCAL_IMAGE_HEIGHT) * 10 + grain);
      const blush = Math.round(226 + (x / LOCAL_IMAGE_WIDTH) * 8 + grain);
      const shadow = Math.round(214 + ((x + y) / (LOCAL_IMAGE_WIDTH + LOCAL_IMAGE_HEIGHT)) * 14 + grain);

      raw[offset] = clampByte(warmth);
      raw[offset + 1] = clampByte(blush);
      raw[offset + 2] = clampByte(shadow);
    }
  }

  return encodePngRgb(LOCAL_IMAGE_WIDTH, LOCAL_IMAGE_HEIGHT, raw).toString("base64");
}

function encodePngRgb(width: number, height: number, rawScanlines: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rawScanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, value));
}
