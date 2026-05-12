import OpenAI from "openai";
import { AppSettings, ImageAssetType } from "@prisma/client";
import { deflateSync } from "node:zlib";
import { saveBase64Image } from "@/lib/storage";

interface RenderImageInput {
  prompt: string;
  postId: string;
  variant: number;
  settings: AppSettings;
  referenceImages?: RenderReferenceImage[];
  imageFormatKey?: string;
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

export function isImageRenderingConfigured(settings: Pick<AppSettings, "imageProvider" | "localImageEndpoint">) {
  if (settings.imageProvider === "OPENAI") {
    return Boolean(process.env.OPENAI_API_KEY);
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
}: RenderImageInput) {
  const base64 =
    settings.imageProvider === "OPENAI"
      ? await renderWithOpenAI(prompt)
      : await renderWithStableDiffusionWebUi(prompt, settings, referenceImages, imageFormatKey);

  return saveBase64Image({
    base64,
    fileName: `${postId}-variant-${variant}.png`,
  });
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
