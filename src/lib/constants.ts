export const PLATFORM_OPTIONS = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "BOTH", label: "TikTok + Instagram" },
] as const;

export const STATUS_LABELS = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
} as const;

export const STATUS_OPTIONS = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
] as const;

export const MANUAL_VERDICTS = [
  { value: "WORKED", label: "Worked" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "MISSED", label: "Missed" },
] as const;

export const AUTO_CLASS_LABELS = {
  WEAK: "Weak",
  NORMAL: "Normal",
  STRONG: "Strong",
} as const;

export const GOAL_LIBRARY = [
  "Follower growth",
  "Lead generation",
  "Brand recall",
  "Engagement lift",
  "Product education",
];

export const OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";

export const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
