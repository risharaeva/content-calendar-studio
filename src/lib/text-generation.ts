import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AppSettings } from "@prisma/client";
import { generateJsonFromOllama } from "@/lib/ollama";

type TextTask = "plan" | "copy" | "insights";
type TextProvider = "OLLAMA" | "OPENAI" | "ANTHROPIC";

interface TextRoute {
  provider: TextProvider;
  model: string;
}

export function getTextRoute(settings: AppSettings, task: TextTask): TextRoute {
  const dbProvider =
    task === "copy"
      ? settings.copyTextProvider
      : task === "insights"
        ? settings.insightsProvider
        : settings.planTextProvider;
  const dbModel =
    task === "copy"
      ? settings.copyTextModel
      : task === "insights"
        ? settings.insightsModel
        : settings.planTextModel;

  return resolveTextRoute(dbProvider, dbModel, settings.ollamaModel);
}

// Resolves the effective text provider/model. Priority:
//   1. TEXT_PROVIDER / TEXT_MODEL env vars — explicit override, no UI or DB write.
//   2. The per-task provider saved in settings, when it names a hosted provider.
//   3. If settings still say OLLAMA (the default) but an OPENAI_API_KEY is present,
//      prefer OpenAI so hosted deploys (e.g. Vercel) generate real copy instead of
//      failing to reach a local-only Ollama and silently falling back to templates.
//   4. Otherwise Ollama (local dev with no hosted key).
// The Advanced settings UI that used to edit these was intentionally removed, so
// env vars + this key-aware default are how the provider is selected now.
function resolveTextRoute(dbProvider: string, dbModel: string, ollamaModel: string): TextRoute {
  const envProvider = normalizeProviderOrNull(process.env.TEXT_PROVIDER);
  const envModel = process.env.TEXT_MODEL?.trim() || "";

  if (envProvider) {
    return { provider: envProvider, model: envModel || defaultModelFor(envProvider, dbModel, ollamaModel) };
  }

  const provider = normalizeProvider(dbProvider);
  if (provider !== "OLLAMA") {
    return { provider, model: dbModel || defaultModelFor(provider, dbModel, ollamaModel) };
  }

  if (process.env.OPENAI_API_KEY) {
    return { provider: "OPENAI", model: envModel || "gpt-4o-mini" };
  }

  return { provider: "OLLAMA", model: dbModel || ollamaModel };
}

function defaultModelFor(provider: TextProvider, dbModel: string, ollamaModel: string): string {
  if (provider === "OPENAI") {
    return "gpt-4o-mini";
  }
  if (provider === "ANTHROPIC") {
    return dbModel || "claude-3-5-haiku-latest";
  }
  return dbModel || ollamaModel || "llama3.1:8b";
}

function normalizeProviderOrNull(value: string | undefined): TextProvider | null {
  if (!value) {
    return null;
  }
  const upper = value.trim().toUpperCase();
  if (upper === "OPENAI" || upper === "ANTHROPIC" || upper === "OLLAMA") {
    return upper;
  }
  return null;
}

export async function generateJsonWithTextRoute<T>({
  settings,
  task,
  prompt,
}: {
  settings: AppSettings;
  task: TextTask;
  prompt: string;
}) {
  const route = getTextRoute(settings, task);

  if (route.provider === "OPENAI") {
    return generateJsonFromOpenAI<T>(route.model, prompt);
  }

  if (route.provider === "ANTHROPIC") {
    return generateJsonFromAnthropic<T>(route.model, prompt);
  }

  return generateJsonFromOllama<T>({
    model: route.model || settings.ollamaModel,
    prompt,
  });
}

export function isProviderConfigured(provider: string) {
  const normalized = normalizeProvider(provider);

  if (normalized === "OPENAI") {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  if (normalized === "ANTHROPIC") {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  return true;
}

// Sampling temperature applied to hosted providers. Set deliberately high so the
// copy reads varied and human instead of falling into the model's most-likely
// (most generic) phrasing. The anti-cliché style guard in the prompt does the
// heavy lifting; this just widens the lane.
const TEXT_TEMPERATURE = 0.85;

// Some OpenAI models (the reasoning o-series and similar) reject any temperature
// other than the default and 400 on it. Detect that specific failure so we can
// transparently retry without the param instead of silently falling back to the
// deterministic local strategy.
function isUnsupportedTemperatureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /temperature/i.test(message) && /(unsupported|not supported|does not support|only the default|must be)/i.test(message);
}

async function generateJsonFromOpenAI<T>(model: string, prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Choose Ollama, or add an OpenAI key to use GPT text generation.");
  }

  const client = new OpenAI({ apiKey });
  const input = `${prompt}\n\nReturn valid JSON only. No markdown.`;

  let response;
  try {
    response = await client.responses.create({ model, input, temperature: TEXT_TEMPERATURE });
  } catch (error) {
    if (!isUnsupportedTemperatureError(error)) {
      throw error;
    }
    response = await client.responses.create({ model, input });
  }

  const outputText = response.output_text;

  if (!outputText) {
    throw new Error("OpenAI returned an empty text response.");
  }

  return parseJsonOutput<T>(outputText);
}

async function generateJsonFromAnthropic<T>(model: string, prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Choose Ollama, or add an Anthropic key to use Claude text generation.");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: TEXT_TEMPERATURE,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\nReturn valid JSON only. No markdown.`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned an empty text response.");
  }

  return parseJsonOutput<T>(text);
}

function parseJsonOutput<T>(value: string) {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence) as T;
}

function normalizeProvider(provider: string): TextProvider {
  if (provider === "OPENAI" || provider === "ANTHROPIC") {
    return provider;
  }

  return "OLLAMA";
}
