export type AIConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  structuredOutputMode: "json" | "text";
};
export function loadAIConfig(): AIConfig | null {
  const { AI_BASE_URL, AI_MODEL, AI_API_KEY, AI_OUTPUT_MODE } = process.env;
  if (!AI_BASE_URL && !AI_MODEL && !AI_API_KEY) return null;
  if (!AI_BASE_URL || !AI_MODEL || !AI_API_KEY)
    throw new Error("AI configuration is incomplete.");
  const url = new URL(AI_BASE_URL);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid AI endpoint configuration.");
  if (AI_OUTPUT_MODE && !["json", "text"].includes(AI_OUTPUT_MODE))
    throw new Error("Unsupported AI output mode.");
  return {
    baseUrl: AI_BASE_URL.replace(/\/$/, ""),
    model: AI_MODEL,
    apiKey: AI_API_KEY,
    structuredOutputMode: AI_OUTPUT_MODE === "text" ? "text" : "json",
  };
}
