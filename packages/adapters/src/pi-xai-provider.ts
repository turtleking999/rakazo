import type { Api, Model, MutableModels } from "@earendil-works/pi-ai";
import { createProvider } from "@earendil-works/pi-ai";

export const XAI_FAST_MODEL_ID = "grok-4.7-build-fast";
export const XAI_FAST_MODEL_ALIAS = "grok-4.7-fast";

/**
 * Normalizes xAI model aliases so callers requesting "grok-4.7-fast" resolve to
 * the official API model id "grok-4.7-build-fast".
 */
export function normalizeXaiModelId(modelId: string): string {
  const clean = modelId.trim();
  if (clean === XAI_FAST_MODEL_ALIAS || clean === `${XAI_FAST_MODEL_ALIAS}-latest`) {
    return XAI_FAST_MODEL_ID;
  }
  return clean;
}

/**
 * Augment the built-in xAI provider with the Grok 4.7 Fast variant.
 * Grok CLI and Cursor connect to this variant via "grok-4.7-build-fast";
 * xAI's responses endpoint supports it directly under SuperGrok / X Premium OAuth.
 */
export function registerXaiFastModels(models: MutableModels): MutableModels {
  if (typeof models?.getProvider !== "function" || typeof models?.setProvider !== "function") {
    return models;
  }
  const xai = models.getProvider("xai");
  if (!xai || typeof xai.getModels !== "function") return models;
  const existing = xai.getModels();
  if (existing.some((model) => model.id === XAI_FAST_MODEL_ID)) return models;
  const baseModel =
    existing.find((model) => model.id === "grok-4.7") ?? existing[existing.length - 1];
  if (!baseModel) return models;

  const fastModel: Model<Api> = {
    ...baseModel,
    id: XAI_FAST_MODEL_ID,
    name: "Grok 4.7 Fast",
    cost: {
      input: 4,
      output: 12,
      cacheRead: 1,
      cacheWrite: 0,
      tiers: [
        {
          inputTokensAbove: 200000,
          input: 8,
          output: 24,
          cacheRead: 2,
          cacheWrite: 0,
        },
      ],
    },
  };

  const augmented = createProvider({
    id: xai.id,
    name: xai.name,
    baseUrl: xai.baseUrl,
    headers: xai.headers,
    auth: xai.auth,
    models: [...existing, fastModel],
    api: xai,
  });
  models.setProvider(augmented);
  return models;
}
