import { google } from "@ai-sdk/google";

/** Default Gemini model used when a conversation has no model override. */
export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";

/**
 * Returns a Google Gemini language model instance for chat completions.
 *
 * @param modelId - Optional model identifier; falls back to {@link DEFAULT_CHAT_MODEL}.
 */
export function getChatModel(modelId?: string | null) {
    return google(modelId || DEFAULT_CHAT_MODEL)
}
