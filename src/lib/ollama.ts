import { DEFAULT_OLLAMA_MODEL, OLLAMA_ENDPOINT } from "@/lib/constants";

export class OllamaUnavailableError extends Error {
  constructor(message = "Ollama is unavailable. Start Ollama and make sure the selected model is installed.") {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

export async function getOllamaStatus(model = DEFAULT_OLLAMA_MODEL) {
  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: "Respond with the single word ready.",
        stream: false,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function generateJsonFromOllama<T>({
  model,
  prompt,
}: {
  model?: string;
  prompt: string;
}) {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    response = await fetch(OLLAMA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model ?? DEFAULT_OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json",
      }),
    });
  } catch {
    throw new OllamaUnavailableError();
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new OllamaUnavailableError(errorText || "Ollama returned an error.");
  }

  const payload = (await response.json()) as { response?: string };

  if (!payload.response) {
    throw new Error("Ollama returned an empty response.");
  }

  return JSON.parse(payload.response) as T;
}
