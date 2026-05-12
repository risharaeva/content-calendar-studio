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
  if (task === "copy") {
    return {
      provider: normalizeProvider(settings.copyTextProvider),
      model: settings.copyTextModel,
    };
  }

  if (task === "insights") {
    return {
      provider: normalizeProvider(settings.insightsProvider),
      model: settings.insightsModel,
    };
  }

  return {
    provider: normalizeProvider(settings.planTextProvider),
    model: settings.planTextModel,
  };
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

async function generateJsonFromOpenAI<T>(model: string, prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Choose Ollama, or add an OpenAI key to use GPT text generation.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    input: `${prompt}\n\nReturn valid JSON only. No markdown.`,
  });

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
