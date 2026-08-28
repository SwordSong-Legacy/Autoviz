/**
 * OpenRouter models that support vision (image recognition).
 * Used for chart annotation and other multimodal tasks.
 */

export const VISION_MODELS = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (Anthropic)" },
  { id: "anthropic/claude-3-opus", label: "Claude 3 Opus (Anthropic)" },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Google)" },
  { id: "google/gemini-pro-vision", label: "Gemini Pro Vision (Google)" },
  { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (Google)" },
] as const;

export const DEFAULT_VISION_MODEL = "anthropic/claude-3.5-sonnet";

export const LLM_CONFIG_KEYS = {
  API_KEY: "openrouter_api_key",
  MODEL: "ai_model",
} as const;
